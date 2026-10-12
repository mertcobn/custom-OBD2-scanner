import { expect, test, type Locator, type Page } from '@playwright/test';

/** Horizontal centre of the actually painted glyphs (ignores trailing letter-spacing). */
async function glyphCenter(loc: Locator): Promise<number> {
  return loc.evaluate((el) => {
    const range = document.createRange();
    let left = Infinity;
    let right = -Infinity;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      for (let i = 0; i < node.length; i++) {
        if (!node.data[i]!.trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        // Exclude the letter-spacing that follows each glyph.
        const spacing = parseFloat(getComputedStyle(node.parentElement!).letterSpacing) || 0;
        left = Math.min(left, r.left);
        right = Math.max(right, r.right - spacing);
      }
    }
    return (left + right) / 2;
  });
}

async function boxCenter(loc: Locator) {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function noHorizontalOverflow(page: Page, where: string) {
  // Compare against the device width: mobile browsers silently widen the layout viewport when content overflows.
  const device = page.viewportSize()!.width;
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(inner, `${where}: layout viewport was widened`).toBe(device);
  expect(scroll, `${where}: page wider than the screen`).toBeLessThanOrEqual(device);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('shindan.settings'))
      localStorage.setItem('shindan.settings', JSON.stringify({ state: { language: 'tr', theme: 'light', analytics: false }, version: 1 }));
  });
});

test('welcome screen is centred to the pixel', async ({ page }) => {
  await page.goto('/');
  const ring = await boxCenter(page.getByTestId('enso-ring'));
  const sun = await boxCenter(page.getByTestId('hinomaru'));
  expect(Math.abs(ring.x - sun.x), 'sun vs ring (x)').toBeLessThanOrEqual(1);
  expect(Math.abs(ring.y - sun.y), 'sun vs ring (y)').toBeLessThanOrEqual(1);

  const card = await boxCenter(page.locator('section.card').first());
  for (const [name, loc] of [
    ['title', page.getByRole('heading', { name: 'Shindan', level: 1 })],
    ['kanji', page.getByTestId('welcome-kanji')],
    ['tagline', page.getByText('Bluetooth OBD2 teşhis')],
  ] as const) {
    expect(Math.abs((await glyphCenter(loc)) - card.x), `${name} not centred`).toBeLessThanOrEqual(1.5);
  }
  expect(Math.abs(sun.x - card.x), 'sun not centred in card').toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-layout-welcome.png` });
});

test('no page is wider than the screen', async ({ page }) => {
  await page.goto('/');
  await noHorizontalOverflow(page, 'welcome');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.waitForTimeout(800);
  await noHorizontalOverflow(page, 'dashboard');
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-layout-dashboard.png` });
  for (const [link, name] of [
    ['Canlı veri', 'live'],
    ['Arıza', 'dtc'],
    ['Kayıt', 'record'],
    ['Araç', 'vehicle'],
  ] as const) {
    await page.getByRole('link', { name: link }).first().click();
    await page.waitForTimeout(700);
    await noHorizontalOverflow(page, name);
    await page.screenshot({ path: `test-results/screens/${test.info().project.name}-layout-${name}.png`, fullPage: true });
  }
  await page.goto('/settings');
  await noHorizontalOverflow(page, 'settings');
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-layout-settings.png`, fullPage: true });
});

test('connect sheet fits and is centred', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Adaptöre bağlan' }).click();
  const sheet = page.locator('dialog[open] .card');
  await expect(sheet).toBeVisible();
  const b = (await sheet.boundingBox())!;
  const vw = page.viewportSize()!.width;
  if (vw < 640) {
    // Phones: the sheet spans the full width exactly — no offset, no overflow.
    expect(Math.abs(b.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.x + b.width - vw)).toBeLessThanOrEqual(0.5);
  } else {
    // Larger screens: a centred dialog.
    expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-layout-connect.png` });
});

test('gauge text stays inside the ring', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.waitForTimeout(1200);
  const gauges = page.locator('figure');
  const n = await gauges.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    const fig = (await gauges.nth(i).boundingBox())!;
    const cap = (await gauges.nth(i).locator('figcaption').boundingBox())!;
    // Inner free circle of the ring ≈ 72 % of the gauge; the caption block must fit in it.
    const inner = fig.width * 0.72;
    expect(cap.height, `gauge ${i} caption too tall`).toBeLessThanOrEqual(inner);
    const cx = fig.x + fig.width / 2;
    const cy = fig.y + fig.height / 2;
    const corners = [
      [cap.x, cap.y],
      [cap.x + cap.width, cap.y],
      [cap.x, cap.y + cap.height],
      [cap.x + cap.width, cap.y + cap.height],
    ];
    // The value line itself is narrower than the caption box; check the box loosely against the ring radius.
    for (const [x, y] of corners) expect(Math.hypot(x! - cx, y! - cy), `gauge ${i} text crosses the ring`).toBeLessThanOrEqual(fig.width * 0.39 + 8);
  }
});

/** Every control's text must fit inside its own box (no clipped or spilling labels). */
async function noClippedControls(page: Page, where: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a, [role="radio"], [role="switch"], label, input')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      const style = getComputedStyle(el);
      if (style.overflow === 'hidden' && style.textOverflow === 'ellipsis') continue; // intentional truncation
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
        out.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 40)}" ${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}`);
    }
    return out;
  });
  expect(bad, `${where}: text spills out of controls`).toEqual([]);
}

test('no control text spills out of its box', async ({ page }) => {
  await page.goto('/');
  await noClippedControls(page, 'welcome');
  for (const path of ['/record', '/settings', '/live', '/dtc', '/vehicle']) {
    await page.goto(path);
    await page.waitForTimeout(600);
    await noClippedControls(page, path);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  for (const [link, name] of [
    ['Gösterge', 'dashboard'],
    ['Canlı veri', 'live'],
    ['Arıza', 'dtc'],
    ['Kayıt', 'record'],
    ['Araç', 'vehicle'],
  ] as const) {
    await page.getByRole('link', { name: link }).first().click();
    await page.waitForTimeout(700);
    await noClippedControls(page, `${name} (connected)`);
  }
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-layout-record.png`, fullPage: true });
});
