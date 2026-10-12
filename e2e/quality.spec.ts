import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const CSP = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;

async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Demoyu dene|Try the demo/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('shindan.settings'))
      localStorage.setItem('shindan.settings', JSON.stringify({ state: { language: 'tr', theme: 'light', analytics: false }, version: 1 }));
  });
});

test('the production Content-Security-Policy does not break anything', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'one run is enough');
  // Serve every document with the exact CSP from vercel.json.
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = CSP;
    await route.fulfill({ response: res, headers });
  });
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await demo(page);
  await page.getByRole('link', { name: 'Canlı veri' }).first().click();
  await page.getByText('Motor devri').first().click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Araç' }).first().click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PDF rapor/ }).click();
  await dl;
  expect(violations).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`accessibility (axe, ${theme})`, async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'one run per theme is enough');
    await page.addInitScript((t) => {
      localStorage.setItem('shindan.settings', JSON.stringify({ state: { language: 'tr', theme: t, analytics: false }, version: 1 }));
    }, theme);
    const results: string[] = [];
    const scan = async (name: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of r.violations) results.push(`${name}: ${v.id} (${v.impact}) — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    };
    await page.goto('/');
    await scan('welcome');
    await demo(page);
    await page.waitForTimeout(1000);
    await scan('dashboard');
    for (const [link, name] of [
      ['Canlı veri', 'live'],
      ['Arıza', 'dtc'],
      ['Kayıt', 'record'],
      ['Araç', 'vehicle'],
    ]) {
      await page.getByRole('link', { name: link }).first().click();
      await page.waitForTimeout(700);
      await scan(name);
    }
    await page.goto('/settings');
    await scan('settings');
    expect(results).toEqual([]);
  });
}

test('works offline after the first visit (PWA)', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'mobile', 'one run is enough');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Give the service worker time to finish precaching.
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.includes('precache')), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aracının sana söylediklerini dinle.' })).toBeVisible();
  // Demo mode needs no network at all.
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('link', { name: 'Arıza' }).first().click();
  await expect(page.getByText('P0301', { exact: true })).toBeVisible({ timeout: 8000 });
  await context.setOffline(false);
});
