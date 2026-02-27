# Classy Store

Class-based reactive state management for React, Vue, Svelte, Solid, and Angular. Write plain TypeScript classes — get fine-grained reactivity, immutable snapshots, and zero-boilerplate hooks.

```
~2.3 KB gzipped · ES6 Proxy · useSyncExternalStore · proxy-compare
```

## Features

- **Class-based stores** — plain classes with fields, methods, and getters
- **No wrappers** — no `observer()`, no `Provider`, no HOCs, no decorators
- **Fine-grained reactivity** — components only re-render when properties they read change
- **Immutable snapshots** — structural sharing keeps unchanged sub-trees reference-equal
- **Memoized computed values** — class getters are automatically cached, recompute only when deps change
- **Batched updates** — multiple synchronous mutations coalesce into one re-render
- **Type-safe** — full TypeScript inference from your class definitions
- **Framework bindings** — first-class integrations for React, Vue, Svelte, Solid, and Angular
- **Two hook modes** — explicit selector or automatic property tracking (React)
- **Reactive collections** — `reactiveMap()` and `reactiveSet()` for Map/Set-like state
- **Persistence** — `persist()` utility with transforms, versioning, migration, debounce, cross-tab sync, TTL expiration, and SSR support
- **DevTools** — `devtools()` connects to Redux DevTools for state inspection and time-travel debugging
- **Property subscriptions** — `subscribeKey()` watches a single property for changes with previous/current values
- **Undo/Redo** — `withHistory()` adds undo/redo via a snapshot stack with pause/resume and configurable limits

## Installation

```bash
bun add @codebelt/classy-store
```

All framework peer dependencies are optional — install only what your project uses:

| Framework | Peer Dependency | Import |
|-----------|----------------|--------|
| React | `react >= 18.0.0` | `@codebelt/classy-store/react` |
| Vue | `vue >= 3.0.0` | `@codebelt/classy-store/vue` |
| Svelte | `svelte >= 4.0.0` | `@codebelt/classy-store/svelte` |
| Solid | `solid-js >= 1.0.0` | `@codebelt/classy-store/solid` |
| Angular | `@angular/core >= 17.0.0` | `@codebelt/classy-store/angular` |

## Quick Start

### 1. Define a store class

```typescript
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

```typescript
import {createClassyStore} from '@codebelt/classy-store';

const todoStore = createClassyStore(new TodoStore());
```

### 3. Use in React components

```tsx
import {useStore} from '@codebelt/classy-store/react';

// Selector mode: explicit control over what triggers re-renders
function TodoCount() {
  const remaining = useStore(todoStore, (state) => state.remaining);
  return <span>{remaining} left</span>;
}

// Auto-tracked mode: reads are tracked automatically
function TodoList() {
  const snap = useStore(todoStore);
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

## API Reference

### `createClassyStore(instance)`

Wraps a class instance in a reactive Proxy. Mutations are intercepted, batched via `queueMicrotask`, and subscribers are notified.

```typescript
const myStore = createClassyStore(new MyClass());
```

- **Methods** are automatically bound so `this` mutations go through the proxy
- **Getters** are automatically memoized — they only recompute when a dependency changes (like MobX `@computed`)
- **Nested objects/arrays** are lazily deep-proxied on first access

### `useStore(store, selector?, isEqual?)`

React hook that subscribes to store changes via `useSyncExternalStore`.

**Selector mode:**

```typescript
const count = useStore(myStore, (state) => state.count);
const user = useStore(myStore, (state) => state.user);
const items = useStore(myStore, (state) => state.items);
```

The selector receives an immutable snapshot. Re-renders only when the selected value changes (via `Object.is` by default, or a custom `isEqual`).

**Auto-tracked mode:**

```typescript
const snap = useStore(myStore);
// Access snap.count, snap.user.name, etc.
// Only re-renders when accessed properties change
```

Returns a tracking proxy. Properties your component reads are automatically tracked — changes to unread properties won't cause re-renders.

**Custom equality:**

```typescript
import {shallowEqual} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';

const userData = useStore(myStore, (state) => ({
  name: state.user.name,
  role: state.user.role,
}), shallowEqual);
```

### `useLocalStore(factory)`

Creates a component-scoped reactive store. Each component instance gets its own isolated store, garbage collected on unmount.

```tsx
import {useLocalStore, useStore} from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;
  increment() { this.count++; }
}

function Counter() {
  const store = useLocalStore(() => new CounterStore());
  const count = useStore(store, (state) => state.count);

  return <button onClick={() => store.increment()}>Count: {count}</button>;
}
```

The factory runs once per mount. Subsequent re-renders reuse the same store instance.

> See the [Local Stores](./TUTORIAL.md#local-stores) section in the Tutorial for persistence patterns and more examples.

### `snapshot(store)`

Creates a deeply frozen, immutable snapshot of the current state. Used internally by `useStore` but also available directly.

```typescript
import {snapshot} from '@codebelt/classy-store';

const snap = snapshot(myStore);
// snap is deeply frozen — mutations throw
// Structural sharing: unchanged sub-trees === previous snapshot
```

### `subscribe(store, callback)`

Low-level subscription API. Returns an unsubscribe function. The callback fires once per batched mutation (after microtask).

```typescript
import {subscribe} from '@codebelt/classy-store';

const unsub = subscribe(myStore, () => {
  console.log('Store changed');
});

// Later: unsub();
```

### `getVersion(store)`

Returns the current version number of a store proxy. Versions are monotonically increasing and bump on any mutation in the store's subtree (child mutations propagate up to the root). Useful for debugging, testing whether a store has changed, or custom cache invalidation.

```typescript
import {getVersion} from '@codebelt/classy-store';

const v1 = getVersion(myStore);
myStore.count++;
// After microtask:
const v2 = getVersion(myStore);
// v2 > v1
```

### `shallowEqual(a, b)`

Shallow equality comparison for objects and arrays. Useful as a custom `isEqual` for selectors that return derived objects.

### `reactiveMap<K, V>(initial?)`

Creates a reactive Map-like collection backed by a plain array. Use inside a `createClassyStore()` for full reactivity. Import from `@codebelt/classy-store/collections`.

```typescript
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';
import {useStore} from '@codebelt/classy-store/react';

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
  const snap = useStore(userStore, (state) => [...state.users.entries()]);
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
import {useStore} from '@codebelt/classy-store/react';

class TagStore {
  tags = reactiveSet<string>();

  addTag(tag: string) {
    this.tags.add(tag);
  }
}

const tagStore = createClassyStore(new TagStore());

function TagList() {
  const tags = useStore(tagStore, (state) => [...state.tags]);
  return tags.map(tag => <span key={tag}>{tag}</span>);
}
```

Supports: `.add()`, `.has()`, `.delete()`, `.clear()`, `.size`, `.keys()`, `.values()`, `.entries()`, `.forEach()`, `for...of`.

> **Note:** `reactiveMap()` and `reactiveSet()` are not real `Map`/`Set` instances — they emulate the API on top of plain arrays so the store proxy can track mutations. `instanceof Map` / `instanceof Set` will return `false`.

### `Snapshot<T>`

TypeScript utility type that converts a store type to its deeply readonly snapshot equivalent.

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

Persist store state to storage with transforms, versioning, migration, cross-tab sync, and SSR support. Getters and methods are automatically excluded.

```typescript
import {persist} from '@codebelt/classy-store/utils';

const handle = persist(todoStore, {name: 'todo-store'});
```

> See the [Persist Tutorial](./PERSIST_TUTORIAL.md) and [Persist Architecture](./PERSIST_ARCHITECTURE.md).

### `devtools(store, options?)`

Connect a store to Redux DevTools for state inspection and time-travel debugging.

```typescript
import {devtools} from '@codebelt/classy-store/utils';

const disconnect = devtools(myStore, {name: 'MyStore'});
```

> See the [DevTools Tutorial](./DEVTOOLS_TUTORIAL.md).

### `subscribeKey(store, key, callback)`

Subscribe to changes on a single property. Fires only when the watched key changes.

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
  const user = useStore(authStore, (state) => state.currentUser);
  const theme = useStore(uiStore, (state) => state.theme);
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
  const push = useStore(settingsStore, (state) => state.settings.notifications.push);
  return <Switch checked={push} onChange={() => settingsStore.togglePush()} />;
}
```

### Array operations

Arrays support all standard operations — `push`, `splice`, `pop`, `shift`, index assignment, etc. They're batched into a single notification:

```typescript
class ListStore {
  items: string[] = [];

  addMany(newItems: string[]) {
    // Multiple pushes = one notification = one re-render
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

**Snapshots:** getter results are stable across snapshots when dependencies haven't changed. This means selectors that return computed values work with `Object.is` by default — no `shallowEqual` needed:

```typescript
// Stable reference across re-renders when items/filter haven't changed.
// No shallowEqual required!
const filtered = useStore(myStore, (state) => state.filtered);
```

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

## When to use each mode

| Mode | Best for | How it works |
|------|----------|--------------|
| `useStore(store, selector)` | Derived values, primitives, specific slices | Selector runs on snapshot, compared with `Object.is` |
| `useStore(store)` | Components reading many props, rapid prototyping | `proxy-compare` tracks reads automatically |
| `useStore(store, selector, shallowEqual)` | Selectors returning new objects/arrays | Shallow comparison prevents unnecessary re-renders |

## Comparison with other libraries

| Feature | Classy Store | Zustand | MobX | Valtio |
|---------|-----------------|---------|------|--------|
| Class-based stores | Yes | No | Yes | No |
| No observer/Provider | Yes | Yes | No | Yes |
| Auto-tracking | Yes | No | Yes (observer) | Yes |
| Selector mode | Yes | Yes | No | Manual |
| Memoized computed | Yes (auto-memoized) | Manual | Yes (computed) | No |
| Immutable snapshots | Yes | No | No | Yes |
| Structural sharing | Yes | N/A | N/A | Yes |
| Built-in persistence | Yes (per-property transforms, versioning, cross-tab sync) | Yes (middleware) | No (separate pkg) | No (manual) |
| DevTools integration | Yes (`devtools()`) | Yes (middleware) | Yes (separate pkg) | Yes (`devtools()`) |
| Undo/Redo | Yes (`withHistory()`) | No (manual) | No (manual) | No (manual) |
| Bundle size | ~2.3 KB gzip | ~1.2KB | ~16KB | ~3KB |

## Vision

I wanted state management that feels like writing plain TypeScript.

- **A class is the store.** Define fields, methods, and getters — that's your state, your actions, and your derived values. The class *is* the type. TypeScript infers everything automatically.
- **Getters are computed values.** Write `get filtered()` and it's memoized with dependency tracking out of the box. It caches until a dependency changes.
- **Framework bindings that feel native.** React's `useStore`, Vue's `useStore` (ShallowRef), Svelte's `toSvelteStore`, Solid's `useStore` (signal getter), Angular's `injectStore` — each integration matches the framework's reactive idioms.
- **Call methods directly.** `todoStore.addTodo('Buy milk')` — a real object with real methods, callable from anywhere.
- **Observe only what matters.** Components re-render when the specific properties they read change.

Clean, simple, and type-safe. That was the whole idea.

## Acknowledgements

This library wouldn't exist without the ideas pioneered by these projects. Each one taught us something different, and we took the best of each:

**[MobX](https://github.com/mobxjs/mobx)** — The OG of class-based reactive state. MobX proved that classes with fields, methods, and getters are the most natural way to model state. We took its `makeAutoObservable` philosophy — everything is reactive by default, no decorators or boilerplate — and its automatic computed memoization with fine-grained dependency tracking. MobX showed that getters should "just work" as cached derived values.

**[Valtio](https://github.com/pmndrs/valtio)** — Daishi Kato's proxy-based masterpiece gave us the core architectural pattern: a mutable write proxy for ergonomic mutations paired with immutable snapshots for React integration. Valtio's structural sharing approach — where unchanged sub-trees keep the same frozen reference across snapshots — is what makes `Object.is` selectors efficient without custom equality. We also adopted its `proxy-compare` library for automatic property tracking in selectorless mode.

**[Zustand](https://github.com/pmndrs/zustand)** — Also by Daishi Kato, Zustand set the standard for minimal, hook-first state management. Its selector pattern (`useStore(store, s => s.count)`) with `Object.is` equality is what we use in selector mode. Zustand proved that you don't need Providers, context wrappers, or HOCs — just a hook and a store. Its focus on tiny bundle size pushed us to keep things lean.

**[proxy-compare](https://github.com/dai-shi/proxy-compare)** — The ~1KB utility (also by Dai-shi) that powers our auto-tracked mode. It wraps frozen snapshot objects in a tracking proxy, recording which properties a component reads, then efficiently diffs only those properties between snapshots. This eliminates the need for manual selectors in most cases.

**[React](https://react.dev)** — React 18's `useSyncExternalStore` is the foundation of our hook layer. It provides tear-free concurrent-mode-safe integration with external stores, and it's the same API used by Zustand, Redux, and Valtio under the hood.

**[Claude 4.6 Opus](https://anthropic.com)** — Let's be real: this library was designed, architected, implemented, tested, and documented almost entirely by Claude 4.6 Opus (Anthropic) via [Cursor](https://cursor.com). From the three-layer proxy architecture to the memoized computed getters with dependency tracking, the cross-snapshot caching strategy, and tests — it was all pair-programmed with an AI that never gets tired of writing Proxy traps. The human brought the vision, the taste, and the "no, make it better" energy. Claude brought the code.
