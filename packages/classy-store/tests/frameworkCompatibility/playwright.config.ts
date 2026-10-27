import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: `${process.env.FRAMEWORK}.spec.ts`,
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:4181', trace: 'retain-on-failure'},
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}},
  ],
  webServer: {
    command: 'node serve.mjs',
    url: `http://127.0.0.1:4181/${process.env.FRAMEWORK}`,
    reuseExistingServer: false,
  },
});
