import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/storeRuntime.ts',
    'src/collections/index.ts',
    'src/frameworks/react/react.ts',
    'src/frameworks/react/server.ts',
    'src/frameworks/vue/vue.ts',
    'src/frameworks/svelte/svelte.ts',
    'src/frameworks/angular/angular.ts',
    'src/frameworks/solid/solid.ts',
    'src/utils/index.ts',
  ],
  // Source consumers use the relative TS module directly. Published entries
  // resolve one runtime per installation while loading peers in their own format.
  plugins: [
    {
      name: 'shared-store-runtime',
      resolveId(id, importer) {
        // Keep the public declarations resolvable through relative type imports.
        if (importer?.endsWith('.d.ts')) return;
        if (id.startsWith('.') && id.endsWith('/storeRuntime')) {
          return {id: '#store-runtime', external: true};
        }
      },
    },
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  deps: {
    neverBundle: [
      'react',
      'react-dom',
      'vue',
      'svelte',
      '@angular/core',
      'solid-js',
    ],
  },
});
