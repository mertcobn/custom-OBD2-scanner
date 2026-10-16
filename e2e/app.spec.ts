import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });

async function connectDemo(page: Page) {
  await page.getByRole('button', { name: /demo/i }).first().click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  // Wait for the connect sheet to auto-close and readings to flow.
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 8000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('shindan.settings'))
      localStorage.setItem('shindan.settings', JSON.stringify({ state: { language: 'tr', theme: 'light' }, version: 1 }));
  });
});

test('welcome → demo → every tab works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Shindan', level: 1 })).toBeVisible();
  await shot(page, '01-welcome');

  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.getByText('Araç protokolü belirlendi')).toBeVisible();
  await shot(page, '02-connecting');
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 8000 });

  // Gauges show numbers
  await expect(page.getByRole('heading', { name: 'Gösterge' })).toBeVisible();
  await expect(page.locator('figure[aria-label^="Devir"]')).not.toContainText('—', { timeout: 5000 });
  await page.waitForTimeout(1500);
  await shot(page, '03-dashboard');

  // Live data
  await page.getByRole('link', { name: 'Canlı veri' }).first().click();
  await expect(page.getByPlaceholder('Sinyal ya da PID ara')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '04-live');
  await page.getByText('Motor devri').first().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-05-detail.png` });
  await page.keyboard.press('Escape');

  // DTC
  await page.getByRole('link', { name: 'Arıza' }).first().click();
  await expect(page.getByText('P0301', { exact: true })).toBeVisible({ timeout: 5000 });
  await shot(page, '06-dtc');
  await page.getByRole('button', { name: 'Kodları sil' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('button', { name: 'Kodları sil' })).toBeDisabled();
  await dialog.getByText('Anladım, kodları sil.').click();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-07-clear.png` });
  await dialog.getByRole('button', { name: 'Kodları sil' }).click();
  await expect(page.getByText('Arıza kodu yok').first()).toBeVisible({ timeout: 6000 });

  // Vehicle
  await page.getByRole('link', { name: 'Araç' }).first().click();
  await expect(page.getByText('JTDBR32E720012345')).toBeVisible();
  await shot(page, '08-vehicle');

  // Record
  await page.getByRole('link', { name: 'Kayıt' }).first().click();
  await expect(page.getByText('Günlük sürüş')).toBeVisible();
  await shot(page, '09-record-wizard');
  await page.getByRole('button', { name: 'Kaydı başlat' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Anı işaretle' }).click();
  await page.getByPlaceholder('ör. rölantide titreme').fill('Test notu');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(1500);
  await shot(page, '10-recording');
  await page.getByRole('button', { name: 'Durdur' }).click();
  await expect(page.getByText('Kayıt tamamlandı')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, '11-summary');

  // Settings: switch to English + dark
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByRole('radio', { name: 'Yoru' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await shot(page, '12-settings-dark');
  await page.goto('/');
  await connectDemo(page);
  await page.waitForTimeout(1500);
  await shot(page, '13-dashboard-dark');
});

test('no console errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 8000 });
  for (const path of ['/live', '/dtc', '/record', '/vehicle', '/settings']) {
    await page.getByRole('link', { name: /./ }).first().waitFor();
    await page.evaluate((p) => {
      history.pushState({}, '', p);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForTimeout(400);
  }
  expect(errors).toEqual([]);
});

test('recordings survive a reload; an interrupted one is recovered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('link', { name: 'Kayıt' }).first().click();
  await page.getByRole('button', { name: 'Kaydı başlat' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Durdur' }).click();
  await expect(page.getByText('Kayıt tamamlandı')).toBeVisible();

  // Start another one and reload mid-way.
  await page.getByRole('button', { name: 'Yeni kayıt' }).click();
  await page.getByRole('button', { name: 'Kaydı başlat' }).click();
  await page.waitForTimeout(2500);
  await page.reload();
  await page.goto('/record');
  await expect(page.getByText(/yarıda kaldı \(sayfa kapandı\)/)).toBeVisible();
  await expect(page.locator('ul li', { hasText: 'Günlük sürüş' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Kaydı aç' }).click();
  await expect(page.getByText('Yarıda kaldı').first()).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-14-recovered.png`, fullPage: true });
});

test('exports: PDF report, AI pack and CSV download', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'one run is enough');
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('link', { name: 'Kayıt' }).first().click();
  await page.getByRole('button', { name: 'Kaydı başlat' }).click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Anı işaretle' }).click();
  await page.getByPlaceholder('ör. rölantide titreme').fill('Gaz pedalında tekleme');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Durdur' }).click();

  for (const [label, ext] of [
    ['PDF rapor', '.pdf'],
    ['Yapay zekâ veri paketi', '-ai.zip'],
    ['CSV', '.csv'],
  ] as const) {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(new RegExp(`^shindan-JTDBR32E720012345-\\d{8}-\\d{4}${ext.replace('.', '\\.')}$`));
    await file.saveAs(`test-results/exports/recording${ext}`);
  }

  // Snapshot report from the vehicle page
  await page.getByRole('link', { name: 'Araç' }).first().click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PDF rapor/ }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/-report\.pdf$/);
  await file.saveAs('test-results/exports/snapshot.pdf');
});

test('on-board tests (Mode 06) show pass/fail', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('link', { name: 'Arıza' }).first().click();
  await page.getByRole('button', { name: 'Testleri oku' }).click();
  await expect(page.getByText('8 test · 2 başarısız')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Tekleme — 1. silindir' })).toBeVisible();
  await expect(page.getByText('Kaldı')).toHaveCount(2);
  await page.getByRole('heading', { name: 'Araç içi testler' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-15-mode06.png`, fullPage: true });
});

test('custom recording: select all / per category', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('link', { name: 'Kayıt' }).first().click();
  await page.getByRole('button', { name: 'Sinyalleri seç' }).click();
  const sheet = page.locator('dialog[open]');
  const total = await sheet.getByRole('checkbox').count();
  await sheet.getByRole('button', { name: /^Tümünü seç/ }).click();
  await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(total);
  await expect(sheet.getByRole('button', { name: `Tamam · ${total} sinyal` })).toBeVisible();
  // Drop one whole category
  const engine = sheet.getByRole('group', { name: /^Motor/ });
  const engineCount = await engine.getByRole('checkbox').count();
  await sheet.getByRole('button', { name: 'Hiçbiri: Motor' }).click();
  await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(total - engineCount);
  await sheet.getByRole('button', { name: 'Tümü: Motor' }).click();
  await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(total);
  await sheet.getByRole('button', { name: 'Tümünü kaldır' }).click();
  await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: /^Tümünü seç/ }).click();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-16-picker.png` });
});

test('catalyst test preset: front + rear O2 polled fast', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demoyu dene' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('link', { name: 'Kayıt' }).first().click();
  await page.getByRole('button', { name: /Katalizör testi/ }).click();
  await expect(page.getByRole('button', { name: /Katalizör testi/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: '5 dk', exact: true })).toBeChecked();
  for (const s of ['O2 B1S1', 'O2 B1S2']) await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-17-catalyst.png`, fullPage: true });
  await page.getByRole('button', { name: 'Kaydı başlat' }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Durdur' }).click();
  await expect(page.getByText('Kayıt tamamlandı')).toBeVisible();
  await expect(page.getByText('Katalizör testi').first()).toBeVisible();
});

