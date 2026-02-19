# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Library Is

`@codebelt/classy-store` is a class-based reactive state management library (~2.3 KB gzipped) for React, Vue, Svelte, Solid, and Angular. You define state as a plain TypeScript class, wrap it with `createClassyStore()`, and get a reactive proxy back. Class getters become automatically memoized computed values. ES6 Proxy intercepts mutations, batches them via `queueMicrotask`, and notifies framework-specific bindings via immutable snapshots with structural sharing.

## Monorepo Layout

```
packages/classy-store/src/
├── core/core.ts                   # Layer 1: Write Proxy — createClassyStore(), subscribe(), getVersion()
├── snapshot/snapshot.ts           # Layer 2: Immutable snapshots — snapshot(), structural sharing
├── types.ts                       # Snapshot<T>, StoreInternal, DepEntry, ComputedEntry
├── index.ts                       # Main barrel: createClassyStore, snapshot, subscribe, getVersion, shallowEqual
├── collections/collections.ts     # ReactiveMap and ReactiveSet (array-backed Map/Set emulation)
├── collections/index.ts           # Collections barrel: reactiveMap, reactiveSet, ReactiveMap, ReactiveSet
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

## Build & Test Commands

Run from the repo root:

```bash
bun install          # Install all workspace dependencies

bun run build        # Build all packages (tsdown, outputs to packages/classy-store/dist/)
bun run test         # Run all tests (Bun test runner, uses happy-dom for React hook tests)
bun run lint         # Check with Biome linter
bun run lint:fix     # Auto-fix Biome lint issues
bun run typecheck    # TypeScript type check without emit
bun run checkall     # lint + test + typecheck (full CI check)

bun run docs:dev     # Start Docusaurus dev server at http://localhost:3000/classy-store/
bun run docs:build   # Build docs site to website/build/
```

Run from `packages/classy-store/`:

```bash
bun run dev          # Build in watch mode
bun test             # Run tests for this package only
bun test src/core/core.test.ts                          # Run a single test file
bun test --testNamePattern="batching" core.test.ts      # Filter by test name
bun run typecheck    # TypeScript type check without emit
```

### Test helper pattern

Because mutations are batched via `queueMicrotask`, tests must flush the microtask queue before asserting on subscriber calls:

```typescript
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

it('notifies on mutation', async () => {
  const store = createClassyStore({ count: 0 });
  const cb = mock(() => {});
  subscribe(store, cb);
  store.count++;
  await flush();
  expect(cb).toHaveBeenCalledTimes(1);
});
```

## Code Style

Enforced by Biome 2.4.0 (`biome.json` at repo root):
- 2-space indentation, single quotes, no bracket spacing
- `noUnusedImports` is an error
- Style rules enforced as errors: `noImplicitBoolean`, `noInferrableTypes`, `useConsistentCurlyBraces`, `useSingleVarDeclarator`, and others

## Key Technical Facts

- **Batching:** mutations are coalesced via `queueMicrotask`. Multiple synchronous writes (including array `push` which triggers multiple SET traps) produce a single subscriber notification.
- **Internal state:** stored in a `WeakMap<proxy, StoreInternal>` — never on the user's object. Allows GC when a store is dereferenced.
- **Non-proxyable types:** `Date`, `RegExp`, native `Map`, and native `Set` are treated as opaque values (internal slots can't be intercepted by Proxy). Use `reactiveMap()` and `reactiveSet()` for Map/Set semantics. Replace Date instances entirely to trigger updates.
- **Extending reactive types:** a class can opt into deep proxying by setting `static [PROXYABLE] = true` (the `PROXYABLE` symbol is exported from `utils/internal`). `ReactiveMap` and `ReactiveSet` use this.
- **`persist()` exclusions:** getters (detected by walking the prototype chain with `Object.getOwnPropertyDescriptor`) and methods (`typeof value === 'function'`) are automatically excluded from persistence. Only own data properties are saved.
- **Computed memoization:** two layers — the write proxy caches getter results keyed on dependency versions/values; the snapshot layer adds cross-snapshot caching using structural sharing reference equality.
- **Structural sharing:** unchanged sub-trees reuse the previous frozen snapshot reference. This makes `Object.is` comparisons in selectors efficient without `shallowEqual`.
- **Version numbers:** monotonically increasing integers stored per proxy node. Child mutations propagate version bumps up to the root. The snapshot cache is keyed on version — a cache hit is O(1).
- **React auto-tracking:** `useStore(store)` (no selector) wraps the snapshot in a `proxy-compare` tracking proxy. Only properties the component actually reads trigger re-renders. `proxy-compare` is the library's only production dependency.

## Package Export Entry Points

| Import path | Contents |
|---|---|
| `@codebelt/classy-store` | `createClassyStore`, `snapshot`, `subscribe`, `getVersion`, `shallowEqual`, `Snapshot` type |
| `@codebelt/classy-store/collections` | `reactiveMap`, `reactiveSet`, `ReactiveMap` type, `ReactiveSet` type |
| `@codebelt/classy-store/react` | `useStore`, `useLocalStore` |
| `@codebelt/classy-store/vue` | `useStore` (ShallowRef) |
| `@codebelt/classy-store/svelte` | `toSvelteStore` (ClassyReadable) |
| `@codebelt/classy-store/solid` | `useStore` (signal getter) |
| `@codebelt/classy-store/angular` | `injectStore` (Signal) |
| `@codebelt/classy-store/utils` | `persist`, `devtools`, `subscribeKey`, `withHistory` |

## LLM Documentation Files

- `website/static/llms.txt` — navigation index (served at `/classy-store/llms.txt`)
- `website/static/llms-full.txt` — all docs concatenated (served at `/classy-store/llms-full.txt`)

These follow the [llms.txt standard](https://llmstxt.org/).
