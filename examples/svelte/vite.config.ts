import path from 'node:path';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: [
      {
        find: '@codebelt/classy-store/svelte',
        replacement: path.resolve(
          __dirname,
          '../../packages/classy-store/src/frameworks/svelte/svelte.ts',
        ),
      },
      {
        find: '@codebelt/classy-store/utils',
        replacement: path.resolve(
          __dirname,
          '../../packages/classy-store/src/utils/index.ts',
        ),
      },
      {
        find: '@codebelt/classy-store',
        replacement: path.resolve(
          __dirname,
          '../../packages/classy-store/src/index.ts',
        ),
      },
    ],
  },
});
