---
title: "Classy Store \u2014 Architecture"
description: "Understand proxy tracking, immutable snapshots, computed getters, and framework bindings."
---

Internal design documentation for contributors and maintainers.

## Three-Layer Architecture

The library is organized into three distinct layers, each with a single responsibility:

```mermaid
flowchart TB
  subgraph userCode ["User Code"]
    ClassDef["class MyStore { fields, methods, getters }"]
  end

  subgraph layer1 ["Layer 1: Write Proxy (core.ts)"]
    storeFn["createClassyStore(instance)"]
    SetTrap["SET trap: forward write → bump version → notify subscribers"]
    GetTrap["GET trap: return value, bind methods, reuse nested proxies, memoize getters"]
    DeleteTrap["DELETE trap: same as SET"]
    Batch["queueMicrotask: coalesce synchronous mutations → 1 notification"]
    SyncNotify["sync listeners: notify immediately per mutation"]
    DeepProxy["Ownership graph: one node per reactive object"]
  end

  subgraph layer2 ["Layer 2: Snapshot (snapshot.ts)"]
    SnapshotFn["snapshot(proxy): freeze supported state copies"]
    StructuralShare["Structural sharing: unchanged refs reused across snapshots"]
    Freeze["Object.freeze: enforces immutability"]
    VersionCache["Version-stamped cache: skip rebuild if version unchanged"]
    GetterEval["Getters: memoized per-snapshot + cross-snapshot caching"]
  end

  subgraph layer3 ["Layer 3: React Hook (useClassyStore.ts)"]
    UseStore["useClassyStore(store, selector?)"]
    UseLocalStore["useLocalStore(factory)"]
    USES["useSyncExternalStore"]
    ProxyCompare["proxy-compare: track selectorless render reads"]
    IsChanged["isChanged(prev, next, affected): fine-grained diff"]
    SelectorMode["Selector mode: Object.is or custom isEqual"]
  end

  subgraph component ["React Component"]
    Render["Filter subscription-driven renders"]
  end

  ClassDef --> storeFn
  storeFn --> SetTrap
  storeFn --> GetTrap
  storeFn --> DeleteTrap
  SetTrap --> SyncNotify
  SetTrap --> Batch
  SyncNotify -->|adapter reads| SnapshotFn
  GetTrap --> DeepProxy
  SnapshotFn --> StructuralShare
  StructuralShare --> Freeze
  Freeze --> VersionCache
  VersionCache --> GetterEval
  UseStore --> USES
  USES --> VersionCache
  VersionCache --> ProxyCompare
  ProxyCompare --> IsChanged
  IsChanged --> Render
  SelectorMode --> Render
```

## File Map

The library lives in `packages/classy-store`. Public entry points expose the API;
implementation files and types live with the feature that owns them.

```text
packages/classy-store/
├── src/
│   ├── index.ts                         # Core public entry; no React dependency
│   ├── storeRuntime.ts                  # Shared runtime for public entries and both module formats
│   ├── types.ts                         # Public Snapshot<T> and SubscribeOptions
│   ├── core/
│   │   ├── core.ts                      # Write proxies, subscriptions, computed getters
│   │   ├── core.types.ts                # Computed dependency types
│   │   ├── ownership.ts                 # Shared nodes, parent links, detached subtrees
│   │   ├── core.computed.test.ts        # Write-proxy getter memoization
│   │   ├── core.transactions.test.ts    # One notification per method or array call
│   │   ├── core.snapshotValues.test.ts  # Snapshots kept in a store; identity helpers
│   │   ├── core.fuzz.test.ts            # Seeded randomized differential test
│   │   └── core.ownership.test.ts       # Child ownership and subscription cleanup
│   ├── snapshot/
│   │   ├── snapshot.ts                  # Immutable snapshots and structural sharing
│   │   └── snapshot.computed.test.ts    # Snapshot getter memoization
│   ├── collections/
│   │   ├── index.ts                     # Public collections entry
│   │   └── collections.ts               # ReactiveMap and ReactiveSet
│   ├── frameworks/
│   │   └── react/
│   │       ├── react.ts                 # Public client entry; exports hooks and factory
│   │       ├── server.ts                # Server-safe prepareStoreForHydration entry
│   │       ├── hooks/
│   │       │   ├── useClassyStore/      # Selector and auto-tracked subscriptions; hook types
│   │       │   ├── useLocalStore/       # Component-scoped store creation
│   │       │   ├── useHistoryStatus/    # Public history status hook
│   │       │   ├── usePersistStatus/    # Public persistence status hook
│   │       │   └── useUtilityStatus/    # Internal shared status subscription hook
│   │       ├── utils/
│   │       │   ├── createStoreHook/     # Bound store hook factory
│   │       │   ├── hydrationSnapshots/  # Shared captured snapshots, held by weak keys
│   │       │   ├── snapshotTargetCache/ # Shared tracking targets
│   │       │   ├── trackedProxyCache/   # Tells the store which snapshot a tracking proxy wraps
│   │       │   └── trackingReadMap/     # Render-local and committed dependency reads
│   │       ├── testHelpers/            # React fixtures
│   │       └── react.*.test.tsx         # Integration tests grouped by behavior
│   └── utils/
│       ├── index.ts                     # Public utility functions and types
│       ├── persist/
│       │   ├── persist.ts               # Storage queue, hydration, transforms, tab sync
│       │   ├── persist.types.ts         # Public persistence options, status, and handle
│       │   └── persist.*.test.ts        # API, concurrency, and error regressions
│       ├── history/                     # Undo/redo and status
│       ├── devtools/                    # Redux DevTools integration
│       ├── subscribe-key/               # Single-property subscriptions
│       ├── equality/                    # shallowEqual
│       ├── utilityStatus/               # Internal framework-neutral status source
│       ├── cloneSnapshot/               # Internal snapshot cloning
│       └── internal/                    # Proxy and property helpers
├── tests/
│   ├── browser/                         # Real input, hydration, and persistence tests
│   ├── compatibility/                   # Packed-library React version matrix
│   ├── compiler/                        # Compiled consumer fixtures and regressions
│   ├── scoping/                         # Provider isolation, lifecycle, and SSR
│   ├── next/                            # Packed Next.js boundaries and navigation
│   ├── memory/                          # Heap snapshots and retention checks
│   └── performance/                     # Form and list benchmarks
├── tsdown.config.ts                     # Published entry points and bundle settings
└── bunfig.toml                          # happy-dom setup for source tests
```

Tests for core behavior stay beside their implementation. React integration tests
exercise the public client entry, including computed getter behavior. Consumer
fixtures under `tests/` verify the packed library and framework build boundaries.
The other framework adapters remain under `src/frameworks/`.

The [interactive examples](/examples/) run in the documentation site. Their React components live in `website/examples`, and the standalone Next.js example lives in `examples/nextjs`.

## Layer 1: Write Proxy (`core.ts`)

### Overview

The `createClassyStore()` function wraps a class instance in an ES6 Proxy. Assignments and deletions through that proxy, including array operations and supported nested state, are intercepted. Raw-object writes and descriptor changes bypass these traps. Subscribers are batched by default into one microtask notification, while React, Vue, Svelte, Solid, and Angular use the synchronous path.

### Data Flow: Mutation → Notification

```mermaid
sequenceDiagram
  participant User as User Code
  participant Proxy as Write Proxy
  participant Target as Raw Target
  participant Internal as StoreInternal
  participant Sync as Sync Subscribers
  participant Micro as queueMicrotask
  participant Batched as Batched Subscribers

  User->>Proxy: store.count = 5
  Proxy->>Target: Reflect.set(target, 'count', 5)
  Proxy->>Internal: notifyMutation(internal) increments all reachable owners
  Note over Internal: Version mismatch invalidates cached snapshots
  Proxy->>Sync: notify sync listeners immediately
  Proxy->>Micro: schedule batched notify (if not already scheduled)
  Note over Micro: Coalesces all sync mutations
  User->>Proxy: store.name = 'new'
  Proxy->>Target: Reflect.set(target, 'name', 'new')
  Proxy->>Internal: notifyMutation increments the versions again
  Proxy->>Sync: notify sync listeners again
  Note over Micro: Still same microtask batch
  Micro->>Batched: notify batched listeners once
```

### Internal State Storage

The core uses weak maps to find a node by its raw object or its proxy. Each node
has a version, its outgoing property edges, and a count of edges from each
owner. Creating a store or assigning a new graph indexes its own data fields
without evaluating accessors. Reordering a list or assigning a filtered array
reuses the nodes for retained rows.

A mutation increments each reachable owner's version once before subscribers
run. An unobserved container that loses its last owner releases its outgoing
notification links. If a caller uses that detached container again, its saved
child versions identify edits to shared rows made while it was detached.

### Proxy Traps

**SET trap:**

1. Resolve the nearest property descriptor. Invoke accessors with the proxy as their receiver so a setter's own writes follow the usual mutation path.
2. For an existing own data property, skip an `Object.is`-equal value or the same child supplied by its raw object or proxy. Forward other data writes to the raw target. Filling a missing array index with `undefined` creates an element.
3. After a successful write, detach the old child proxy and clear the bound-method cache. Array length truncation detaches removed children, including partial truncation when a non-configurable index rejects the requested length. An otherwise failed write preserves the old connection.
4. Bump version for this node and all ancestors
5. Notify sync listeners immediately, then schedule batched listeners via `queueMicrotask` (deduped)

**GET trap (priority order):**

1. **Memoized getter detection** — walk prototype chain with `Object.getOwnPropertyDescriptor`. If a getter is found, call `evaluateComputed()` which checks dependency validity and returns the cached result or re-evaluates with dependency tracking.
2. **Method binding** — wrap function values so they run with the proxy as `this`, which sends `this.count++` in methods through the SET trap, and so each call is a [transaction](#transactions). Object methods reuse a cached wrapper. Array method reads create a fresh one.
3. **Nested state** — if `canProxy()` accepts it (plain object, array, or a class that opts in with the exported `PROXYABLE` symbol, as the library's reactive collections do), return its canonical child proxy. A frozen snapshot is never proxied: it is returned as the immutable value it is. Record a dependency if a getter is currently being tracked.
4. **Primitives and opaque values** — return as-is and record a value dependency when a getter is being tracked.

**DELETE trap:** Attempt `Reflect.deleteProperty` first. On success, detach the child, clear the bound-method cache, bump versions, and notify. A failed deletion preserves the connection.

### Batching via `queueMicrotask`

Array operations like `push()` trigger multiple SET traps (element + length). For ordinary listeners, a set of pending owners and one microtask coalesce these mutations into one notification:

```
store.items.push('a')                  // initially empty array
  → SET index 0, increment owner versions, deliver synchronous notifications
  → add owners with batched listeners to pendingNotifications, queue one microtask
  → SET length, already updated by the index write, skip the equal value
  → flushNotifications delivers the batched callbacks
```

Subscribers opt into immediate timing with `{sync: true}`. A direct write delivers once per matching registration after version propagation; two successive direct writes deliver twice. React's store-reading hooks use this timing so `useSyncExternalStore` can observe a controlled input's new value during its event, and React schedules the renders.

### Transactions

A call to a store method, or to any array method on store state, runs as a transaction. The GET trap returns each function wrapped so that the call increments a depth counter. While the counter is above zero, a mutation still bumps every owner's version at once, so reads inside the call are current, but owners with synchronous listeners are collected in a pending set instead of being notified. When the outermost call returns or throws, the set is delivered once.

```
store.items.unshift(row)               // 5,000 rows, one mounted consumer
  → depth 0 → 1
  → 5,001 SET traps, each bumping owner versions and adding owners to pendingSync
  → depth 1 → 0: deliver synchronous listeners once
  → the consumer reads one new snapshot of the list
```

Without this, each of those writes notified the consumer, and each notification rebuilt the list snapshot: quadratic work for one call. Batched listeners are unaffected; they were already coalesced by the microtask. Writes after an `await` in an async method happen after its call returned, so they are outside the transaction.

The Svelte adapter also uses synchronous notifications to satisfy the readable
store contract. It subscribes before delivering the initial snapshot so mutations
inside that first callback are observed, and removes the subscription if the
initial callback throws. Normal unsubscription stops delivery even if another
subscriber removes it during an in-progress notification.

The Vue adapter updates its shallow ref synchronously too. Vue handles render
batching, and `nextTick()` then waits for the queued DOM update. The hook requires
an active component or effect scope to own cleanup, and ignores notifications if
that scope has been disposed during an in-progress notification.

The Solid 2 adapter forwards synchronous notifications into an internal signal
with `ownedWrite: true`, allowing external store notifications while an owner is
active. Solid schedules its own reactive work; the adapter never calls `flush()`.
A live owner is required before subscribing. Owner cleanup marks delivery inactive
before removing the listener, and callbacks also check disposal during notification.
The adapter supports Solid `^2.0.0`; see the [Solid guide](./SOLID.md).

The Angular adapter also uses synchronous notifications, keeping its readonly
snapshot signal and dependent computed reads current. Angular schedules its own
effects and rendering, including zoneless `OnPush` views. `DestroyRef` owns the
subscription; an inactive/destroyed guard ignores callbacks during teardown.
It supports stable Angular 22 releases (`^22.0.0`); see the [Angular guide](./ANGULAR.md).

### Version Propagation

When a nested property mutates, versions bump from the mutated node up to the root:

```mermaid
graph TD
  Root["Root (v=10 → v=11)"] --> User["user (v=11 → v=12)"]
  Root --> Settings["settings (v=5, unchanged)"]
  User --> Name["name = 'Bob' (mutation here, v=12)"]
  User --> Age["age = 30 (unchanged)"]
```

This enables structural sharing: when the snapshot layer sees that `settings` has the same version, it returns the cached snapshot reference.

## Layer 2: Immutable Snapshots (`snapshot.ts`)

### Overview

`snapshot(proxy)` freezes copies of the root state and supported nested objects, preserving class prototypes. Unchanged sub-trees reuse previous snapshot references. Opaque leaves retain their references, and newly allocated getter results are not automatically frozen; see [snapshot semantics](./TUTORIAL.md#snapshots).

### Snapshot Creation Flow

```mermaid
flowchart TD
  Start["snapshot(proxy)"] --> CheckCache{"Version match\nin snapshotCache?"}
  CheckCache -->|Yes| ReturnCached["Return cached snapshot (O(1))"]
  CheckCache -->|No| CreateSnap["Create new snapshot object"]
  CreateSnap --> IterateKeys["For each own key"]
  IterateKeys --> CheckChild{"Has child\ninternal?"}
  CheckChild -->|Yes| Recurse["Recurse: createSnapshotRecursive(child)"]
  CheckChild -->|No| CopyValue["Copy primitive or opaque reference"]
  Recurse --> AssignProp["Define own data property"]
  CopyValue --> AssignProp
  AssignProp --> IterateKeys
  IterateKeys -->|Done| Freeze["Object.freeze(snapshot)"]
  Freeze --> Cache["Cache: snapshotCache.set(target, [version, snap])"]
  Cache --> Return["Return frozen snapshot"]
```

### Snapshot cache

Each reactive object has one versioned snapshot shared across all paths to
that object. Object snapshots copy own data properties, including JSON keys
named `__proto__`, and preserve the prototype. Own accessors and class
getters read against that snapshot. Array snapshots preserve length and
occupied indices, including holes between them. Named and symbol-keyed array
properties are omitted. Mutate state through the live store proxy to
invalidate the affected versions.

### Structural Sharing Example

```
Snapshot v1:                    Snapshot v2 (after user.name = 'Bob'):
┌──────────┐                    ┌──────────┐
│ root     │                    │ root     │ (new object)
│ user ────┼──→ {name:'Alice'}  │ user ────┼──→ {name:'Bob'} (new)
│ settings─┼──→ {theme:'dark'}  │ settings─┼──→ {theme:'dark'} (SAME ref ===)
└──────────┘                    └──────────┘
```

`snap2.settings === snap1.settings` because the `settings` sub-tree's version didn't change → cache hit → same reference.

### Getter Evaluation (Memoized)

Snapshots preserve the prototype chain and install lazy-memoizing getters on each snapshot object. Getter results are cached at two levels:

1. **Per-snapshot cache** — repeated access to the same getter on the same snapshot returns the identical reference.
2. **Cross-snapshot cache** — if the properties the getter reads are structurally the same across snapshots (via reference equality from structural sharing), the previous result is returned.

```typescript
class Store {
  count = 5;
  get doubled() {
    return this.count * 2;
  }
}

const snap = snapshot(createClassyStore(new Store()));
snap.doubled; // 10 — computed once, cached
snap.doubled; // 10 — same reference (per-snapshot cache hit)
```

## Computed Getter Memoization

Class getters are automatically memoized at two layers — the write proxy and the snapshot — without any user-facing API changes. This is analogous to MobX's `@computed`, but implemented transparently via Proxy.

### Write Proxy Memoization (`core.ts`)

When a getter is accessed on the write proxy, `evaluateComputed()` runs the getter with dependency tracking. A module-level tracker stack records which properties the getter reads on `this`:

```mermaid
flowchart TD
  GetterAccess["store.filtered accessed"]
  CheckDeps{"Dependencies\nchanged?"}
  ReturnCached["Return cached value"]
  Recompute["Re-run getter with\ndependency tracking"]
  CacheResult["Cache result + deps"]

  GetterAccess --> CheckDeps
  CheckDeps -->|No| ReturnCached
  CheckDeps -->|Yes| Recompute
  Recompute --> CacheResult
  CacheResult --> ReturnCached
```

**Dependency types:**

- **Sub-tree dep** (`kind: 'version'`): the getter read a nested object/array. Validated by comparing `internal.version` — O(1) per dep.
- **Value dep** (`kind: 'value'`): a primitive or opaque value read. Validation checks property existence and `Object.is(target[prop], recordedValue)`.
- **Computed dep** (`kind: 'computed'`): a read of another computed getter. Validation checks that getter's cached result and dependencies recursively.

**Nested getter support:** when getter A reads getter B, A records a computed dependency on B. B tracks its own reads in a separate frame. Dependency validation follows those cached dependencies without executing a raw getter just to check whether it changed. Recursive evaluation of the same getter is detected and throws.

### Snapshot Memoization (`snapshot.ts`)

Getters are cached per snapshot and can reuse results **across** snapshots when dependencies haven't changed. New objects returned by getters are not automatically frozen; callers must treat them as readonly. Getters must be pure and derive their values from explicit store property reads, not time or external mutable state:

```mermaid
flowchart TD
  SnapGetter["snap.filtered accessed"]
  PerSnapCheck{"Per-snapshot\ncache hit?"}
  PerSnapReturn["Return cached ref"]
  CrossSnapCheck{"Cross-snapshot\ndeps unchanged?"}
  CrossSnapReturn["Return prev result"]
  Compute["Run getter with dep tracking,\nrecord which this.X were read"]
  CacheBoth["Cache in per-snapshot + cross-snapshot"]

  SnapGetter --> PerSnapCheck
  PerSnapCheck -->|Yes| PerSnapReturn
  PerSnapCheck -->|No| CrossSnapCheck
  CrossSnapCheck -->|Yes| CrossSnapReturn
  CrossSnapCheck -->|No| Compute
  Compute --> CacheBoth
```

**Cross-snapshot mechanism:**

1. First evaluation: a lightweight tracking Proxy records which `this` properties the getter reads and their values.
2. On subsequent snapshots: for each recorded property, check `Object.is(currentSnap[prop], previousValue)`.
3. Structural sharing guarantees that unchanged sub-trees have the same reference — so if `this.todos` hasn't changed, the reference comparison passes and the cached result is returned.
4. For getters reading other getters (e.g., `get filteredCount() { return this.filtered.length; }`): the inner getter is itself memoized, so it returns a stable reference, which the outer getter's dep check recognizes as unchanged.

**Impact on `useClassyStore`:** The existing hook benefits automatically — no changes needed:

- **Selector mode:** `useClassyStore(store, (state) => state.filtered)` gets a stable reference from the memoized snapshot getter. `Object.is` correctly detects "no change" without `shallowEqual`.
- **Auto-tracked mode:** `proxy-compare`'s `isChanged` gets stable references from snapshot getters, reducing false positives.

## Layer 3: React Hook (`hooks/useClassyStore/useClassyStore.ts`)

### Overview

`useClassyStore` uses `useSyncExternalStore` for tear-free React integration. React subscriptions always notify synchronously, allowing controlled inputs to observe updates during their event. The React API has no timing option; ordinary core subscriptions remain batched. It supports two modes:

### Server rendering and hydration

`prepareStoreForHydration(store)` captures an immutable snapshot in a WeakMap keyed by the exact store proxy. It returns the same mutable proxy and preserves the first capture on repeated calls. Capturing is explicit at bootstrap, before rendering or persistence, because a delayed Suspense boundary may not call its hook until after the live store changes.

Prepared stores supply that snapshot through `getServerSnapshot`; ordinary `getSnapshot` still reads live state. Each selector has separate server and live caches. When React reads the hydration result, it can seed the live cache with that result so unchanged inputs and equal selections retain their references without overwriting committed selections during rendering. Client-only mounts never evaluate the server selector.

The capture stays available for the store's lifetime, including later boundaries or roots. It is never cleared when the first consumer mounts. Unprepared stores keep the existing current-snapshot behavior. Core mutation timing, ordinary subscriptions, and `snapshot(store)` are unchanged.

### Mode 1: Selector

```typescript
const count = useClassyStore(myStore, (state) => state.count);
```

```mermaid
sequenceDiagram
  participant React as React (useSyncExternalStore)
  participant Hook as useClassyStore
  participant Snap as snapshot()
  participant Selector as selector(snap)

  React->>Hook: getSnapshot()
  Hook->>Snap: snapshot(proxy)
  Snap-->>Hook: frozen snapshot
  Hook->>Hook: Same snapshot ref? → return cached result
  Hook->>Selector: selector(snapshot)
  Selector-->>Hook: selected value
  Hook->>Hook: Object.is(prev, next)?
  alt Same value
    Hook-->>React: return cached (no re-render)
  else Different value
    Hook-->>React: return new value (re-render)
  end
```

**Equality chain:**

1. Same store, selector, equality function, and snapshot reference? → reuse the cached result (O(1))
2. Run selector → compare result with `Object.is` (or `options.isEqual`)
3. Same result → return previous reference (no re-render)

**Controlled input timing:**

```typescript
const name = useClassyStore(formStore, (state) => state.name);
```

The hook always calls the core `subscribe()` with `{sync: true}`. Ordinary listeners still batch with `queueMicrotask`. This timing is independent of React's own render scheduling and does not provide atomic transactions across several writes.

### Mode 2: Auto-tracked (selectorless)

```typescript
const snap = useClassyStore(myStore);
// snap.count — tracked
// snap.user.name — tracked
```

Each render creates its own `affected` map and raw-snapshot getter; the hook retains a proxy cache across renders. `useSyncExternalStore` receives a cached raw snapshot: unchanged tracked values return the previous snapshot for that render. After reading it, the hook wraps the snapshot with `createProxy` to record the component's property reads.

A parent re-render starts from current store data and a render-local `TrackingReadMap`. It lazily copies committed operation records for reused immutable snapshot objects, including structurally shared children. This retains reads skipped by React Compiler or manual memoization. Sets are copied before recording new reads, so suspended and abandoned renders cannot change committed dependencies. An effect publishes only committed reads into a WeakMap; old snapshot objects can be collected without retaining a chain of prior render maps.

The adapter follows the operation-record/Set layout of the pinned `proxy-compare` 3 dependency without hardcoding its private field names. Compiled regressions cover value reads, `in`, `Object.hasOwn`, and key enumeration. Reused snapshot objects conservatively retain prior committed dependencies, so changing a conditional branch may cause an extra render before that object's identity changes. Explicit selectors provide selected-value equality when stricter filtering is needed.

Snapshot creation marks only library-created snapshot nodes with `markToTrack`, including class and null-prototype objects. This enables field tracking without altering opaque leaves such as native maps and dates. Nodes containing object-valued symbol fields use whole-node comparison to avoid a frozen-symbol limitation in `proxy-compare` 3; updates remain reactive with coarser render filtering.

**How `proxy-compare` works:**

- `createProxy(snapshot, affected)` records properties read into the render's map; committed records are retained separately with weak snapshot keys.
- `isChanged(previousSnapshot, nextSnapshot, affected)` checks whether a tracked property differs.
- Unchanged tracked properties suppress subscription-driven renders; `snapshot()` retains its existing identity cache and structural sharing.

## Dependency Graph

```mermaid
graph LR
  reactEntry["/react client entry"] --> hook["useClassyStore.ts"]
  reactEntry --> localHook["useLocalStore.ts"]
  reactEntry --> factory["createStoreHook.ts"]
  factory --> hook
  factory --> runtime["storeRuntime.ts (packed as #store-runtime)"]
  localHook --> runtime
  hook --> runtime
  serverEntry["/react/server entry"] --> runtime
  adapters["Vue / Svelte / Solid / Angular entries"] --> runtime
  runtime --> core["core.ts"]
  runtime --> snapshot["snapshot.ts"]
  runtime --> proxyCompare["proxy-compare"]
  runtime --> hydration["hydrationSnapshots.ts"]
  snapshot --> core
  snapshot --> types["types.ts: public types"]
  snapshot --> proxyCompare
  snapshot --> internal["utils/internal/internal.ts"]
  core --> types
  core --> coreTypes["core.types.ts: internal types"]
  core --> ownership["ownership.ts"]
  core --> internal
  index["Core entry: index.ts"] --> runtime
  index --> equality["equality.ts"]
  index --> types

  subgraph utilities ["Utilities (utils/)"]
    persist["persist.ts"]
    devtools["devtools.ts"]
    subscribeKey["subscribe-key.ts"]
    withHistory["history.ts"]
    status["utilityStatus.ts"]
  end

  persist --> runtime
  persist --> internal
  persist --> status
  devtools --> runtime
  subscribeKey --> runtime
  withHistory --> runtime
  withHistory --> status
  reactEntry --> statusHooks["useHistoryStatus / usePersistStatus"]
  statusHooks --> sharedHook["useUtilityStatus.ts"]
```

The published ESM and CommonJS entries resolve `#store-runtime` to the
same module within one package installation. They share the proxy registry,
snapshot caches, and hydration captures. The client entry owns the React
boundary. Core, snapshots, collections, and utilities remain framework-neutral. React status hooks share an internal hook;
the status source itself lives with the utilities and has no React dependency.
`types.ts` contains public core types, while `core.types.ts` describes private
bookkeeping. Persistence contracts live in `persist.types.ts` and are exported
through the public utilities entry.

## Key Design Decisions

### Why ES6 Proxy instead of `Object.defineProperty`?

ES6 Proxy supports intercepting property creation, deletion, and arbitrary key access — not just known properties. This is essential for arrays (index access) and dynamic objects. All modern browsers and Node.js/Bun support Proxy natively.

### Why `queueMicrotask` for batching?

`queueMicrotask` runs after the current synchronous code but before the next paint/timer. For ordinary subscribers, this means:

- Multiple mutations in the same event handler → 1 notification
- Array `push` (which triggers multiple SET traps) → 1 notification
- Delivery runs at the microtask checkpoint without waiting for an animation frame

### Why structural sharing in snapshots?

Without structural sharing, `Object.is(prevSelector, nextSelector)` would always return `false` for object/array selectors because each snapshot creates new objects. Structural sharing ensures unchanged sub-trees maintain reference equality, making selectors efficient without custom equality functions.

### Why `proxy-compare` for auto-tracking?

`proxy-compare` records property reads through a tracking proxy and compares those reads between snapshots. It supplies the read tracking used by selectorless React hooks.

### Why `useSyncExternalStore` instead of `useState` + `useEffect`?

`useSyncExternalStore` is React's official API for external stores. It:

- Prevents tearing (concurrent mode safe)
- Integrates with React's scheduler
- Works with server-side rendering (via `getServerSnapshot`)
- Is the same API used by Zustand, Redux, and Valtio

### Why `WeakMap` for internal state?

Storing internals in a `WeakMap<proxy, StoreInternal>` instead of on the proxy itself:

- Doesn't pollute the user's object with library metadata
- Allows garbage collection when the store is no longer referenced
- Prevents conflicts with user-defined properties

### Why subclass inheritance works

No special handling is needed — three mechanisms in the existing design make it work automatically:

1. **Methods** — The GET trap uses `Reflect.get(target, prop)`, which naturally walks the JavaScript prototype chain. Methods from any ancestor class are found and bound to the proxy via `.bind(receiver)`, so `this` mutations inside inherited methods go through the SET trap. **Important:** Arrow function properties (`increment = () => {}`) are own properties whose `this` is lexically bound to the raw instance at construction time. `.bind()` is a no-op on arrow functions, so mutations inside them bypass the proxy entirely. Always use prototype methods (`increment() {}`) for reactive mutations.

2. **Getters** — `findPropertyDescriptor()` returns the nearest own or inherited descriptor. The write proxy evaluates a getter when that descriptor defines one. For snapshots, `installMemoizedGetters()` visits the instance and its prototypes in order, so a nearer data field or accessor shadows a base getter with the same key.

3. **Snapshot prototype** — `createSnapshotRecursive()` creates snapshot objects with `Object.create(Object.getPrototypeOf(target))`, preserving the full prototype chain. This means `snapshot(store) instanceof DerivedClass` is `true`, and `installMemoizedGetters()` installs getters from all levels with cross-snapshot memoization.

`super.method()` calls also work because they use the language-level prototype dispatch mechanism, which resolves to the parent method with `this` still bound to the proxy.

## Performance Characteristics

| Operation                    | Complexity                              | Notes                                                                                                                                  |
| ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Data property read           | Prototype lookup and proxy lookup       | Getter detection walks the prototype chain and existing child proxies are reused                                                       |
| Property write               | Depends on the changed ownership graph  | Includes indexing new subtrees, detaching old ones, and visiting owners                                                                |
| Notification                 | Visited owners and callback work        | Synchronous listeners run once per direct write and once per method or array call. Snapshot, selector, and render costs are additional |
| Getter (cache hit)           | Depends on recorded dependencies        | Nested computed dependencies are validated recursively                                                                                 |
| Getter (cache miss)          | Validation plus getter execution        | A stale entry may require dependency checks before the getter runs                                                                     |
| Snapshot (cache hit)         | O(1) for an active node                 | A detached subtree can first reconnect child links and compare saved versions                                                          |
| Snapshot (cache miss)        | Proportional to visited fields/elements | Rebuilds changed containers and scans their entries; unchanged child snapshots are reused                                              |
| Snapshot getter (same snap)  | O(1)                                    | Per-snapshot cache hit                                                                                                                 |
| Snapshot getter (cross-snap) | Depends on the dependency chain         | Each direct read is compared with `Object.is`. Reading another getter can validate its dependencies or run its body                    |
| Selector equality            | O(1) for primitives                     | `Object.is` check                                                                                                                      |
| Auto-track diff              | Depends on tracked operations           | Nested reads, enumeration, and whole-node comparisons can require more work                                                            |
