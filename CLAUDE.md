# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Library Is

`@codebelt/classy-store` is a class-based reactive state management library (core about 3.7 KB minified and gzipped; about 4.9 KB with the React hooks) for React, Vue, Svelte, Solid, and Angular. You define state as a plain TypeScript class, wrap it with `createClassyStore()`, and get a reactive proxy back. Class getters become automatically memoized computed values. ES6 Proxy intercepts mutations and notifies subscribers through immutable snapshots with structural sharing: framework bindings synchronously, ordinary subscribers batched via `queueMicrotask`.

## Monorepo Layout

```
packages/classy-store/src/
├── index.ts                       # Main entry: createClassyStore, snapshot, subscribe, batch, shallowEqual, PROXYABLE
├── storeRuntime.ts                # Runtime shared by every entry and both module formats (#store-runtime)
├── types.ts                       # Public Snapshot<T>, SubscribeOptions
├── core/core.ts                   # Layer 1: Write Proxy — createClassyStore(), subscribe(), transactions, computed getters
├── core/ownership.ts              # StoreInternal: one node per object, parent links, detached subtrees
├── core/core.types.ts             # DepEntry, ComputedEntry
├── snapshot/snapshot.ts           # Layer 2: Immutable snapshots — snapshot(), structural sharing
├── collections/collections.ts     # ReactiveMap and ReactiveSet (array-backed Map/Set emulation)
├── collections/index.ts           # Collections entry: reactiveMap, reactiveSet, ReactiveMap, ReactiveSet
├── frameworks/
│   ├── react/react.ts             # Layer 3 (React): client entry re-exporting the hooks
│   ├── react/server.ts            # Server-safe entry: prepareStoreForHydration()
│   ├── react/hooks/               # useClassyStore, useLocalStore, useHistoryStatus, usePersistStatus
│   ├── react/utils/               # createStoreHook, tracking caches used by the auto-tracked hook
│   ├── vue/vue.ts                 # Vue: useClassyStore() → Ref<Snapshot<T>> (effect-scope cleanup)
│   ├── svelte/svelte.ts           # Svelte: toSvelteStore() → ClassyReadable<Snapshot<T>>
│   ├── solid/solid.ts             # Solid 2: useClassyStore() → () => Snapshot<T> (owner cleanup)
│   └── angular/angular.ts         # Angular: injectClassyStore() → Signal<Snapshot<T>> (DestroyRef)
└── utils/
    ├── index.ts                   # Utils entry: persist, devtools, subscribeKey, withHistory
    ├── persist/persist.ts         # persist() — storage, transforms, versioning, cross-tab sync, TTL
    ├── devtools/devtools.ts       # devtools() — Redux DevTools integration, time-travel
    ├── history/history.ts         # withHistory() — undo/redo via snapshot stack, pause/resume
    ├── subscribe-key/subscribe-key.ts  # subscribeKey() — single-property subscription
    ├── equality/equality.ts       # shallowEqual
    ├── cloneSnapshot/             # Mutable copies of snapshots, used by persist and history
    ├── utilityStatus/             # Status publisher behind the persist and history handles
    └── internal/internal.ts       # isPlainObject, canProxy, findGetterDescriptor, PROXYABLE

website/                           # Fumadocs static site (Next.js); a workspace member that runs the library built from this repository
website/content/docs/                      # .md source for all doc pages
website/examples/                  # Live React controls used by the MDX example pages
website/public/                    # Static assets and old demo bookmark redirect

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
bun run check:package  # Build, then publint + arethetypeswrong on the packed tarball
bun run checkall     # lint + test + typecheck (full CI check)

bun run test:coverage   # Unit tests; fails if a source file is below 100% of lines or functions
bun run check:floor     # Diff-scoped guard for the floor in CONSTRAINTS.md
bun run size            # Build, then gzipped size per entry point against its budget
bun run test:mutation   # Mutation run over the core files (about ten minutes); pass file paths to limit it
bun run benchmark:core  # Per-operation timings on Bun; benchmark:core:node for V8

bun run docs:dev     # Build the library, then start Fumadocs at http://localhost:3000
bun run docs:build   # Build the library, then export the GitHub Pages site to website/out/
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

Ordinary subscriptions are batched via `queueMicrotask`, so tests must flush the microtask queue before asserting on subscriber calls. A `{sync: true}` subscription can be asserted immediately:

```typescript
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

it('notifies on mutation', async () => {
  const store = createClassyStore({count: 0});
  const cb = mock(() => {});
  subscribe(store, cb);
  store.count++;
  await flush();
  expect(cb).toHaveBeenCalledTimes(1);
});
```

## Quality Bar

Read [CONSTRAINTS.md](CONSTRAINTS.md) before writing code. Do not weaken it to
make a change pass: a rule there is loosened only together with a decision
record under `docs/decisions/`.

## Code Style

Enforced by Biome (`biome.json` at repo root; the version is pinned in the root `package.json`):

- 2-space indentation, single quotes, no bracket spacing
- `noUnusedImports` is an error
- Style rules enforced as errors: `noImplicitBoolean`, `noInferrableTypes`, `useConsistentCurlyBraces`, `useSingleVarDeclarator`, and others

## Key Technical Facts

- **No arrow function methods:** Arrow function properties (`increment = () => {}`) have `this` lexically bound to the raw instance. `.bind()` is a no-op on arrow functions, so the GET trap cannot rebind `this` to the proxy. Mutations inside arrow functions bypass the SET trap entirely — no notifications, no reactivity. Always use prototype methods (`increment() {}`).
- **Batching:** ordinary subscribers are coalesced via `queueMicrotask`. Multiple synchronous writes (including array `push` which triggers multiple SET traps) produce a single notification.
- **Transactions:** `{sync: true}` subscribers, which is every framework binding, are notified once per direct write, and once per store method or array-method call, when the outermost call returns. Versions still bump on every write, so reads inside the call are current. Without this an in-place `sort` or `unshift` notifies once per moved element and each notification rebuilds the list snapshot. The exported `batch(run)` opens the same transaction around direct writes made outside a method.
- **Subscription scope:** `subscribe(node)` observes that node's subtree only. Each call is its own registration.
- **Frozen objects are values:** a frozen object held in a store is kept by reference and never proxied. That covers any object the caller froze, a snapshot assigned into a store, and a snapshot read through React's tracking proxy. The store does not look inside it: replace the field to update. The frozen check is cached in `linkChild()` (`core.ts`), because `Object.isFrozen` scans every property; do not move it into `canProxy()`, which history and persist use to copy frozen snapshot content.
- **Read-only properties:** a Proxy must return a non-writable, non-configurable property's own value, so `linkChild()` leaves such a value unproxied. That is what makes a frozen store root readable. A store embedded by its proxy is already that value and stays a child.
- **Internal state:** stored in a `WeakMap<proxy, StoreInternal>` — never on the user's object. Allows GC when a store is dereferenced.
- **Non-proxyable types:** `Date`, `RegExp`, native `Map`, and native `Set` are treated as opaque values (internal slots can't be intercepted by Proxy). Use `reactiveMap()` and `reactiveSet()` for Map/Set semantics. Replace Date instances entirely to trigger updates. Frozen objects are opaque in the same way.
- **Extending reactive types:** a class can opt into deep proxying by setting `static [PROXYABLE] = true` (the `PROXYABLE` symbol is exported from the main entry). `ReactiveMap` and `ReactiveSet` use this.
- **Collection identity:** reactive collections match members with `identityOf()`, which is the same for a raw object, its store proxy and every snapshot of it. Lookups scan the raw backing array except for tracked reads in a React component.
- **Typecheck with the package script:** run `bun run typecheck`, not `bunx tsc`; the latter can resolve a different TypeScript and miss errors.
- **`persist()` exclusions:** getters (detected by walking the prototype chain with `Object.getOwnPropertyDescriptor`) and methods (`typeof value === 'function'`) are automatically excluded from persistence. Only own data properties are saved.
- **Computed memoization:** two layers — the write proxy caches getter results keyed on dependency versions/values; the snapshot layer adds cross-snapshot caching using structural sharing reference equality.
- **Structural sharing:** unchanged sub-trees reuse the previous frozen snapshot reference. This makes `Object.is` comparisons in selectors efficient without `shallowEqual`.
- **Version numbers:** monotonically increasing integers stored per proxy node. Child mutations propagate version bumps up to the root. The snapshot cache is keyed on version — a cache hit is O(1).
- **React auto-tracking:** `useClassyStore(store)` (no selector) wraps the snapshot in a `proxy-compare` tracking proxy. Only properties the component actually reads trigger re-renders. `proxy-compare` is the library's only production dependency.

## Package Export Entry Points

The [API reference](website/content/docs/API_REFERENCE.md) lists the public entry points, signatures, and lifecycle details.

## LLM Documentation Files

Fumadocs generates `llms.txt`, `llms-full.txt`, and per-page Markdown from the sources used for the HTML. The [website guide](website/README.md) describes local development and export checks.
