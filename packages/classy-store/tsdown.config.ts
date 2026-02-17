import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/collections/index.ts',
    'src/frameworks/react/react.ts',
    'src/frameworks/vue/vue.ts',
    'src/frameworks/svelte/svelte.ts',
    'src/frameworks/angular/angular.ts',
    'src/frameworks/solid/solid.ts',
    'src/utils/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    'react',
    'react-dom',
    'vue',
    'svelte',
    '@angular/core',
    'solid-js',
  ],
});
