import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/react/react.ts',
    'src/vue/vue.ts',
    'src/svelte/svelte.ts',
    'src/angular/angular.ts',
    'src/solid/solid.ts',
    'src/utils/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'vue',
    'svelte',
    '@angular/core',
    'solid-js',
  ],
});
