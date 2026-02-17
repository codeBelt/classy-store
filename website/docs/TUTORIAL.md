# Classy Store Tutorial

`Classy Store` is a reactive state library for React built on ES proxies. You define state as plain classes, wrap them with `createClassyStore()`, and read them with `useStore()`. There are no Providers, no observers, no reducers, and no extra TypeScript interfaces to define your state shape — just classes and a hook. The library is ~3.5 KB gzipped, batches synchronous mutations into a single re-render, and uses structural sharing for efficient change detection.

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
import {useStore} from '@codebelt/classy-store/react';
import {counterStore} from './stores';

export function Counter() {
  const count = useStore(counterStore, (store) => store.count);
  return <button onClick={counterStore.increment}>Count: {count}</button>;
}
```

That's it. No Provider wrapping your app. The store is a module-level singleton — import it wherever you need it.

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

- Methods mutate state by assigning to `this`. The proxy intercepts every write.
- `get` accessors work as computed values — they run against the proxied state, so they're always up to date.
- Nested objects and arrays (like `items` and each item inside it) are automatically wrapped in child proxies. `item.done = true` triggers a notification just like a top-level write.

## Reading State in React

`useStore` has two modes. Pick the right one and your components only re-render when they need to.

### Selector mode

```ts
const count = useStore(counterStore, (store) => store.count);
```

The selector receives an immutable snapshot and returns the slice you need. The component re-renders only when the selected value changes (compared with `Object.is`).

> **When to use:** Default choice. Best for render performance because it's explicit about what the component depends on.

### Auto-tracked mode

```ts
const snap = useStore(counterStore);
// just use snap.count, snap.name, etc. in your JSX
```

No selector — you get back a tracking proxy over the snapshot. The library records which properties your component reads during render and only re-renders when one of those properties changes.

> **When to use:** When you'd need 3+ selectors in one component, when prototyping, or when the shape of data you access is dynamic.

### Custom equality with `shallowEqual`

By default, `useStore` compares the selector's return value with `Object.is`, which is a reference check. This works perfectly for primitives and for selecting existing properties directly — structural sharing means that if `todos` didn't change, the snapshot returns the **same frozen array reference**, so `Object.is` returns `true` and the component skips the re-render.

```ts
// ✅ No shallowEqual needed — structural sharing keeps the reference stable
const count = useStore(todoStore, (store) => store.items.length);
const todos = useStore(todoStore, (store) => store.items);
```

The problem shows up when your selector **derives a new value** — calling `.filter()`, `.map()`, or using object spread always allocates a new array or object, even when the underlying data hasn't changed. `Object.is` sees a different reference and triggers a re-render.

`shallowEqual` fixes this by comparing one level deep: for arrays it checks length + each element with `Object.is`, and for objects it checks key count + each value with `Object.is`. It only works on plain objects and arrays — not on `Map`, `Set`, or class instances.

Without `shallowEqual` — `.filter()` creates a new array every time the snapshot updates, even if the todo items haven't changed:

```ts
import {useStore} from '@codebelt/classy-store/react';

// ❌ New array reference every snapshot → unnecessary re-renders
const active = useStore(todoStore, (store) => store.items.filter((item) => !item.done));
```

With `shallowEqual` — compares the array contents, not the reference:

```ts
import {shallowEqual} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';

// ✅ Only re-renders when the filtered items actually change
const active = useStore(
  todoStore,
  (store) => store.items.filter((item) => !item.done),
  shallowEqual,
);
```

**Getters do NOT need `shallowEqual`.** Class getters benefit from cross-snapshot memoization: the library tracks which `this` properties a getter reads and caches the result. On subsequent snapshots, if those properties are structurally the same (same reference via structural sharing), the cached result is returned. This means getter results are stable across snapshots -- `Object.is` works out of the box:

```ts
// ✅ No shallowEqual needed — cross-snapshot memoization keeps getter results stable
const filtered = useStore(todoStore, (store) => store.filtered);

// ✅ Primitives from getters also work fine
const remaining = useStore(todoStore, (store) => store.remaining);
```

`shallowEqual` is only needed when the **selector itself** derives a new value (via `.filter()`, `.map()`, object spread, etc.) — not when selecting a getter that does the derivation internally.

> **When to use:** When your selector (not a getter) derives a new object or array inline. You don't need it when selecting existing properties, primitives, or class getters — structural sharing, cross-snapshot memoization, and `Object.is` already handle those.

### Decision guide

- **Use selectors by default.** They're explicit and produce the fewest re-renders.
- **Use auto-tracked mode** when you'd need 3+ selectors in one component or when you're exploring the API.
- **Add `shallowEqual`** when your selector returns objects/arrays and you're seeing unnecessary re-renders.

## Batching

All synchronous mutations are batched into a single notification — and therefore a single React re-render. The library queues a microtask on the first mutation; every subsequent mutation before that microtask fires is included in the same batch.

```ts
class FormStore {
  name = '';
  email = '';
  submitted = false;
  count = 0;

  submit(name: string, email: string) {
    this.name = name;       // batched
    this.email = email;     // batched
    this.submitted = true;  // batched → one re-render total
  }

  incrementMany(n: number) {
    for (let i = 0; i < n; i++) {
      this.count++;         // all 100 writes batched → one re-render
    }
  }
}
```

This includes loops — `incrementMany(100)` produces one notification, not 100.

Mutations separated by an `await` land in different microtasks and trigger separate notifications. This is usually what you want — see [Async Patterns](#async-patterns) below.

## Snapshots

`snapshot()` creates a deeply-frozen, immutable copy of the store's current state.

```ts
import {snapshot} from '@codebelt/classy-store';
import {counterStore} from './stores';

const snap = snapshot(counterStore);
console.log(snap.count); // read-only
snap.count = 5;          // throws in strict mode
```

> **When to use:** Logging, debugging, serialization, passing state to non-React code (e.g., a canvas renderer, a Web Worker message). Inside React, `useStore` calls `snapshot()` for you — you rarely need it directly.

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

Structural sharing means that when you mutate `metadata.title`, the snapshot for `sections` is reused from the previous snapshot (same reference). A component selecting `(store) => store.sections` won't re-render because its selected value hasn't changed.

## Collections

Native `Map` and `Set` aren't plain objects — the proxy can't intercept their internal methods. Use `reactiveMap()` and `reactiveSet()` instead.

```ts
import {createClassyStore, reactiveMap} from '@codebelt/classy-store';

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

`ReactiveMap` and `ReactiveSet` mirror the native API (`get`, `set`, `has`, `delete`, `clear`, `forEach`, iteration) but are backed by plain arrays so the proxy can track mutations.

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

Async methods work naturally. Mutations before `await` and after `await` land in separate microtasks, producing separate notifications — which means React sees the loading state immediately.

```ts
class PostStore {
  posts: { id: number; title: string }[] = [];
  loading = false;
  error: string | null = null;

  async fetchPosts() {
    this.loading = true;   // notification 1: shows spinner
    this.error = null;
    try {
      const res = await fetch('/api/posts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.posts = await res.json(); // no notification yet — batched with finally
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      this.loading = false; // notification 2: hides spinner, shows data or error
    }
  }
}
```

This means a component using `useStore(postStore, (store) => store.loading)` will re-render twice: once when loading starts, once when it ends. That's the correct behavior.

## Local Stores

By default, stores are module-level singletons — shared across your entire app. For component-scoped state that is garbage collected on unmount, use `useLocalStore`.

### Basic usage

`useLocalStore` creates a reactive store scoped to the component's lifetime. Each component instance gets its own isolated store. When the component unmounts, the store is garbage collected.

```tsx
import {useLocalStore, useStore} from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;
  get doubled() { return this.count * 2; }
  increment() { this.count++; }
}

function Counter() {
  const store = useLocalStore(() => new CounterStore());
  const count = useStore(store, (s) => s.count);

  return <button onClick={() => store.increment()}>Count: {count}</button>;
}
```

The factory function (`() => new CounterStore()`) runs once per mount. Subsequent re-renders reuse the same store instance.

### Persisting a local store

`persist()` subscribes to the store, which keeps a reference alive. You must call `handle.unsubscribe()` on unmount to allow garbage collection.

```tsx
import {useEffect} from 'react';
import {useLocalStore, useStore} from '@codebelt/classy-store/react';
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
  const snap = useStore(store);

  useEffect(() => {
    const handle = persist(store, { name: 'edit-profile-draft' });
    return () => handle.unsubscribe();
  }, [store]);

  return (
    <form>
      <input value={snap.name} onChange={(e) => store.setName(e.target.value)} />
      <input value={snap.email} onChange={(e) => store.setEmail(e.target.value)} />
    </form>
  );
}
```

The `useEffect` cleanup ensures the persist subscription is removed and the store can be garbage collected when the component unmounts.

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

### Don't destructure the store outside `useStore`

Destructuring copies the primitive value at that moment and breaks the proxy connection.

```ts
// ❌ Breaks reactivity — `count` is just the number 0
const {count} = counterStore;

// ✅ Always access through the proxy
counterStore.count;
```

### Non-proxyable types

Native `Date`, `RegExp`, `Map`, and `Set` use internal slots that proxies can't intercept. For `Map` and `Set`, use `reactiveMap()` and `reactiveSet()`. For `Date`, store timestamps as numbers and construct `Date` objects in getters or at render time.

### Set-then-revert is free (in selector mode)

If you write `store.count = 5` then immediately `store.count = 0` (back to the original value) in the same synchronous block, **selector mode** will not re-render because the selector extracts the same value before and after.

**Auto-tracked mode** will still re-render in this case, because the store's version was bumped (any mutation bumps the version), so the snapshot is a new object reference. The `proxy-compare` diff sees a new snapshot and creates a new tracking proxy, triggering a re-render -- even though the values are identical.

```ts
class Counter {
  count = 0;

  reset() {
    this.count = 5;  // changed
    this.count = 0;  // back to original → no re-render
  }
}

// ✅ Selector mode: no re-render (Object.is sees same count value)
const count = useStore(counterStore, (store) => store.count);

// ⚠️ Auto-tracked mode: re-renders (snapshot reference changed)
const snap = useStore(counterStore);
```

### Loop batching

Calling `this.count++` a thousand times in a `for` loop produces one notification, not a thousand. All synchronous mutations share a single microtask batch.

```ts
class Counter {
  count = 0;

  incrementMany(n: number) {
    for (let i = 0; i < n; i++) {
      this.count++;  // 1000 writes → one notification
    }
  }
}
```

### Snapshot caching

Calling `snapshot()` multiple times without intervening mutations returns the same frozen object — an O(1) cache hit. There's no cost to calling it liberally.

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
  name: 'todo-store',
});

// State survives page refreshes.
// Getters and methods are automatically excluded.
// Cross-tab sync is enabled by default.
```

The persist utility supports per-property transforms (for `Date`, `ReactiveMap`, etc.), debounced writes, schema versioning with migration, merge strategies, TTL expiration (`expireIn`), SSR-safe `skipHydration`, and cross-tab synchronization.

For the full walkthrough, see the **[Persist Tutorial](./PERSIST_TUTORIAL.md)**.
