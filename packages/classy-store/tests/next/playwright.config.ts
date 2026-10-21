import {fileURLToPath} from 'node:url';
import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.NEXT_TEST_URL;
if (!baseURL)
  throw new Error('NEXT_TEST_URL must identify the production Next server');
const compiler = process.env.NEXT_TEST_COMPILER;
if (compiler !== 'on' && compiler !== 'off') {
  throw new Error('NEXT_TEST_COMPILER must be on or off');
}

export default defineConfig({
  testDir: '.',
  testMatch: 'next.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  reporter: 'list',
  metadata: {compiler},
  outputDir:
    process.env.NEXT_TEST_OUTPUT ??
    fileURLToPath(new URL('../../../../test-results/next', import.meta.url)),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
