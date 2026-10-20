# React package compatibility checks

From the repository root, run:

```sh
bun run build
node packages/classy-store/tests/compatibility/runCompatibility.mjs
```

The runner packs the existing build, installs that tarball into temporary consumers, and checks React 18.0.0, 18.3.1, and the version pinned by the library. It requires Node, npm, Bun, and registry access. To check selected versions, pass exact matching `react` / `react-dom` versions:

```sh
node packages/classy-store/tests/compatibility/runCompatibility.mjs 18.0.0 19.3.1
```

`BUN_EXECUTABLE` can select a different Bun executable. `KEEP_COMPATIBILITY_TEMP=1` keeps the temporary consumers for debugging; otherwise they are removed, including after failures. The library workspace and lockfile are not changed. The runner deliberately does not rebuild, so build first after source edits.

Each consumer verifies:

- Node ESM and CommonJS exports, including server rendering without a browser global and shared state across the core, React, and utilities entry points.
- Strict Mode mounting, selector changes, store switching, synchronous multi-property React updates, and ordinary batched subscriptions against the installed package.
- The source SSR/hydration regression suite against the installed package, including DOM reuse, independent request state, and effect-deferred persistence.
- TypeScript NodeNext resolution through both `.mts` and `.cts` consumers: selector inference, nested readonly snapshots, mutable stores, and compile-time rejection of React `sync` options.

Tests intentionally use the React 18 `react-dom/test-utils` fallback when `React.act` is unavailable. React is external to the published build, so each consumer uses only its selected React version.
