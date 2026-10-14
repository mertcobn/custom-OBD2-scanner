import { expect, test, type Page } from '@playwright/test';

/**
 * The connect sheet must not flicker while the browser's device picker is open or when a connection fails:
 * no jump to the progress view and back, no flash of the empty chooser, no closing and re-opening.
 */

type Mode = 'cancel' | 'gattFail' | 'serialBusy';

async function setup(page: Page, mode: Mode) {
  await page.addInitScript((mode) => {
    localStorage.setItem('shindan.settings', JSON.stringify({ state: { language: 'tr', theme: 'light' }, version: 1 }));
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const pickerMs = 700; // the user looking at Chrome's picker
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        getAvailability: async () => true,
        requestDevice: async () => {
          await wait(pickerMs);
          if (mode === 'cancel') throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
          return {
            name: 'OBDII',
            addEventListener() {},
            gatt: {
              connect: async () => {
                await wait(50);
                throw new DOMException('Connection failed for unknown reason.', 'NetworkError');
              },
            },
          };
        },
      },
    });
    const port = {
      getInfo: () => ({}),
      open: async () => {
        throw new DOMException('Failed to open serial port.', 'NetworkError');
      },
      close: async () => {},
      readable: null,
      writable: null,
    };
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        requestPort: async () => {
          await wait(pickerMs);
          return port;
        },
        getPorts: async () => [],
      },
    });

    // Timeline of what the sheet shows.
    const timeline: string[] = [];
    (window as unknown as { __timeline: string[] }).__timeline = timeline;
    const snap = () => {
      const d = document.querySelector('dialog[open]');
      const view = d?.querySelector('[data-connect-view]')?.getAttribute('data-connect-view');
      const err = d?.querySelector('[role="note"][data-error]') ? '+error' : '';
      const s = d ? `${view ?? '?'}${err}` : 'closed';
      if (timeline[timeline.length - 1] !== s) timeline.push(s);
    };
    new MutationObserver(snap).observe(document, { subtree: true, childList: true, attributes: true });
  }, mode);
  await page.goto('/');
  await page.getByRole('button', { name: 'Bağlantı', exact: true }).first().click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
}

const timeline = (page: Page) => page.evaluate(() => (window as unknown as { __timeline: string[] }).__timeline.filter((s) => s !== 'closed'));

test('cancelling the device picker keeps the chooser steady', async ({ page }) => {
  await setup(page, 'cancel');
  const before = (await timeline(page)).length;
  await page.getByRole('button', { name: 'Bluetooth ile bağlan' }).click();
  await page.waitForTimeout(1200);
  const t = (await timeline(page)).slice(before - 1);
  expect(t).toEqual(['choose']);
  await expect(page.getByRole('button', { name: 'Bluetooth ile bağlan' })).toBeEnabled();
});

for (const [mode, button] of [
  ['gattFail', 'Bluetooth ile bağlan'],
  ['serialBusy', 'Klasik Bluetooth / USB (seri port)'],
] as const) {
  test(`failed connection (${mode}): chooser → progress → error, once, no flicker`, async ({ page, isMobile }) => {
    test.skip(isMobile && mode === 'serialBusy', 'serial is desktop only');
    await setup(page, mode);
    await page.getByRole('button', { name: button }).click();
    await expect(page.locator('[role="note"][data-error]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    expect(await timeline(page)).toEqual(['choose', 'progress', 'choose+error']);

    // Trying again from the error must not flash the empty chooser.
    const before = (await timeline(page)).length;
    await page.getByRole('button', { name: button }).click();
    await expect(page.locator('[data-connect-view="progress"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[role="note"][data-error]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    expect((await timeline(page)).slice(before)).toEqual(['progress', 'choose+error']);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
  });
}
