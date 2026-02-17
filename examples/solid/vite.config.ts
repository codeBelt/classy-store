import path from 'node:path';
import {defineConfig} from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: [
      {
        find: '@codebelt/classy-store/solid',
        replacement: path.resolve(
          __dirname,
          '../../packages/classy-store/src/frameworks/solid/solid.ts',
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
