# Classy Store

Class-based reactive state management for React, Vue, Svelte, Solid, and Angular. Write plain TypeScript classes — get fine-grained reactivity, immutable snapshots, and zero-boilerplate hooks.

```
ES6 Proxy · useSyncExternalStore · proxy-compare
```

## Features

- **Class-based stores** — plain classes with fields, methods, and getters
- **No required wrappers** — shared client stores need no `observer()`, Provider, HOC, or decorator; use context to scope instances
- **React render filtering** — selectors and tracked reads filter updates caused by store subscriptions
- **Immutable snapshots** — structural sharing keeps unchanged sub-trees reference-equal
- **Memoized computed values** — class getters are automatically cached, recompute only when deps change
- **Batched subscriptions** — ordinary listeners coalesce mutations in a microtask; React receives updates synchronously
- **Type-safe** — full TypeScript inference from your class definitions
- **Framework bindings** — React hooks and adapters for Vue, Svelte, Solid, and Angular
- **Two hook modes** — explicit selector or automatic property tracking (React)
- **Reactive collections** — `reactiveMap()` and `reactiveSet()` for Map/Set-like state
- **Persistence** — `persist()` utility with transforms, versioning, migration, debounce, cross-tab sync, TTL expiration, and SSR support
- **DevTools** — `devtools()` connects to Redux DevTools for state inspection and time-travel debugging
- **Property subscriptions** — `subscribeKey()` watches a single property for changes with previous/current values
- **Undo/Redo** — `withHistory()` adds undo/redo via a snapshot stack with pause/resume and configurable limits

## Installation

Upgrading from 0.7.x? Read the [0.8.0 upgrade guide](./UPGRADING_0_8.md) for public API changes and persistence error handling. From 0.6.x or earlier, also follow the [0.7.0 upgrade guide](./UPGRADING_0_7.md).

```bash
bun add @codebelt/classy-store
```

All framework peer dependencies are optional — install only what your project uses:

| Framework | Peer Dependency | Import |
|-----------|----------------|--------|
| React | `react >= 18.0.0` | `@codebelt/classy-store/react` |
| Vue | `vue >= 3.2.0` | `@codebelt/classy-store/vue` |
| Svelte | `svelte >= 4.0.0` | `@codebelt/classy-store/svelte` |
| Solid 2 RC | `solid-js 2.0.0-rc.18` (exact) | `@codebelt/classy-store/solid` |
| Angular | `@angular/core >= 17.0.0` | `@codebelt/classy-store/angular` |

## Quick Start

### 1. Define a store class

```typescript
type Todo = {text: string; done: boolean};

class TodoStore {
  todos: Todo[] = [];
  filter: 'all' | 'done' | 'pending' = 'all';

  // Getter = computed value
  get filtered() {
    if (this.filter === 'all') return this.todos;
    return this.todos.filter((todo) =>
        this.filter === 'done' ? todo.done : !todo.done,
    );
  }

  get remaining() {
    return this.todos.filter((todo) => !todo.done).length;
  }

  addTodo(text: string) {
    this.todos.push({text, done: false});
  }

  toggle(index: number) {
    this.todos[index]!.done = !this.todos[index]!.done;
  }
}
```

### 2. Create a reactive store

This shared instance is for a client-only app. For SSR or independent subtrees,
create stores per request or provider; see [store scoping](./REACT_SCOPING.md).

```typescript
import {createClassyStore} from '@codebelt/classy-store';

const todoStore = createClassyStore(new TodoStore());
```

### 3. Use in React components

```tsx
import {useClassyStore} from '@codebelt/classy-store/react';

// Selector mode: explicit control over what triggers re-renders
function TodoCount() {
  const remaining = useClassyStore(todoStore, (state) => state.remaining);
  return <span>{remaining} left</span>;
}

// Auto-tracked mode: reads are tracked automatically
function TodoList() {
  const snap = useClassyStore(todoStore);
  return (
    <ul>
      {snap.filtered.map((todo, index) => (
        <li key={index}>{todo.text}</li>
      ))}
    </ul>
  );
}

// Actions: call methods directly on the store
function AddButton() {
  return <button onClick={() => todoStore.addTodo('New')}>Add</button>;
}
```

## Choosing an API

| What you need | API |
| --- | --- |
| Create shared state from a class or object | `createClassyStore(instance)` |
| Render store data in React | `useClassyStore(store)` or `useClassyStore(store, selector)` |
| Create a store owned by a component | `useLocalStore(factory)` |
| Bind a reusable hook to an existing store | `createStoreHook(store)` |
| Render undo/redo availability or pause state | `useHistoryStatus(history)` |
| Render persistence hydration, expiry, or errors | `usePersistStatus(handle)` |
| Prepare matching initial data for SSR/hydration | `prepareStoreForHydration(store)` |
| Read state outside React or observe mutations | `snapshot(store)`, `subscribe(store, listener)`, `subscribeKey(store, key, listener)` |
| Persist state, record history, or inspect it in DevTools | `persist(store, options)`, `withHistory(store)`, `devtools(store)` |
| Track changes inside Map-like or Set-like collections | `reactiveMap()`, `reactiveSet()` |
| Compare selector results one level deep | `shallowEqual(previous, next)` |

`useClassyStore` is the starting point for React components. The two status hooks
are optional: use them only when displaying metadata from an existing history or
persistence handle. They do not create those handles or subscribe to store data.

## Package entry points

Import from the entry that owns the API. Core, collections, and utilities do not depend on React.

| Import path | Runtime exports | Public types |
| --- | --- | --- |
| `@codebelt/classy-store` | `createClassyStore`, `snapshot`, `subscribe`, `shallowEqual` | `Snapshot`, `SubscribeOptions` |
| `@codebelt/classy-store/react` | `useClassyStore`, `useLocalStore`, `createStoreHook`, `useHistoryStatus`, `usePersistStatus` | `UseClassyStoreSelectorOptions` |
| `@codebelt/classy-store/react/server` | `prepareStoreForHydration` | — |
| `@codebelt/classy-store/collections` | `reactiveMap`, `reactiveSet` | `ReactiveMap`, `ReactiveSet` |
| `@codebelt/classy-store/utils` | `persist`, `withHistory`, `subscribeKey`, `devtools` | `PersistOptions`, `PersistHandle`, `PersistStatus`, `PersistOperation`, `PropertyTransform`, `StorageAdapter`, `HistoryOptions`, `HistoryHandle`, `HistoryStatus`, `DevtoolsOptions`, `SubscribeOptions` |
| `@codebelt/classy-store/vue` | `useClassyStore` | — |
| `@codebelt/classy-store/svelte` | `toSvelteStore` | `ClassyReadable` |
| `@codebelt/classy-store/solid` | `useClassyStore` | — |
| `@codebelt/classy-store/angular` | `injectStore` | — |

`ReactiveMap` and `ReactiveSet` are exported as types; construct values with the
factory functions. The React entry carries `use client`. Import hydration
preparation from `/react/server` in both server code and client modules.

The other adapters publish whole snapshots. Vue returns a `ShallowRef` and uses
the current effect scope for cleanup; Svelte returns a readable-store interface;
Solid returns a signal accessor and uses its
owner's cleanup; Angular returns a readonly signal and requires an injection
context. React's selector and auto-tracking modes are specific to `/react`.

Svelte's `toSvelteStore(store)` delivers the initial snapshot immediately and
notifies subscribers synchronously after each mutation. `$store` subscriptions
are cleaned up automatically when the component is destroyed; manual subscribers
must call the returned unsubscribe function. Snapshots are readonly: update the
original store or call its actions from input handlers instead of using
`bind:value` on snapshot fields. Angular and ordinary core subscriptions use
microtask batching.

Vue's `useClassyStore(store)` updates its `ShallowRef` synchronously, so computed
values are current immediately after an action and `await nextTick()` waits for
Vue's DOM update. Vue still batches rendering. Call the hook synchronously in
`setup()` / `<script setup>` or inside `effectScope().run()`; it throws without an
active scope, and stops subscribing when that scope is stopped. For inputs, use
`:value` with an action in `@input`, or a writable `computed` that reads the
snapshot and writes through a store action. Do not bind `v-model` directly to
readonly snapshot fields. The Vue adapter requires Vue 3.2 or later for the
Effect Scope API.

Solid's `useClassyStore(store)` targets **Solid 2.0.0-rc.18 only**. It requires a
live component or `createRoot()` owner and disposes its subscription with that
owner. Store notifications reach its signal synchronously; Solid 2 retains its
native batching. Call Solid's `flush()` when imperative code needs current
computed values or DOM. The adapter does not call it automatically, and ordinary
core subscriptions stay batched. See the [Solid 2 guide](./SOLID.md) for pinned
packages, inputs, keyed lists, and migration from Solid 1.

## API Reference

### `createClassyStore(instance)`

Wraps a class instance in a reactive Proxy. Mutations notify React, Vue, and Svelte immediately; ordinary subscribers are batched via `queueMicrotask`.

```typescript
const myStore = createClassyStore(new MyClass());
```

- **Prototype methods** are automatically bound so `this` mutations go through the proxy; arrow-function fields cannot be rebound
- **Getters** are automatically memoized — they only recompute when a dependency changes (like MobX `@computed`)
- **Nested plain objects, arrays, and reactive collections** are lazily deep-proxied on first access; other nested class instances remain opaque

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

const userData = useClassyStore(myStore, (state) => ({
  name: state.user.name,
  role: state.user.role,
}), {isEqual: shallowEqual});
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

Migration: remove `{sync: true}` or `{sync: false}` from React hook calls and remove imports of `UseClassyStoreOptions`. Selector options still support `isEqual`. Synchronous notification does not make a method transactional: selectors can observe each write, while React batches rendering within event handlers.

### `useHistoryStatus(history)`

Use `useClassyStore(store)` for application data. Use `useHistoryStatus(history)` when a component renders undo/redo availability, recording state, or history disposal:

```tsx
import {useHistoryStatus} from '@codebelt/classy-store/react';
import type {HistoryHandle} from '@codebelt/classy-store/utils';

function UndoButton({history}: {history: HistoryHandle}) {
  const {canUndo} = useHistoryStatus(history);
  return <button disabled={!canUndo} onClick={history.undo}>Undo</button>;
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

Creates a component-scoped reactive store. Each component instance gets its own isolated store. Unmounting releases React's reference; the store can be garbage collected when no other references remain.

```tsx
import {useLocalStore, useClassyStore} from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;
  increment() { this.count++; }
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

### `createStoreHook(store)`

Creates a pre-bound React hook for a specific store proxy. Eliminates the boilerplate of writing a typed wrapper around `useClassyStore` for every store instance.

```tsx
import {createClassyStore} from '@codebelt/classy-store';
import {createStoreHook} from '@codebelt/classy-store/react';

class CatalogPageStore {
  items: string[] = [];
  loading = false;

  get count() { return this.items.length; }

  addItem(item: string) { this.items.push(item); }
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
  return <ul>{snap.items.map((item) => <li key={item}>{item}</li>)}</ul>;
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

### `subscribe(store, callback, options?)`

Low-level subscription API. Returns an unsubscribe function. By default, the callback fires once per batched mutation after the microtask flush. Pass `{sync: true}` to notify immediately on each mutation.

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

// Later: unsub();
```

### `shallowEqual(a, b)`

Compares primitives with `Object.is`, arrays by length and elements, and other objects by their own enumerable string keys and values. Use it for selectors returning plain records or arrays when one-level equality matches the UI's needs. It does not compare prototypes, symbol keys, or native `Map`/`Set`/`Date` contents; different instances with no enumerable keys can compare equal.

### `reactiveMap<K, V>(initial?)`

Creates a reactive Map-like collection backed by a plain array. Use inside a `createClassyStore()` for full reactivity. Import from `@codebelt/classy-store/collections`.

```typescript
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';
import {useClassyStore} from '@codebelt/classy-store/react';

class UserStore {
  users = reactiveMap<string, { name: string; role: string }>();

  addUser(id: string, name: string, role: string) {
    this.users.set(id, {name, role});
  }

  removeUser(id: string) {
    this.users.delete(id);
  }
}

const userStore = createClassyStore(new UserStore());

function UserList() {
  const snap = useClassyStore(userStore, (state) => [...state.users.entries()]);
  return (
    <ul>
      {snap.map(([id, user]) => (
        <li key={id}>{user.name} ({user.role})</li>
      ))}
    </ul>
  );
}
```

Supports: `.get()`, `.set()`, `.has()`, `.delete()`, `.clear()`, `.size`, `.keys()`, `.values()`, `.entries()`, `.forEach()`, `for...of`.

### `reactiveSet<T>(initial?)`

Creates a reactive Set-like collection backed by a plain array. Use inside a `createClassyStore()` for full reactivity. Import from `@codebelt/classy-store/collections`.

```typescript
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
  const tags = useClassyStore(tagStore, (state) => [...state.tags]);
  return tags.map(tag => <span key={tag}>{tag}</span>);
}
```

Supports: `.add()`, `.has()`, `.delete()`, `.clear()`, `.size`, `.keys()`, `.values()`, `.entries()`, `.forEach()`, `for...of`.

> **Note:** `reactiveMap()` and `reactiveSet()` are not native `Map`/`Set` instances. Their lookups are linear, and their identity and iterator behavior differ; see [collection behavior](./REACTIVE_COLLECTIONS_TUTORIAL.md#collection-behavior). `instanceof Map` / `instanceof Set` returns `false`.

### `Snapshot<T>`

TypeScript utility type that marks object properties readonly and maps arrays to readonly arrays. Opaque leaf types and function signatures pass through unchanged. Methods remain callable in the type, so call mutating methods on the live store, not its snapshot. Runtime freezing follows the limitations described under [`snapshot`](#snapshotstore).

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
import {persist, devtools, subscribeKey, withHistory} from '@codebelt/classy-store/utils';
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

Add undo/redo capability via a snapshot stack with pause/resume and configurable limits.

```typescript
import {withHistory} from '@codebelt/classy-store/utils';

const history = withHistory(store, {limit: 100});
history.undo();
history.redo();
```

> See the [withHistory Tutorial](./HISTORY_TUTORIAL.md).

## Patterns

### Multiple stores

```typescript
const authStore = createClassyStore(new AuthStore());
const uiStore = createClassyStore(new UiStore());

function Header() {
  const user = useClassyStore(authStore, (state) => state.currentUser);
  const theme = useClassyStore(uiStore, (state) => state.theme);
  return <header className={theme}>{user?.name}</header>;
}
```

### Class inheritance

Subclasses work out of the box. Methods, getters, and `super` calls from any ancestor are fully reactive:

```typescript
class BaseStore {
  loading = false;
  error: string | null = null;

  get hasError() { return this.error !== null; }
  setLoading(value: boolean) { this.loading = value; }
  setError(msg: string | null) { this.error = msg; }
}

class UserStore extends BaseStore {
  users: string[] = [];

  get count() { return this.users.length; }

  addUser(name: string) {
    this.users.push(name);
  }
}

const userStore = createClassyStore(new UserStore());

// Base methods, derived methods, base getters, derived getters — all reactive.
// snapshot(userStore) instanceof UserStore === true
```

### Nested object mutations

Nested objects are deeply reactive. Mutations at any depth trigger the correct re-renders:

```typescript
class SettingsStore {
  settings = {
    theme: 'dark',
    notifications: {
      email: true,
      push: false,
    },
  };

  togglePush() {
    this.settings.notifications.push = !this.settings.notifications.push;
  }
}

const settingsStore = createClassyStore(new SettingsStore());

// Only re-renders when push notification setting changes
function PushToggle() {
  const push = useClassyStore(settingsStore, (state) => state.settings.notifications.push);
  return <Switch checked={push} onChange={() => settingsStore.togglePush()} />;
}
```

### Array operations

Arrays support all standard operations — `push`, `splice`, `pop`, `shift`, index assignment, etc. Ordinary subscribers receive one microtask notification for consecutive mutations:

```typescript
class ListStore {
  items: string[] = [];

  addMany(newItems: string[]) {
    // Multiple pushes = one ordinary subscription notification
    for (const item of newItems) {
      this.items.push(item);
    }
  }

  removeAt(index: number) {
    this.items.splice(index, 1);
  }
}
```

### Computed getters (automatic memoization)

Class getters are automatically memoized at two levels — no `computed()` wrapper needed:

**Write proxy:** getters track which properties they read. The result is cached and only recomputes when a dependency changes:

```typescript
class Store {
  items = ['a', 'b', 'c'];
  filter = 'all';

  get filtered() {
    // Only runs when `items` or `filter` changes.
    // Accessing store.filtered multiple times returns the same reference.
    if (this.filter === 'all') return this.items;
    return this.items.filter(item => item === this.filter);
  }

  get filteredCount() {
    // Nested getters work: reads this.filtered (itself memoized)
    return this.filtered.length;
  }
}
```

**Snapshots:** getter results are stable across snapshots when dependencies haven't changed. Selecting those cached results works with `Object.is` by default:

```typescript
// Stable reference across re-renders when items/filter haven't changed.
// No shallowEqual required!
const filtered = useClassyStore(myStore, (state) => state.filtered);
```

When a dependency changes, a getter can produce a new object or array with equal
contents; custom equality can still help there. Keep getters pure and based on
explicit store property reads. Time, external variables, and property enumeration
alone do not invalidate their dependency cache.

### Working with Date and RegExp

`Date` and `RegExp` are **not proxied** — they are treated as opaque values. Replace them entirely to trigger an update:

```typescript
class Store {
  date = new Date();
  regex = /test/;

  updateDate() {
    // ❌ Mutation: won't trigger update
    // this.date.setFullYear(2025);

    // ✅ Replacement: triggers update
    this.date = new Date();
  }
}
```

For `Map` and `Set` semantics, use [`reactiveMap()`](#reactivemapk-vinitial) and [`reactiveSet()`](#reactivesettinitial) instead of native `Map`/`Set`.

## React Compiler compatibility

Direct and bound hooks work in compiled consumers with either selectors or auto-tracking. The regression matrix compiles consumer components with React Compiler 1.0 using default inference, then runs them against the packed library on React 18.0, 18.3, and 19.3. Fixtures must report successful compilation with memo slots; silently skipped components fail the checks. The library does not require a `"use no memo"` directive or custom compiler configuration.

Auto-tracking retains earlier committed reads while an immutable snapshot object is reused, including structurally shared children. This protects dependencies inside cached helpers, array calculations, and memoized children. After a conditional branch changes, an earlier read can still trigger an extra render until that snapshot object's identity changes. Use an explicit selector when exact selected-value equality matters.

Read render data through `useClassyStore` or a bound hook. The original store proxy remains mutable and is intended for actions; reading it directly during render does not subscribe the component. Configure the compiler target for your React version; React 18 apps need the compiler runtime described in [React's target documentation](https://react.dev/reference/react-compiler/target).

Run `bun run test:react:compiler` for the installed-package matrix and `bun run test:browser` for compiled controlled inputs and memoized children in Chromium, Firefox, and WebKit.

## When to use each mode

| Mode | Best for | How it works |
|------|----------|--------------|
| `useClassyStore(store, selector)` | Derived values, primitives, specific slices | Selector runs on snapshot, compared with `Object.is` |
| `useClassyStore(store)` | Components reading many props, rapid prototyping | `proxy-compare` tracks reads automatically |
| `useClassyStore(store, selector, {isEqual: shallowEqual})` | Selectors returning new objects/arrays | Shallow comparison prevents unnecessary re-renders |
| `useClassyStore(store, selector)` | Controlled form fields | Always notifies React during the input event turn |

## Comparison with other libraries

Classy Store combines class methods, memoized getters, snapshots, and React hooks
with selectors or automatic property tracking. Compare the APIs and tradeoffs in
the official documentation for [Zustand](https://zustand.docs.pmnd.rs/),
[MobX](https://mobx.js.org/), and [Valtio](https://valtio.dev/).

Bundle size depends on the imported entry points, bundler, and compression settings.
Measure the production bundle for your application's imports; a package tarball's
size is not the amount of JavaScript delivered to the browser.

## Vision

I wanted state management that feels like writing plain TypeScript.

- **A class is the store.** Define fields, methods, and getters — that's your state, your actions, and your derived values. The class *is* the type. TypeScript infers everything automatically.
- **Getters are computed values.** Write `get filtered()` and it's memoized with dependency tracking out of the box. It caches until a dependency changes.
- **Framework bindings that feel native.** React's `useClassyStore`, Vue's `useClassyStore` (ShallowRef), Svelte's `toSvelteStore`, Solid's `useClassyStore` (signal getter), Angular's `injectStore` — each integration matches the framework's reactive idioms.
- **Call methods directly.** `todoStore.addTodo('Buy milk')` — a real object with real methods, callable from anywhere.
- **Filter React store updates.** Selectors and automatic tracking can skip subscription-driven renders for unchanged data.

Clean, simple, and type-safe. That was the whole idea.

## Acknowledgements

This library wouldn't exist without the ideas pioneered by these projects. Each one taught us something different, and we took the best of each:

**[MobX](https://github.com/mobxjs/mobx)** — The OG of class-based reactive state. MobX proved that classes with fields, methods, and getters are the most natural way to model state. We took its `makeAutoObservable` philosophy — everything is reactive by default, no decorators or boilerplate — and its automatic computed memoization with fine-grained dependency tracking. MobX showed that getters should "just work" as cached derived values.

**[Valtio](https://github.com/pmndrs/valtio)** — Daishi Kato's proxy-based masterpiece gave us the core architectural pattern: a mutable write proxy for ergonomic mutations paired with immutable snapshots for React integration. Valtio's structural sharing approach — where unchanged sub-trees keep the same frozen reference across snapshots — is what makes `Object.is` selectors efficient without custom equality. We also adopted its `proxy-compare` library for automatic property tracking in selectorless mode.

**[Zustand](https://github.com/pmndrs/zustand)** — Also by Daishi Kato, Zustand set the standard for minimal, hook-first state management. Its selector pattern (`useClassyStore(store, s => s.count)`) with `Object.is` equality is what we use in selector mode. Zustand proved that you don't need Providers, context wrappers, or HOCs — just a hook and a store. Its focus on tiny bundle size pushed us to keep things lean.

**[proxy-compare](https://github.com/dai-shi/proxy-compare)** — The property-tracking utility by Dai-shi that powers our auto-tracked mode. It wraps snapshot objects in a tracking proxy, recording which properties a component reads, then compares those reads between snapshots. This lets components subscribe without writing explicit selectors.

**[React](https://react.dev)** — React 18's `useSyncExternalStore` is the foundation of our hook layer. It provides tear-free concurrent-mode-safe integration with external stores, and it's the same API used by Zustand, Redux, and Valtio under the hood.

**[Claude 4.6 Opus](https://anthropic.com)** — Let's be real: this library was designed, architected, implemented, tested, and documented almost entirely by Claude 4.6 Opus (Anthropic) via [Cursor](https://cursor.com). From the three-layer proxy architecture to the memoized computed getters with dependency tracking, the cross-snapshot caching strategy, and tests — it was all pair-programmed with an AI that never gets tired of writing Proxy traps. The human brought the vision, the taste, and the "no, make it better" energy. Claude brought the code.
