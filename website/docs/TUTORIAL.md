# Classy Store Tutorial

`Classy Store` is a reactive state library for React, Vue, Svelte, Solid, and Angular built on ES proxies. Define state as classes, wrap them with `createClassyStore()`, and read them with the binding for your framework. Shared client stores need no Provider, observer, or reducer; context providers can scope independent instances. The library batches ordinary subscriptions while notifying React and Svelte synchronously, and uses structural sharing for change detection.

## Quick Start

**1. Define a class:**

```ts
// stores.ts
import {createClassyStore} from '@codebelt/classy-store';

class Counter {
  count = 0;

  increment() {
    this.count++;
  }
}

export const counterStore = createClassyStore(new Counter());
```

**2. Use it in a component:**

```tsx
// Counter.tsx
import {useClassyStore} from '@codebelt/classy-store/react';
import {counterStore} from './stores';

export function Counter() {
  const count = useClassyStore(counterStore, (state) => state.count);
  return <button onClick={counterStore.increment}>Count: {count}</button>;
}
```

This module-level instance is shared by importers in a client-only app. For SSR, create a separate instance per request or provider using the [scoping guide](./REACT_SCOPING.md).

## Defining Stores

A store is any class instance wrapped with `createClassyStore()`. State lives as properties, mutations are plain assignments, and computed values are `get` accessors.

```ts
import {createClassyStore} from '@codebelt/classy-store';

class TodoStore {
  items: { id: number; text: string; done: boolean }[] = [];
  filter: 'all' | 'active' | 'done' = 'all';

  get remaining() {
    return this.items.filter((item) => !item.done).length;
  }

  get filtered() {
    if (this.filter === 'active') return this.items.filter((item) => !item.done);
    if (this.filter === 'done') return this.items.filter((item) => item.done);
    return this.items;
  }

  add(text: string) {
    this.items.push({id: Date.now(), text, done: false});
  }

  toggle(id: number) {
    const item = this.items.find((todo) => todo.id === id);
    if (item) item.done = !item.done;
  }

  remove(id: number) {
    this.items = this.items.filter((todo) => todo.id !== id);
  }
}

export const todoStore = createClassyStore(new TodoStore());
```

Key points:

- Prototype methods mutate state by assigning to `this` through the proxy. Arrow-function fields cannot be rebound; see [method constraints](#dont-use-arrow-functions-for-methods).
- `get` accessors cache derived values until their tracked store dependencies change. Keep them pure; time and external variables are not tracked dependencies.
- Nested objects and arrays (like `items` and each item inside it) are automatically wrapped in child proxies. `item.done = true` triggers a notification just like a top-level write.

## Reading State in React

`useClassyStore` has two modes for filtering updates caused by store subscriptions. Neither prevents renders caused by a parent, local state, context, or React's development checks.

### Selector mode

```ts
const count = useClassyStore(counterStore, (state) => state.count);
```

The selector receives a readonly snapshot and returns the slice you need. Store updates are filtered by comparing that value with `Object.is`.

> **When to use:** When you want explicit dependencies or selected-value equality. The cost depends on the selector and workload.

### Auto-tracked mode

```ts
const snap = useClassyStore(counterStore);
// Read snap.count in your JSX.
```

Without a selector, you get a tracking proxy over the snapshot. The library records property reads to filter store updates. It retains committed reads for reused snapshot objects to support memoized consumers, so a formerly used property can still trigger an extra update; see [Compiler compatibility](./index.md#react-compiler-compatibility).

> **When to use:** When you'd need 3+ selectors in one component, when prototyping, or when the shape of data you access is dynamic.

### Custom equality with `shallowEqual`

By default, `useClassyStore` compares the selector's return value with `Object.is`, which is a reference check. This works perfectly for primitives and for selecting existing properties directly — structural sharing means that if `todos` didn't change, the snapshot returns the **same frozen array reference**, so `Object.is` returns `true` and the component skips the re-render.

```ts
// ✅ No shallowEqual needed — structural sharing keeps the reference stable
const count = useClassyStore(todoStore, (state) => state.items.length);
const todos = useClassyStore(todoStore, (state) => state.items);
```

The problem shows up when your selector **derives a new value** — calling `.filter()`, `.map()`, or using object spread always allocates a new array or object, even when the underlying data hasn't changed. `Object.is` sees a different reference and triggers a re-render.

`shallowEqual` compares one level deep: array length and elements, or an object's own enumerable string keys and values, using `Object.is`. Use it for plain records and arrays. It does not inspect prototypes, symbol keys, or native `Map`/`Set`/`Date` contents, so it is not a general equality function for those values.

Without `shallowEqual` — `.filter()` creates a new array every time the snapshot updates, even if the todo items haven't changed:

```ts
import {useClassyStore} from '@codebelt/classy-store/react';

// ❌ New array reference every snapshot → unnecessary re-renders
const active = useClassyStore(todoStore, (state) => state.items.filter((item) => !item.done));
```

With `shallowEqual` — compares the array contents, not the reference:

```ts
import {shallowEqual} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';

// ✅ Only re-renders when the filtered items actually change
const active = useClassyStore(
  todoStore,
  (state) => state.items.filter((item) => !item.done),
  {isEqual: shallowEqual},
);
```

**Getters often avoid the need for `shallowEqual`.** Class getters benefit from cross-snapshot memoization: the library tracks which `this` properties a getter reads and caches the result. If those properties are unchanged, the cached result is reused across snapshots:

```ts
// ✅ No shallowEqual needed — cross-snapshot memoization keeps getter results stable
const filtered = useClassyStore(todoStore, (state) => state.filtered);

// ✅ Primitives from getters also work fine
const remaining = useClassyStore(todoStore, (state) => state.remaining);
```

If a getter's dependency changes, it may produce a new array or object even when its contents compare equal. `shallowEqual` can help in that case too, if its one-level comparison matches what the component renders.

> **When to use:** When a selector or getter allocates new objects or arrays with equivalent contents. Selecting an unchanged stored property or primitive already works with `Object.is`.

### Decision guide

- **Use selectors** for explicit dependencies and control over result equality.
- **Use auto-tracked mode** when you'd need 3+ selectors in one component or when you're exploring the API.
- **Add `shallowEqual`** when your selector returns objects/arrays and you're seeing unnecessary re-renders.

### Controlled inputs

React subscriptions always notify synchronously. React sees a field's updated value during the input event, so typing in the middle of a controlled input preserves its caret. Selector, auto-tracked, and bound hooks all use the same timing without configuration:

```tsx
class ProfileFormStore {
  name = '';

  setName(value: string) {
    this.name = value;
  }
}

const profileFormStore = createClassyStore(new ProfileFormStore());

function NameInput() {
  const name = useClassyStore(profileFormStore, (state) => state.name);

  return (
    <input
      value={name}
      onChange={(event) => profileFormStore.setName(event.target.value)}
    />
  );
}
```

When upgrading, remove the React `sync` option and `UseClassyStoreOptions` imports. Keep `isEqual` options if you use custom selector equality. The low-level `subscribe()` API retains its existing batching and optional `sync` setting.

## Batching

Ordinary `subscribe()` callbacks batch notifications in a microtask. React subscriptions instead notify after each mutation. React batches the resulting renders within an event handler, so a method that updates several fields can commit their final state together. This is not a transaction: selectors and getters may run between writes.

```ts
class FormStore {
  name = '';
  email = '';
  submitted = false;
  count = 0;

  submit(name: string, email: string) {
    this.name = name;       // immediately notifies React
    this.email = email;     // immediately notifies React
    this.submitted = true;  // React batches renders in an event handler
  }

  incrementMany(n: number) {
    for (let i = 0; i < n; i++) {
      this.count++;         // each write notifies React
    }
  }
}
```

For ordinary subscribers, `incrementMany(100)` produces one notification. React may check its selected value on every write; use efficient selectors and avoid depending on an exact render count outside an event handler.

Mutations separated by `await` can commit separately, allowing loading and result states to appear — see [Async Patterns](#async-patterns) below.

## Snapshots

`snapshot()` freezes copies of the root state and nested plain objects, arrays, and reactive collections. It preserves the root class prototype. Opaque values such as native `Date`, `Map`, `Set`, functions, and other nested class instances retain their references; snapshots do not make those values immutable. Newly allocated getter results are cached but are not automatically deep-frozen. Treat all snapshot values as readonly and perform actions on the live store.

```ts
import {snapshot} from '@codebelt/classy-store';
import {counterStore} from './stores';

const snap = snapshot(counterStore);
console.log(snap.count); // read-only
// snap.count = 5;       // TypeScript rejects this; at runtime it throws in strict mode
```

> **When to use:** Logging, debugging, or reading state outside React. For JSON or Web Worker messages, select data that the target format can serialize; a snapshot is not automatically a transport payload. Inside React, `useClassyStore` reads snapshots for you.

Snapshots use structural sharing: unchanged sub-trees return the same frozen reference. If you only mutated `store.name`, then `snapshot(store).settings === previousSnapshot.settings`. This is why selectors on nested objects are efficient — if the sub-tree didn't change, `Object.is` returns `true` and the component skips the re-render.

## Subscribing Outside React

`subscribe()` registers a callback that fires once per batched mutation. It returns an unsubscribe function.

```ts
import {subscribe, snapshot} from '@codebelt/classy-store';
import {counterStore} from './stores';

const unsub = subscribe(counterStore, () => {
  const snap = snapshot(counterStore);
  localStorage.setItem('counter', JSON.stringify(snap.count));
});

// later: unsub();
```

> **When to use:** Analytics events, `localStorage` persistence, WebSocket bridges, or any side effect that should react to store changes but isn't a React component.

## Nested State & Structural Sharing

Deep objects and arrays are automatically reactive. You don't need to do anything special.

```ts
class DocStore {
  metadata = {title: 'Untitled', author: 'Anonymous'};
  sections = [
    {id: 1, heading: 'Intro', body: 'Hello'},
    {id: 2, heading: 'Methods', body: 'We used proxies.'},
  ];
}

const docStore = createClassyStore(new DocStore());

// Deep mutation — triggers a notification
docStore.metadata.title = 'My Document';

// Array element mutation — also triggers a notification
docStore.sections[0].body = 'Updated intro';
```

While modifying nested properties directly through the proxy works, the same best practice applies here: prefer store methods over inline mutations. When nested updates are scattered across components, it becomes difficult to trace how deeply nested state changes. Methods give you a single place to look.

Structural sharing means that when you mutate `metadata.title`, the snapshot for `sections` is reused from the previous snapshot (same reference). A component selecting `(state) => state.sections` won't re-render because its selected value hasn't changed.

## Collections

Native `Map` and `Set` aren't plain objects — the proxy can't intercept their internal methods. Use `reactiveMap()` and `reactiveSet()` instead.

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';

class UserStore {
  users = reactiveMap<string, { name: string; role: string }>();

  get count() {
    return this.users.size;
  }

  addUser(id: string, name: string) {
    this.users.set(id, {name, role: 'viewer'});
  }

  removeUser(id: string) {
    this.users.delete(id);
  }
}

export const userStore = createClassyStore(new UserStore());
```

`ReactiveMap` and `ReactiveSet` provide Map-like and Set-like methods backed by arrays. They are not native collections or exact substitutes for native identity and iterator semantics. See the [collection behavior](./REACTIVE_COLLECTIONS_TUTORIAL.md#collection-behavior).

> **When to use:** Whenever you'd reach for `Map` or `Set` inside a store. You *can* use native `Map`/`Set`, but only the reference is reactive — mutations like `.set()` or `.add()` won't trigger updates. You'd have to replace the entire Map/Set (e.g., `this.users = new Map(this.users)`) to notify subscribers. `reactiveMap()` and `reactiveSet()` avoid that by making individual operations reactive.

## Class Inheritance

Subclasses work out of the box — no special API or configuration needed. Methods, getters, and properties from all inheritance levels are fully reactive.

```ts
import {createClassyStore} from '@codebelt/classy-store';

class BaseStore {
  loading = false;
  error: string | null = null;

  get hasError() {
    return this.error !== null;
  }

  setLoading(value: boolean) {
    this.loading = value;
  }

  setError(message: string | null) {
    this.error = message;
  }
}

class UserStore extends BaseStore {
  users: { id: string; name: string }[] = [];

  get activeCount() {
    return this.users.length;
  }

  async fetchUsers() {
    this.setLoading(true);       // base method — reactive
    this.setError(null);
    try {
      const res = await fetch('/api/users');
      this.users = await res.json();
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Failed');
    } finally {
      this.setLoading(false);
    }
  }
}

export const userStore = createClassyStore(new UserStore());
```

How it works:

- **Methods** from any ancestor class are found via the prototype chain and bound to the proxy. `this.setLoading(true)` inside `fetchUsers` goes through the SET trap just like a method defined on `UserStore` itself.
- **Getters** from all levels are automatically memoized. If `UserStore` overrides a base getter, the most-derived version wins. Non-overridden base getters work as-is.
- **`super` calls** work correctly — `super.setLoading(true)` dispatches through the prototype chain with `this` still bound to the proxy, so mutations are reactive.
- **`snapshot()`** preserves the full prototype chain, so `snapshot(userStore) instanceof UserStore` and `instanceof BaseStore` are both `true`.

> **When to use:** When multiple stores share common state or behavior. Extract the shared parts into a base class and extend it. The store proxy handles the rest.

## Async Patterns

Async methods work naturally. React is notified as each field changes, and pending asynchronous work lets it commit the loading state before the result arrives.

```ts
class PostStore {
  posts: { id: number; title: string }[] = [];
  loading = false;
  error: string | null = null;

  async fetchPosts() {
    this.loading = true;   // notify React that loading started
    this.error = null;
    try {
      const res = await fetch('/api/posts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.posts = await res.json(); // notify React that data arrived
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      this.loading = false; // notify React that loading ended
    }
  }
}
```

A component selecting `loading` can show a spinner while the request is pending and remove it when the request finishes. React controls the exact render scheduling.

## Local Stores

Where you create a store determines its scope. A module-level store is shared by importers; `useLocalStore` creates one instance per mounted component. For SSR, use request-scoped or provider-owned stores instead of a shared server singleton.

### Basic usage

`useLocalStore` creates a reactive store scoped to the component's lifetime. Each component instance gets its own isolated store. Unmounting releases React's reference. Garbage collection can reclaim the store once no other references remain.

```tsx
import {useLocalStore, useClassyStore} from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;
  get doubled() { return this.count * 2; }
  increment() { this.count++; }
}

function Counter() {
  const store = useLocalStore(() => new CounterStore());
  const count = useClassyStore(store, (state) => state.count);

  return <button onClick={() => store.increment()}>Count: {count}</button>;
}
```

The factory initializes component state. Subsequent re-renders reuse the same store instance; keep the initializer pure because React StrictMode can invoke it more than once in development.

### Persisting a local store

`persist()` owns subscriptions, timers, and optional browser listeners. Create the handle in an effect and dispose it in that effect's cleanup, including during Strict Mode replay. `useLocalStore` does not dispose application effects for you.

```tsx
import {useEffect} from 'react';
import {useLocalStore, useClassyStore} from '@codebelt/classy-store/react';
import {persist} from '@codebelt/classy-store/utils';

class FormStore {
  name = '';
  email = '';
  setName(v: string) { this.name = v; }
  setEmail(v: string) { this.email = v; }
}

function EditProfile() {
  const store = useLocalStore(() => new FormStore());
  // Auto-tracked mode — this component reads both name and email (see Decision guide).
  const snap = useClassyStore(store);

  useEffect(() => {
    const handle = persist(store, { storage: localStorage, name: 'edit-profile-draft' });
    return () => handle.dispose();
  }, [store]);

  return (
    <form>
      <input value={snap.name} onChange={(e) => store.setName(e.target.value)} />
      <input value={snap.email} onChange={(e) => store.setEmail(e.target.value)} />
    </form>
  );
}
```

The effect cleanup stops persistence. The store can be collected once React and any other owners release it.

## Creating a Bound Hook with `createStoreHook`

When you have a module-level store, you typically also export a typed hook for it:

```ts
// Before — manual boilerplate for each store
import {createClassyStore} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import type {Snapshot} from '@codebelt/classy-store';

export const catalogStore = createClassyStore(new CatalogPageStore());

export function useCatalogStore<S>(
  selector: (snap: Snapshot<CatalogPageStore>) => S,
): S {
  return useClassyStore(catalogStore, selector);
}
```

`createStoreHook` does this in one line:

```ts
// After — one-liner
import {createClassyStore} from '@codebelt/classy-store';
import {createStoreHook} from '@codebelt/classy-store/react';

export const catalogStore = createClassyStore(new CatalogPageStore());
export const useCatalogStore = createStoreHook(catalogStore);
```

The returned hook supports both selector and auto-tracked modes, plus custom `isEqual` — identical to `useClassyStore`, but with the store already bound:

```tsx
// Selector mode
const count = useCatalogStore((state) => state.count);

// Auto-tracked mode
const snap = useCatalogStore();

// Custom equality
const data = useCatalogStore(
  (state) => ({count: state.count, loading: state.loading}),
  {isEqual: shallowEqual},
);
```

`createStoreHook` validates its argument when called. It throws if the argument is not a store proxy; a module-level call therefore fails during module initialization.

## Tips & Gotchas

### Mutate through methods, not from components

While you *can* write `counterStore.count = 5` directly from a component, you shouldn't. Centralizing mutations in store methods keeps your logic in one place and makes it easier to find, refactor, and test.

```ts
// ✅ Good — mutation logic lives in the store
counterStore.increment();

// ❌ Avoid — mutation scattered across components
counterStore.count++;
```

When every state change goes through a method, you can search for callers of that method to understand how your state changes. When state is set directly from dozens of components, tracking down bugs becomes much harder.

### Don't use arrow functions for methods

Arrow function properties (`handler = () => {}`) are own properties whose `this` is lexically bound to the raw class instance at construction time. `.bind()` cannot override an arrow function's `this`, so when the proxy's GET trap binds it to the proxy receiver, the bind is silently ignored. Mutations inside the arrow function bypass the SET trap entirely — no notifications, no reactivity.

```ts
class IncorrectStore {
  count = 0;

  // ❌ Arrow function — `this` is the raw object, mutations are invisible
  increment = () => {
    this.count++; // bypasses the proxy SET trap
  };
}

class CorrectStore {
  count = 0;

  // ✅ Prototype method — `this` is bound to the proxy by the GET trap
  increment() {
    this.count++; // goes through the proxy SET trap → reactive
  }
}
```

The same limitation applies to methods bound to the raw instance in its constructor. JavaScript `#private` fields also cannot be accessed through a proxy receiver; use ordinary fields for reactive state.

### Keep computed getters pure

Compute getters from explicit store property reads. Changes to `Date.now()`, random values, or external variables do not invalidate a cached getter. In-place mutation of opaque values does not invalidate it either. If time affects a computed value, store a timestamp and update that field explicitly. Property enumeration or `in` checks alone are not tracked getter dependencies.

### Keep mutations inside the proxy

Create the store once for its owner and use the returned proxy. Mutating the raw instance, using `Object.defineProperty` to change state, or sharing a raw child object across independent stores bypasses the intended assignment/deletion tracking. Use ordinary fields, arrays, and separate data ownership for each store. Circular references in traversed state are rejected by `snapshot()`.

### Don't destructure the store outside `useClassyStore`

Destructuring copies the primitive value at that moment and breaks the proxy connection.

```ts
// ❌ Breaks reactivity — `count` is just the number 0
const {count} = counterStore;

// ✅ Always access through the proxy
counterStore.count;
```

### Non-proxyable types

Nested native `Date`, `RegExp`, `Map`, and `Set` values, and arbitrary nested class instances, remain opaque. Replacing the field notifies subscribers; mutating the existing object does not. For observable collection operations, use `reactiveMap()` and `reactiveSet()`. For dates, a timestamp field works well. The root class passed to `createClassyStore()` is proxied; this does not make every class instance nested inside it reactive.

### Set-then-revert and loop updates

React checks subscriptions after each write. Setting a field and reverting it in one event can still schedule rendering, even though the final displayed value is unchanged. Neither selector mode nor auto-tracked mode promises to avoid this work.

Likewise, a loop with a thousand writes sends a thousand synchronous React notifications. React can batch their renders within an event handler, but selectors may still run on each mutation. Ordinary `subscribe()` callbacks receive one microtask notification for that loop. For large updates, calculate the final value first when intermediate writes serve no purpose.

### Auto-tracked references

Each render gets its own read set. This keeps a suspended or abandoned render from changing the committed component's dependencies, and allows conditional reads to start from current store state. A shared proxy cache preserves unchanged tracked references across parent re-renders. Raw `snapshot(store)` caching and structural sharing are unchanged.

### Snapshot caching

Calling `snapshot()` multiple times without intervening mutations returns the same frozen object — an O(1) cache hit. After mutations, rebuilding changed objects or arrays has a cost proportional to the properties or elements visited, even when unchanged children are shared.

```ts
import {snapshot} from '@codebelt/classy-store';

const a = snapshot(counterStore);
const b = snapshot(counterStore);
a === b; // true — same cached object

counterStore.increment();

const c = snapshot(counterStore);
a === c; // false — new snapshot after mutation
```

## Persistence

`persist()` saves your store's state to `localStorage` (or any storage adapter) and restores it on page load. It's a standalone utility function — import it from `@codebelt/classy-store/utils`.

```ts
import {persist} from '@codebelt/classy-store/utils';

const handle = persist(todoStore, {
  storage: localStorage,
  name: 'todo-store',
});

// State survives page refreshes.
// Getters and methods are automatically excluded.
// Opt into cross-tab sync with syncTabs: true when using localStorage.
```

The persist utility supports per-property transforms (for `Date`, `ReactiveMap`, etc.), debounced writes, schema versioning with migration, merge strategies, TTL expiration (`expireIn`), manual hydration timing, and cross-tab synchronization. `skipHydration` delays reads only; for SSR, access browser storage in an effect and prepare the initial store snapshot as described in the [SSR guide](./REACT_SSR.md).

For the full walkthrough, see the **[Persist Tutorial](./PERSIST_TUTORIAL.md)**.
