---
title: "API reference"
description: "Public entry points, types, hooks, and utility signatures for Classy Store."
---

## Choosing an API

| What you need                                            | API                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Create shared state from a class or object               | `createClassyStore(instance)`                                                         |
| Render store data in React                               | `useClassyStore(store)` or `useClassyStore(store, selector)`                          |
| Create a store owned by a component                      | `useLocalStore(factory)`                                                              |
| Bind a reusable hook to an existing store                | `createStoreHook(store)`                                                              |
| Render undo/redo availability or pause state             | `useHistoryStatus(history)`                                                           |
| Render persistence hydration, expiry, or errors          | `usePersistStatus(handle)`                                                            |
| Prepare matching initial data for SSR/hydration          | `prepareStoreForHydration(store)`                                                     |
| Read state outside React or observe mutations            | `snapshot(store)`, `subscribe(store, listener)`, `subscribeKey(store, key, listener)` |
| Persist state, record history, or inspect it in DevTools | `persist(store, options)`, `withHistory(store)`, `devtools(store)`                    |
| Track changes inside Map-like or Set-like collections    | `reactiveMap()`, `reactiveSet()`                                                      |
| Compare selector results one level deep                  | `shallowEqual(previous, next)`                                                        |

`useClassyStore` is the starting point for React components. The two status hooks
are optional: use them only when displaying metadata from an existing history or
persistence handle. They do not create those handles or subscribe to store data.

## Package entry points

Import from the entry that owns the API. Core, collections, and utilities do not depend on React.

| Import path                           | Runtime exports                                                                              | Public types                                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codebelt/classy-store`              | `createClassyStore`, `snapshot`, `subscribe`, `shallowEqual`                                 | `Snapshot`, `SubscribeOptions`                                                                                                                                                                           |
| `@codebelt/classy-store/react`        | `useClassyStore`, `useLocalStore`, `createStoreHook`, `useHistoryStatus`, `usePersistStatus` | `UseClassyStoreSelectorOptions`                                                                                                                                                                          |
| `@codebelt/classy-store/react/server` | `prepareStoreForHydration`                                                                   | —                                                                                                                                                                                                        |
| `@codebelt/classy-store/collections`  | `reactiveMap`, `reactiveSet`                                                                 | `ReactiveMap`, `ReactiveSet`                                                                                                                                                                             |
| `@codebelt/classy-store/utils`        | `persist`, `withHistory`, `subscribeKey`, `devtools`                                         | `PersistOptions`, `PersistHandle`, `PersistStatus`, `PersistOperation`, `PropertyTransform`, `StorageAdapter`, `HistoryOptions`, `HistoryHandle`, `HistoryStatus`, `DevtoolsOptions`, `SubscribeOptions` |
| `@codebelt/classy-store/vue`          | `useClassyStore`                                                                             | —                                                                                                                                                                                                        |
| `@codebelt/classy-store/svelte`       | `toSvelteStore`                                                                              | `ClassyReadable`                                                                                                                                                                                         |
| `@codebelt/classy-store/solid`        | `useClassyStore`                                                                             | —                                                                                                                                                                                                        |
| `@codebelt/classy-store/angular`      | `injectClassyStore`                                                                          | —                                                                                                                                                                                                        |

ESM and CommonJS callers using the same package installation can pass stores
between them. For example, a utility loaded with `require('@codebelt/classy-store/utils')`
can call `withHistory(store)` on a store created by an ESM import.

`ReactiveMap` and `ReactiveSet` are exported as types; construct values with the
factory functions. The React entry carries `use client`. Import hydration
preparation from `/react/server` in both server code and client modules.

The other adapters publish whole snapshots. Vue returns a `Ref<Snapshot<T>>`
backed by `shallowRef` and uses the current effect scope for cleanup; Svelte returns a readable-store interface;
Solid returns a signal accessor and uses its
owner's cleanup; Angular returns a readonly signal and requires an injection
context. React's selector and auto-tracking modes are specific to `/react`.

Read the [Svelte guide](./SVELTE.md) or [Vue guide](./VUE.md) for input handling, timing, and cleanup.

Solid's `useClassyStore(store)` targets **Solid 2.0.0-rc.18 only**. It requires a
live component or `createRoot()` owner and disposes its subscription with that
owner. Store notifications reach its signal synchronously; Solid 2 retains its
native batching. Call Solid's `flush()` when imperative code needs current
computed values or DOM. The adapter does not call it automatically, and ordinary
core subscriptions stay batched. See the [Solid 2 guide](./SOLID.md) for pinned
packages, inputs, keyed lists, and migration from Solid 1.

Angular's `injectClassyStore(store)` supports **all stable Angular 22 releases**
(`^22.0.0`). It requires a live
injection context and returns a readonly signal. Store writes update the signal
and dependent computed reads immediately; Angular schedules effects and rendering,
including zoneless `OnPush` views. Cleanup follows the injected `DestroyRef`.
See the [Angular guide](./ANGULAR.md) for inputs, keyed lists, and migration.

## API Reference

### `createClassyStore(instance)`

Wraps a class instance or plain object in a reactive proxy. Passing the same instance or its store proxy again returns the existing proxy. Mutations notify framework adapters synchronously. Ordinary subscribers receive a batched notification in a microtask.

```typescript
const myStore = createClassyStore(new MyClass());
```

- **Prototype methods** are automatically bound so `this` mutations go through the proxy; arrow-function fields cannot be rebound
- **Getters** cache results from the store properties they read. Initialize optional fields used in getters, including fields whose initial value is `undefined`. A live getter that reads an absent field recomputes on subsequent reads
- **Nested plain objects, arrays, and reactive collections** share a single proxy per object. Retained rows stay reactive after reordering or filtering. A separately created store embedded by its proxy stays reactive too. Ordinary nested class instances remain opaque

Keep the returned proxy as the mutable store. Writes to the original instance
or raw nested objects bypass notifications and snapshot invalidation. See the
[mutation and getter constraints](./TUTORIAL.md#tips--gotchas).

### `useClassyStore(store, selector?, options?)`

React hook that subscribes to store changes via `useSyncExternalStore`.

```typescript
type UseClassyStoreSelectorOptions<S> = {
  isEqual?: (previous: S, next: S) => boolean;
};
```

**Selector mode:**

```typescript
const count = useClassyStore(myStore, (state) => state.count);
const user = useClassyStore(myStore, (state) => state.user);
const items = useClassyStore(myStore, (state) => state.items);
```

The selector receives a readonly snapshot. Subscription-driven updates compare the selected value using `Object.is` by default, or `options.isEqual`. Parent renders, local state, context, and React's development checks can still render the component independently of this subscription.

**Auto-tracked mode:**

```typescript
const snap = useClassyStore(myStore);
// Access snap.count, snap.user.name, etc.
// Store updates are filtered using tracked property reads
```

Returns a tracking proxy. Properties your component reads are automatically tracked. Committed reads remain associated with each reused immutable snapshot object, so memoized calculations and children stay reactive even when they skip property reads on a later render. Abandoned renders do not publish their reads. Unchanged snapshots and nested tracked values retain their references across parent re-renders.

Auto-tracking requires native `WeakRef` support (ES2021). Tracking dependencies use weak references so cached child proxies do not keep obsolete collection snapshots alive. Applications still own references they explicitly retain, and stores prepared for hydration deliberately retain their initial snapshot while that store remains reachable.

**Custom equality:**

```typescript
import {shallowEqual} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';

const userData = useClassyStore(
  myStore,
  (state) => ({
    name: state.user.name,
    role: state.user.role,
  }),
  {isEqual: shallowEqual},
);
```

**Controlled input timing:**

```tsx
const name = useClassyStore(formStore, (state) => state.name);

return (
  <input
    value={name}
    onChange={(event) => formStore.setName(event.target.value)}
  />
);
```

React subscriptions always notify synchronously, including selector, auto-tracked, and bound hooks. There is no React `sync` option. This lets React observe controlled-field changes during the input event and preserve caret position. Ordinary `subscribe()` callbacks remain batched.

When upgrading from 0.6.x, remove the React hook's `sync` option and imports of `UseClassyStoreOptions`. Selector options still support `isEqual`. Selectors can observe each write to a store even when React batches the resulting renders. [0.7.0 upgrade guide](./UPGRADING_0_7.md)

### `useHistoryStatus(history)`

Use `useClassyStore(store)` for application data. Use `useHistoryStatus(history)` when a component renders undo/redo availability, recording state, or history disposal:

```tsx
import {useHistoryStatus} from '@codebelt/classy-store/react';
import type {HistoryHandle} from '@codebelt/classy-store/utils';

function UndoButton({history}: {history: HistoryHandle}) {
  const {canUndo} = useHistoryStatus(history);
  return (
    <button disabled={!canUndo} onClick={history.undo}>
      Undo
    </button>
  );
}
```

The hook accepts the `HistoryHandle` returned by `withHistory(store)` and returns `HistoryStatus`: `canUndo`, `canRedo`, `isPaused`, and `isDisposed`. It updates even when store data stays unchanged, such as when recording is paused. Creating or using history does not require the hook.

### `usePersistStatus(handle)`

Use `usePersistStatus(handle)` when a component renders persistence hydration, expiry, disposal, or errors:

```tsx
import {usePersistStatus} from '@codebelt/classy-store/react';
import type {PersistHandle} from '@codebelt/classy-store/utils';

function PersistenceBadge({handle}: {handle: PersistHandle}) {
  const {isHydrated, lastError} = usePersistStatus(handle);
  if (lastError) return <span>Persistence failed: {lastError.operation}</span>;
  return <span>{isHydrated ? 'Ready' : 'Restoring…'}</span>;
}
```

The hook accepts the `PersistHandle` returned by `persist(store, options)` and returns `PersistStatus`: `isHydrated`, `isExpired`, `isDisposed`, and `lastError` (`{error, operation}` or `null`). `isHydrated` means a hydration attempt settled; inspect `lastError` for a reported failure. Configuring persistence and calling its methods do not require the hook.

Both hooks return readonly status snapshots whose identity stays stable until a status field changes. They share an internal subscription implementation. Status listeners run synchronously when status changes; ordinary store subscriptions, including history recording, remain batched. Unmounting a status consumer removes its listener without disposing the handle.

Outside React, both handles provide framework-neutral status methods: `getSnapshot()`, `getServerSnapshot()`, and `subscribe(listener)`, which returns listener cleanup.

For SSR, handles expose their initial status through `getServerSnapshot()` and React catches up with live status after hydration. Construct request-scoped handles and matching client handles with the same initial status; keep persistence side effects in the provider lifecycle described in [React store scoping](./REACT_SCOPING.md).

### `prepareStoreForHydration(store)`

Captures the initial snapshot for server rendering and client hydration, returning the same mutable store proxy:

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';

const store = prepareStoreForHydration(
  createClassyStore(new ProfileStore(initialData)),
);
```

Call on each request's store and its client counterpart using matching initial data, before rendering or starting persistence. Direct and bound hooks hydrate from the captured snapshot even if persistence updates the live store before a Suspense boundary hydrates. After hydration they read current state normally.

Preparation is idempotent, retains the first snapshot for the store's lifetime, and applies to the exact proxy passed in. Client-only apps need no preparation. See [React SSR and hydration](./REACT_SSR.md) for streaming, request isolation, nested proxies, and snapshot leaf semantics.

Import the preparation helper from `@codebelt/classy-store/react/server` on both the server and client. It does not import React hooks; the separate `/react` hooks entry is marked `use client`. See [Next.js App Router](./REACT_NEXT.md) for production package boundaries and navigation patterns.

### `useLocalStore(factory)`

Creates a component-scoped reactive store from the factory's return value. Return a fresh instance for each mount to isolate components. A factory that returns the same object shares its proxy across mounts. Unmounting releases React's reference, and the store can be collected once other owners release it.

```tsx
import {useLocalStore, useClassyStore} from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;
  increment() {
    this.count++;
  }
}

function Counter() {
  const store = useLocalStore(() => new CounterStore());
  const count = useClassyStore(store, (state) => state.count);

  return <button onClick={() => store.increment()}>Count: {count}</button>;
}
```

Subsequent re-renders reuse the same store instance. Keep the factory pure: React StrictMode can invoke the initializer more than once in development.

For a shared subtree, use the [typed context and lifecycle example](./REACT_SCOPING.md). It covers independent and nested instances, explicit resets with React keys, effect cleanup, persistence, and SSR. `useLocalStore` owns the instance reference; application side effects still need cleanup in their effects.

> See the [Local Stores](./TUTORIAL.md#local-stores) section in the Tutorial for persistence patterns and more examples.

[Open local counter example →](/examples/use-local-store/)

### `createStoreHook(store)`

Creates a pre-bound React hook for a specific store proxy. Eliminates the boilerplate of writing a typed wrapper around `useClassyStore` for every store instance.

```tsx
import {createClassyStore} from '@codebelt/classy-store';
import {createStoreHook} from '@codebelt/classy-store/react';

class CatalogPageStore {
  items: string[] = [];
  loading = false;

  get count() {
    return this.items.length;
  }

  addItem(item: string) {
    this.items.push(item);
  }
}

const catalogStore = createClassyStore(new CatalogPageStore());
export const useCatalogStore = createStoreHook(catalogStore);
```

The returned hook supports both selector mode and auto-tracked mode — identical to `useClassyStore`, but with the store already bound:

```tsx
// Selector mode
function ItemCount() {
  const count = useCatalogStore((state) => state.count);
  return <span>{count} items</span>;
}

// Auto-tracked mode
function ItemList() {
  const snap = useCatalogStore();
  return (
    <ul>
      {snap.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// Custom equality
import {shallowEqual} from '@codebelt/classy-store';

function Summary() {
  const data = useCatalogStore(
    (state) => ({count: state.count, loading: state.loading}),
    {isEqual: shallowEqual},
  );
  return <div>{data.loading ? 'Loading...' : `${data.count} items`}</div>;
}
```

Validates at creation time — throws if the argument is not a store proxy.

### `snapshot(store)`

Reads a snapshot with frozen copies of the root state, nested plain objects, arrays, and reactive collections, cached by store version with structural sharing. Opaque leaves such as native `Map`, `Set`, `Date`, functions, and other nested class instances retain their references. New objects returned by computed getters are cached but not automatically frozen. Treat all results as readonly; see [snapshot semantics](./TUTORIAL.md#snapshots).

```typescript
import {snapshot} from '@codebelt/classy-store';

const snap = snapshot(myStore);
// Copied objects and arrays are frozen; mutate the store, not its snapshot.
// Structural sharing: unchanged sub-trees === previous snapshot
```

[Open snapshots example →](/examples/snapshots/)

### `subscribe(store, callback, options?)`

Returns an unsubscribe function. By default, consecutive writes before the scheduled microtask runs produce one callback during that microtask. Pass `{sync: true}` to notify immediately after each mutation.

A subscription to a store created by `createClassyStore()` observes its own subtree, even when another store contains it. A subscription to a child proxy also observes siblings within its nearest owning stores. Moving that child updates its subscription scope automatically.

```typescript
import {subscribe} from '@codebelt/classy-store';

const unsub = subscribe(myStore, () => {
  console.log('Store changed');
});

const unsubSync = subscribe(
  myStore,
  () => {
    console.log('Store changed synchronously');
  },
  {sync: true},
);

// When the listeners are no longer needed:
unsub();
unsubSync();
```

### `shallowEqual(a, b)`

Use `shallowEqual` for selectors returning arrays or plain records with enumerable data fields. It compares primitives with `Object.is` and arrays by length, occupied indices, and element values. A hole differs from an explicit `undefined` element. Comparing an array with a record returns `false`.

For records it compares enumerable string-key counts, then checks each key from the first record for own membership and an `Object.is`-equal value in the second. If keys differ in enumerability, the result can depend on argument order. Symbol keys, prototypes, and the contents of native maps, sets, and dates fall outside this comparison.

[Compare selectors with shallowEqual →](/examples/shallow-equal/)

### `reactiveMap<K, V>(initial?)`

Creates a reactive Map-like collection backed by a plain array. Use inside a `createClassyStore()` for full reactivity. Import from `@codebelt/classy-store/collections`.

```tsx
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';
import {useClassyStore} from '@codebelt/classy-store/react';

class UserStore {
  users = reactiveMap<string, {name: string; role: string}>();

  addUser(id: string, name: string, role: string) {
    this.users.set(id, {name, role});
  }

  removeUser(id: string) {
    this.users.delete(id);
  }
}

const userStore = createClassyStore(new UserStore());

function UserList() {
  const users = useClassyStore(userStore, (state) => state.users);
  return (
    <ul>
      {[...users].map(([id, user]) => (
        <li key={id}>
          {user.name} ({user.role})
        </li>
      ))}
    </ul>
  );
}
```

Supports: `.get()`, `.set()`, `.has()`, `.delete()`, `.clear()`, `.size`, `.keys()`, `.values()`, `.entries()`, `.forEach()`, `for...of`.

### `reactiveSet<T>(initial?)`

Creates a reactive Set-like collection backed by a plain array. Use inside a `createClassyStore()` for full reactivity. Import from `@codebelt/classy-store/collections`.

```tsx
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveSet} from '@codebelt/classy-store/collections';
import {useClassyStore} from '@codebelt/classy-store/react';

class TagStore {
  tags = reactiveSet<string>();

  addTag(tag: string) {
    this.tags.add(tag);
  }
}

const tagStore = createClassyStore(new TagStore());

function TagList() {
  const tags = useClassyStore(tagStore, (state) => state.tags);
  return (
    <ul>
      {[...tags].map((tag) => (
        <li key={tag}>{tag}</li>
      ))}
    </ul>
  );
}
```

Supports: `.add()`, `.has()`, `.delete()`, `.clear()`, `.size`, `.keys()`, `.values()`, `.entries()`, `.forEach()`, `for...of`.

> **Note:** `reactiveMap()` and `reactiveSet()` are not native `Map`/`Set` instances. Their lookups are linear, and their identity and iterator behavior differ; see [collection behavior](./REACTIVE_COLLECTIONS_TUTORIAL.md#collection-behavior). `instanceof Map` / `instanceof Set` returns `false`.

### `Snapshot<T>`

TypeScript utility type that marks object properties readonly and maps mutable arrays to readonly arrays. Primitive and function types, dates, regular expressions, errors, native maps and sets, weak collections, and promises pass through unchanged. Other class types receive readonly properties even when their instances remain opaque at runtime. Methods keep their signatures. Call mutating methods on the live store. See the runtime [snapshot semantics](#snapshotstore).

```typescript
import type {Snapshot} from '@codebelt/classy-store';

type MyStoreSnap = Snapshot<MyStore>;
// All properties are readonly, arrays become ReadonlyArray, etc.
```

## Collections (`@codebelt/classy-store/collections`)

Reactive Map and Set types are available via a separate entry point:

```typescript
import {reactiveMap, reactiveSet} from '@codebelt/classy-store/collections';
```

## Utilities (`@codebelt/classy-store/utils`)

Tree-shakeable utilities are available via a separate entry point:

```typescript
import {
  persist,
  devtools,
  subscribeKey,
  withHistory,
} from '@codebelt/classy-store/utils';
```

### `persist(store, options)`

Persist store state to storage with transforms, versioning, migration, cross-tab sync, and SSR support. The default property selection excludes getters and methods; an explicit `properties` list should contain writable data fields.

```typescript
import {persist} from '@codebelt/classy-store/utils';

const handle = persist(todoStore, {name: 'todo-store', storage: localStorage});

// When this store's owner no longer needs persistence:
handle.dispose();
```

> See the [Persist Tutorial](./PERSIST_TUTORIAL.md) and [Persist Architecture](./PERSIST_ARCHITECTURE.md).

### `devtools(store, options?)`

Connect a store to Redux DevTools for state inspection and time-travel debugging.

```typescript
import {devtools} from '@codebelt/classy-store/utils';

const disconnect = devtools(myStore, {name: 'MyStore'});
```

> See the [DevTools Tutorial](./DEVTOOLS_TUTORIAL.md).

### `subscribeKey(store, key, callback, options?)`

Subscribe to changes on a single property, comparing snapshot values with `Object.is`. Notifications are batched by default; pass `{sync: true}` as the fourth argument to observe each change immediately. Returns listener cleanup.

```typescript
import {subscribeKey} from '@codebelt/classy-store/utils';

const unsub = subscribeKey(store, 'theme', (value, prev) => {
  console.log(`Theme: ${prev} → ${value}`);
});
```

> See the [subscribeKey Tutorial](./SUBSCRIBE_KEY_TUTORIAL.md).

### `withHistory(store, options?)`

Adds undo and redo with a bounded history of snapshots. Recording uses a batched subscription, so consecutive writes in the same turn produce one entry.

```typescript
import {createClassyStore} from '@codebelt/classy-store';
import {withHistory} from '@codebelt/classy-store/utils';

const store = createClassyStore({count: 0});
const history = withHistory(store, {limit: 100});
store.count = 1;
await Promise.resolve(); // let the recording subscription run
history.undo(); // count is 0
history.redo(); // count is 1
history.dispose();
```

> See the [withHistory Tutorial](./HISTORY_TUTORIAL.md).

## React Compiler compatibility

Direct and bound hooks work in compiled consumers with either selectors or auto-tracking. The regression matrix compiles consumer components with React Compiler 1.0 using default inference, then runs them against the packed library on React 18.0, 18.3, 19.0, and 19.3. Fixtures must report successful compilation with memo slots; silently skipped components fail the checks. The library does not require a `"use no memo"` directive or custom compiler configuration.

Auto-tracking retains earlier committed reads while an immutable snapshot object is reused, including structurally shared children. This protects dependencies inside cached helpers, array calculations, and memoized children. After a conditional branch changes, an earlier read can still trigger an extra render until that snapshot object's identity changes. Use an explicit selector when exact selected-value equality matters.

Read render data through `useClassyStore` or a bound hook. The original store proxy remains mutable and is intended for actions; reading it directly during render does not subscribe the component. Configure the compiler target for your React version; React 18 apps need the compiler runtime described in [React's target documentation](https://react.dev/reference/react-compiler/target).

Run `bun run test:react:compiler` for the installed-package matrix and `bun run test:browser` for compiled controlled inputs and memoized children in Chromium, Firefox, and WebKit.

## When to use each mode

| Mode                                                       | Best for                                         | How it works                                         |
| ---------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `useClassyStore(store, selector)`                          | Derived values, primitives, specific slices      | Selector runs on snapshot, compared with `Object.is` |
| `useClassyStore(store)`                                    | Components reading many props, rapid prototyping | `proxy-compare` tracks reads automatically           |
| `useClassyStore(store, selector, {isEqual: shallowEqual})` | Selectors returning new objects/arrays           | Shallow comparison prevents unnecessary re-renders   |
| `useClassyStore(store, selector)`                          | Controlled form fields                           | Always notifies React during the input event turn    |
