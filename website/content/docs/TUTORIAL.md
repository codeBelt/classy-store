---
title: "Classy Store Tutorial"
description: "Build a Classy Store app from a class definition through selectors, snapshots, and persistence."
---

`Classy Store` is a reactive state library for React, Vue, Svelte, Solid, and Angular built on ES proxies. Define state as classes, wrap them with `createClassyStore()`, and read them with the binding for your framework. Shared client stores need no Provider, observer, or reducer; context providers can scope independent instances. The library batches ordinary subscriptions while notifying React, Vue, Svelte, Solid, and Angular synchronously (Solid 2 retains its native reactive scheduling), and uses structural sharing for change detection.

[Try the Reactivity example →](/examples/reactivity/)

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

Pass a class instance or a plain object to `createClassyStore()`. Put state in data fields, mutate it through the returned proxy, and use `get` accessors for computed values.

```ts title="todoStore.ts"
import {createClassyStore} from '@codebelt/classy-store';

class TodoStore {
  items: {id: string; text: string; done: boolean}[] = [];
  filter: 'all' | 'active' | 'done' = 'all';

  get remaining() {
    return this.items.filter((item) => !item.done).length;
  }

  get filtered() {
    if (this.filter === 'active')
      return this.items.filter((item) => !item.done);
    if (this.filter === 'done') return this.items.filter((item) => item.done);
    return this.items;
  }

  add(text: string) {
    this.items.push({id: crypto.randomUUID(), text, done: false});
  }

  toggle(id: string) {
    const item = this.items.find((todo) => todo.id === id);
    if (item) item.done = !item.done;
  }

  remove(id: string) {
    this.items = this.items.filter((todo) => todo.id !== id);
  }
}

export const todoStore = createClassyStore(new TodoStore());
```

Key points:

- Prototype methods mutate state by assigning to `this` through the proxy. Arrow-function fields cannot be rebound; see [method constraints](#dont-use-arrow-functions-for-methods).
- `get` accessors cache derived values until their tracked store dependencies change. Keep them pure; time and external variables are not tracked dependencies.
- Nested plain objects and arrays (like `items` and each item inside it) are automatically wrapped in child proxies. `item.done = true` triggers a notification just like a top-level write.

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

Without a selector, you get a tracking proxy over the snapshot. The library records property reads to filter store updates. It retains committed reads for reused snapshot objects to support memoized consumers, so a formerly used property can still trigger an extra update; see [Compiler compatibility](./API_REFERENCE.md#react-compiler-compatibility).

> **When to use:** When you'd need 3+ selectors in one component, when prototyping, or when the shape of data you access is dynamic.

### Custom equality with `shallowEqual`

By default, `useClassyStore` compares the selector's return value with `Object.is`, which is a reference check. This works perfectly for primitives and for selecting existing properties directly — structural sharing means that if `todos` didn't change, the snapshot returns the **same frozen array reference**, so `Object.is` returns `true` and the component skips the re-render.

```ts
// ✅ No shallowEqual needed — structural sharing keeps the reference stable
const count = useClassyStore(todoStore, (state) => state.items.length);
const todos = useClassyStore(todoStore, (state) => state.items);
```

The problem shows up when your selector **derives a new value** — calling `.filter()`, `.map()`, or using object spread always allocates a new array or object, even when the underlying data hasn't changed. `Object.is` sees a different reference and triggers a re-render.

`shallowEqual` compares one level deep. Use it for arrays or plain records whose data fields are enumerable string keys. It checks array length, occupied indices, and element values, and compares field or element values with `Object.is`. Other object shapes have additional limits. [API reference](./API_REFERENCE.md#shallowequala-b)

Without `shallowEqual` — `.filter()` creates a new array every time the snapshot updates, even if the todo items haven't changed:

```ts
import {useClassyStore} from '@codebelt/classy-store/react';

// ❌ New array reference every snapshot → unnecessary re-renders
const active = useClassyStore(todoStore, (state) =>
  state.items.filter((item) => !item.done),
);
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

If upgrading from 0.6.x, remove the React `sync` option and `UseClassyStoreOptions` imports. Keep `isEqual` if you use custom selector equality. The low-level `subscribe()` API retains its batching and optional `sync` setting.

## Batching and transactions

Ordinary `subscribe()` callbacks batch notifications in a microtask. Framework adapters, including React's, are notified synchronously, so a controlled input sees its new value within the event that changed it.

A store method is a transaction. Its writes take effect immediately, so the method reads its own changes, but synchronous subscribers are notified once, when the outermost method returns or throws. A selector or a component never observes the state halfway through a method.

```ts
class FormStore {
  name = '';
  email = '';
  submitted = false;
  count = 0;

  submit(name: string, email: string) {
    this.name = name;
    this.email = email;
    this.submitted = true;
  } // React is notified once, here

  incrementMany(n: number) {
    for (let i = 0; i < n; i++) {
      this.count++;
    }
  } // one notification, not n
}
```

Array methods called on store state work the same way: `store.items.sort()`, `unshift()`, `splice()` or a `forEach()` that edits every row is one notification and one new snapshot of the list, however many elements moved.

A write made directly on the store outside any method, such as `store.count++` in an event handler, notifies by itself. A plain loop of such writes therefore notifies once per write, and each notification rebuilds the snapshots on the changed path. Put loops and multi-field updates in a store method.

An `async` method is a transaction up to its first `await`. Each write after an `await` notifies on its own unless it happens inside another method call, which lets loading and result states appear separately. See [Async Patterns](#async-patterns) below.

## Snapshots

`snapshot()` freezes copies of the root state and nested plain objects, arrays, and reactive collections. A snapshot of an ordinary class instance preserves its prototype. Array snapshots copy the length and occupied indices, preserving holes. Keep named or symbol-keyed metadata on a surrounding object if you need it in the snapshot.

Opaque values such as native `Date`, `Map`, `Set`, functions, and ordinary nested class instances retain their references. Newly allocated getter results retain their own mutability. Treat all snapshot values as readonly and perform actions on the live store.

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

`subscribe()` groups writes made before its scheduled microtask into one callback. It returns an unsubscribe function.

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

Mutate nested plain objects and arrays through the store proxy to notify subscribers.

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
  users = reactiveMap<string, {name: string; role: string}>();

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

> **When to use:** Whenever you'd reach for `Map` or `Set` inside a store. You _can_ use native `Map`/`Set`, but only the reference is reactive — mutations like `.set()` or `.add()` won't trigger updates. You'd have to replace the entire Map/Set (e.g., `this.users = new Map(this.users)`) to notify subscribers. `reactiveMap()` and `reactiveSet()` avoid that by making individual operations reactive.

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
  users: {id: string; name: string}[] = [];

  get activeCount() {
    return this.users.length;
  }

  async fetchUsers() {
    this.setLoading(true); // base method — reactive
    this.setError(null);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

Async methods work naturally. The writes before the first `await` are one transaction, and each write after an `await` notifies React on its own, so the loading state commits before the result arrives.

```ts
class PostStore {
  posts: {id: number; title: string}[] = [];
  loading = false;
  error: string | null = null;

  async fetchPosts() {
    this.loading = true; // notify React that loading started
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

Where you create a store determines its scope. A module-level store is shared by importers. Give `useLocalStore` a factory that creates fresh state for each mounted component. For SSR, use request-scoped or provider-owned stores.

### Basic usage

`useLocalStore(() => new CounterStore())` gives each mounted counter its own store. Returning an existing shared instance from the factory shares its proxy across mounts. Unmounting releases React's reference, and garbage collection can reclaim the store once other owners release it.

```tsx
import {useLocalStore, useClassyStore} from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;
  get doubled() {
    return this.count * 2;
  }
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
  setName(v: string) {
    this.name = v;
  }
  setEmail(v: string) {
    this.email = v;
  }
}

function EditProfile() {
  const store = useLocalStore(() => new FormStore());
  // Auto-tracked mode — this component reads both name and email (see Decision guide).
  const snap = useClassyStore(store);

  useEffect(() => {
    const handle = persist(store, {
      storage: localStorage,
      name: 'edit-profile-draft',
    });
    return () => handle.dispose();
  }, [store]);

  return (
    <form>
      <input
        value={snap.name}
        onChange={(e) => store.setName(e.target.value)}
      />
      <input
        value={snap.email}
        onChange={(e) => store.setEmail(e.target.value)}
      />
    </form>
  );
}
```

The effect cleanup stops persistence. The store can be collected once React and any other owners release it.

## Creating a Bound Hook with `createStoreHook`

For a client-only app, you can export a hook bound to the `todoStore` defined above. A manual selector wrapper would look like this.

```ts
// Before — manual boilerplate for each store
import {useClassyStore} from '@codebelt/classy-store/react';
import type {Snapshot} from '@codebelt/classy-store';
import {todoStore} from './todoStore';

export function useTodoStore<S>(
  selector: (snap: Snapshot<typeof todoStore>) => S,
): S {
  return useClassyStore(todoStore, selector);
}
```

`createStoreHook` does this in one line:

```ts title="useTodoStore.ts"
// After — one-liner
import {createStoreHook} from '@codebelt/classy-store/react';
import {todoStore} from './todoStore';

export const useTodoStore = createStoreHook(todoStore);
```

The returned hook supports both selector and auto-tracked modes, plus custom `isEqual` — identical to `useClassyStore`, but with the store already bound:

```tsx
import {shallowEqual} from '@codebelt/classy-store';
import {useTodoStore} from './useTodoStore';

function TodoSummary() {
  const data = useTodoStore(
    (state) => ({total: state.items.length, remaining: state.remaining}),
    {isEqual: shallowEqual},
  );
  return (
    <p>
      {data.remaining} of {data.total} remaining
    </p>
  );
}

function FilterLabel() {
  const snap = useTodoStore();
  return <span>{snap.filter}</span>;
}
```

`createStoreHook` validates its argument when called. It throws if the argument is not a store proxy; a module-level call therefore fails during module initialization.

## Tips & Gotchas

### Mutate through methods, not from components

While you _can_ write `counterStore.count = 5` directly from a component, you shouldn't. Centralizing mutations in store methods keeps your logic in one place and makes it easier to find, refactor, and test.

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

Compute getters from explicit store property reads. Changes to `Date.now()`, random values, or external variables do not invalidate a cached getter. In-place mutation of opaque values does not invalidate it either. If time affects a computed value, store a timestamp and update that field explicitly. In a snapshot getter, `Object.keys(this)` can return an empty array on the first read, and `key in this` can miss a field. The getter receiver tracks direct property reads. For dynamic keys, put the fields in a plain record and read that record explicitly:

```ts
class FormStore {
  fields: Record<string, string> = {name: ''};

  get fieldNames() {
    return Object.keys(this.fields);
  }
}
```

### Initialize with mutable data

The live store wraps nested plain objects with proxies. If a frozen input contains an object-valued, non-writable and non-configurable property, JavaScript requires that property to return its original object. Even reading `store.profile.details` can then throw a `TypeError`. For plain, structured-cloneable input, make a mutable copy before creating the store:

```ts
const profile = Object.freeze({details: {name: 'Ada'}});
const store = createClassyStore({profile: structuredClone(profile)});
store.profile.details.name = 'Grace';
```

### Keep mutations inside the proxy

Create the store once for its owner and use the returned proxy. Mutating the raw instance or using `Object.defineProperty` to change state bypasses assignment/deletion tracking. When stores share a child, edit it through a store proxy to notify its owners. Circular references in traversed state are rejected by `snapshot()`.

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

### Reactive nested classes

A class of your own can opt into the same deep reactivity as plain objects by declaring `static [PROXYABLE] = true`. Its instances are then proxied wherever they appear in a store, their getters are memoized, and their snapshots keep the class prototype:

```ts
import {createClassyStore, PROXYABLE} from '@codebelt/classy-store';

class Todo {
  static [PROXYABLE] = true;
  done = false;

  constructor(public title: string) {}

  toggle() {
    this.done = !this.done; // notifies the store that holds this todo
  }
}

const todoStore = createClassyStore({todos: [new Todo('Write docs')]});
todoStore.todos[0].toggle();
```

The limits of the root class apply to these classes too: use prototype methods rather than arrow-function fields, and ordinary fields rather than `#private` ones. JSON does not keep a prototype, so persist such instances with a [property transform](./PERSIST_TUTORIAL.md).

### Snapshots stored in a store

A snapshot is an immutable value. If you assign one into a store, for example a row taken from a rendered list, the store keeps that frozen object by reference; it does not become live state, and writing to it throws a `TypeError`:

```ts
const row = snapshot(todoStore).todos[0];
todoStore.selected = row; // a frozen copy of the row as it was
todoStore.selected.done = true; // TypeError: the snapshot is read-only
```

To keep a reference that follows later edits, store the live object or its id instead: `todoStore.selected = todoStore.todos[0]`. To start an independent editable copy, clone the snapshot first, for example with `structuredClone(row)` for plain data.

### Getters appear as own fields on snapshots

On a snapshot, every getter of the class is installed as an enumerable own accessor, so `Object.keys(snapshot)`, object spread and `JSON.stringify(snapshot)` include computed values. The live store lists only its data fields. Pick the data fields explicitly when you need only stored state.

### Set-then-revert and loop updates

A write outside a store method notifies React by itself. Setting a field and reverting it with two such writes can still schedule rendering, even though the final displayed value is unchanged. Neither selector mode nor auto-tracked mode promises to avoid this work.

Likewise, a plain loop with a thousand direct writes sends a thousand synchronous notifications. Move the loop into a store method to make it one transaction and one notification. Ordinary `subscribe()` callbacks receive one microtask notification either way.

### Auto-tracked references

Each render gets its own read set. This keeps a suspended or abandoned render from changing the committed component's dependencies, and allows conditional reads to start from current store state. A shared proxy cache preserves unchanged tracked references across parent re-renders. Raw `snapshot(store)` caching and structural sharing are unchanged.

### Snapshot caching

Repeated calls to `snapshot()` on an attached, unchanged store return the same frozen object in O(1) time. Rebuilding changed containers visits their fields or elements. The first read of a detached subtree can also reconnect its child links before checking the snapshot cache.

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
