import path from 'node:path';
import solidPlugin from '@solidjs/vite-plugin';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: [
      {
        find: '@codebelt/classy-store/solid',
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/classy-store/src/frameworks/solid/solid.ts',
        ),
      },
      {
        find: '@codebelt/classy-store/utils',
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/classy-store/src/utils/index.ts',
        ),
      },
      {
        find: '@codebelt/classy-store',
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/classy-store/src/index.ts',
        ),
      },
    ],
  },
});
