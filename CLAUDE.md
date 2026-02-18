# CLAUDE.md — @codebelt/classy-store

Context for Claude Code sessions in this monorepo.

## What This Library Is

`@codebelt/classy-store` is a class-based reactive state management library (~2.3 KB gzipped) for React, Vue, Svelte, Solid, and Angular. You define state as a plain TypeScript class, wrap it with `createClassyStore()`, and get a reactive proxy back. Class getters become automatically memoized computed values. ES6 Proxy intercepts mutations, batches them via `queueMicrotask`, and notifies framework-specific bindings via immutable snapshots with structural sharing.

## Monorepo Layout

```
packages/classy-store/src/
├── core/core.ts                   # Layer 1: Write Proxy — createClassyStore(), subscribe(), getVersion()
├── snapshot/snapshot.ts           # Layer 2: Immutable snapshots — snapshot(), structural sharing
├── types.ts                       # Snapshot<T>, StoreInternal, DepEntry, ComputedEntry
├── index.ts                       # Main barrel: createClassyStore, snapshot, subscribe, getVersion, shallowEqual, reactiveMap, reactiveSet
├── collections/collections.ts     # ReactiveMap and ReactiveSet (array-backed Map/Set emulation)
├── frameworks/
│   ├── react/react.ts             # Layer 3 (React): useStore(), useLocalStore() via useSyncExternalStore
│   ├── vue/vue.ts                 # Vue: useStore() → ShallowRef<Snapshot<T>> (onUnmounted cleanup)
│   ├── svelte/svelte.ts           # Svelte: toSvelteStore() → ClassyReadable<Snapshot<T>>
│   ├── solid/solid.ts             # Solid: useStore() → () => Snapshot<T> signal (onCleanup)
│   └── angular/angular.ts         # Angular: injectStore() → Signal<Snapshot<T>> (DestroyRef)
└── utils/
    ├── index.ts                   # Utils barrel: persist, devtools, subscribeKey, withHistory
    ├── persist/persist.ts         # persist() — storage, transforms, versioning, cross-tab sync, TTL
    ├── devtools/devtools.ts       # devtools() — Redux DevTools integration, time-travel
    ├── history/history.ts         # withHistory() — undo/redo via snapshot stack, pause/resume
    ├── subscribe-key/subscribe-key.ts  # subscribeKey() — single-property subscription
    ├── equality/equality.ts       # shallowEqual
    └── internal/internal.ts       # isPlainObject, canProxy, findGetterDescriptor, PROXYABLE

website/                           # Docusaurus documentation site
website/docs/                      # .md source for all doc pages
website/static/                    # Served verbatim at site root (llms.txt, llms-full.txt, etc.)

examples/                          # Framework demo examples
```

## Key Technical Facts

- **Batching:** mutations are coalesced via `queueMicrotask`. Multiple synchronous writes (including array `push` which triggers multiple SET traps) produce a single subscriber notification.
- **Internal state:** stored in a `WeakMap<proxy, StoreInternal>` — never on the user's object. Allows GC when a store is dereferenced.
- **Non-proxyable types:** `Date`, `RegExp`, native `Map`, and native `Set` are treated as opaque values (internal slots can't be intercepted by Proxy). Use `reactiveMap()` and `reactiveSet()` for Map/Set semantics. Replace Date instances entirely to trigger updates.
- **`persist()` exclusions:** getters (detected by walking the prototype chain with `Object.getOwnPropertyDescriptor`) and methods (`typeof value === 'function'`) are automatically excluded from persistence. Only own data properties are saved.
- **Computed memoization:** two layers — the write proxy caches getter results keyed on dependency versions/values; the snapshot layer adds cross-snapshot caching using structural sharing reference equality.
- **Structural sharing:** unchanged sub-trees reuse the previous frozen snapshot reference. This makes `Object.is` comparisons in selectors efficient without `shallowEqual`.
- **Version numbers:** monotonically increasing integers stored per proxy node. Child mutations propagate version bumps up to the root. The snapshot cache is keyed on version — a cache hit is O(1).

## Package Export Entry Points

| Import path | Contents |
|---|---|
| `@codebelt/classy-store` | `createClassyStore`, `snapshot`, `subscribe`, `getVersion`, `shallowEqual`, `reactiveMap`, `reactiveSet`, `Snapshot` type |
| `@codebelt/classy-store/react` | `useStore`, `useLocalStore` |
| `@codebelt/classy-store/vue` | `useStore` (ShallowRef) |
| `@codebelt/classy-store/svelte` | `toSvelteStore` (ClassyReadable) |
| `@codebelt/classy-store/solid` | `useStore` (signal getter) |
| `@codebelt/classy-store/angular` | `injectStore` (Signal) |
| `@codebelt/classy-store/utils` | `persist`, `devtools`, `subscribeKey`, `withHistory` |

## Build & Test Commands

Run from the repo root:

```bash
bun install          # Install all workspace dependencies

bun run build        # Build all packages (tsdown, outputs to packages/classy-store/dist/)
bun run test         # Run all tests (Bun test runner, uses happy-dom for React hook tests)

bun run docs:dev     # Start Docusaurus dev server at http://localhost:3000/classy-store/
bun run docs:build   # Build docs site to website/build/
```

Run from `packages/classy-store/`:

```bash
bun run dev          # Build in watch mode
bun test             # Run tests for this package only
bun run typecheck    # TypeScript type check without emit
```

## LLM Documentation Files

- `website/static/llms.txt` — navigation index (served at `/classy-store/llms.txt`)
- `website/static/llms-full.txt` — all docs concatenated (served at `/classy-store/llms-full.txt`)

These follow the [llms.txt standard](https://llmstxt.org/).
