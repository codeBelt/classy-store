import {defineConfig} from '@playwright/test';

const port = 48273;
const baseURL = `http://127.0.0.1:${port}/classy-store/`;

export default defineConfig({
  testDir: './tests',
  use: {baseURL},
  webServer: {
    command: `mkdir -p .next/preview && ln -sfn ../../out .next/preview/classy-store && python3 -m http.server ${port} --bind 127.0.0.1 --directory .next/preview`,
    url: baseURL,
  },
});
