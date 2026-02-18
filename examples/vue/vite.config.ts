import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@codebelt/classy-store/vue',
        replacement: path.resolve(
          __dirname,
          '../../packages/classy-store/src/frameworks/vue/vue.ts',
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
