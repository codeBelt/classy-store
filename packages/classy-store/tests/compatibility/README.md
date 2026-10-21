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

- Node ESM and CommonJS exports, including server rendering without a browser global, shared state across the core, React, and utilities entry points, and an idempotent prepared hydration snapshot that remains stable after live mutations.
- Strict Mode mounting, selector changes, store switching, synchronous multi-property React updates, and ordinary batched subscriptions against the installed package.
- The source SSR/hydration regression suites against the installed package, including DOM reuse, independent request state, and persistence updates before a Suspense boundary's first store read. Direct and bound hooks must hydrate with the prepared baseline and then commit the persisted value. Source-only internal listener counts are omitted; public unmount and persistence cleanup assertions remain.
- TypeScript NodeNext resolution through both `.mts` and `.cts` consumers: selector inference, nested readonly snapshots, mutable stores and `prepareStoreForHydration` return types, and compile-time rejection of React `sync` options.
- The real scoped editor context example, copied directly from `examples/react/src/demos/scoped-store/store` into each consumer. Runtime coverage checks independent instances, nested providers, stable ownership, keyed resets, persistence cleanup, request isolation, and matching hydration. Delayed Suspense tests prove the provider can restore persistence before a child's first store read without replacing server DOM, with both selector and auto-tracked consumers.
- Strict TypeScript checks for the copied context/provider example and its scoping fixtures, including typed mutable actions and immutable snapshot reads. The example uses the installed package exclusively; no source imports or additional public helpers are substituted.

Tests intentionally use the React 18 `react-dom/test-utils` fallback when `React.act` is unavailable. React is external to the published build, so each consumer uses only its selected React version.
