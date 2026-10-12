import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    // iPhone screen geometry (rendered with Chromium; only the layout is checked here).
    { name: 'iphone11', testMatch: /layout\.spec/, use: { ...devices['iPhone 11'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'small', testMatch: /layout\.spec/, use: { ...devices['iPhone SE'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'npm run preview -- --port 4173', port: 4173, reuseExistingServer: true },
});
