# Classy Store

Class-based reactive state management for React. Write plain TypeScript classes — get fine-grained reactivity, immutable snapshots, and zero-boilerplate hooks.

```
~3.5 KB gzipped · ES6 Proxy · useSyncExternalStore · proxy-compare
```

## Features

- **Class-based stores** — plain classes with fields, methods, and getters
- **No wrappers** — no `observer()`, no `Provider`, no HOCs
- **Fine-grained reactivity** — components only re-render when properties they read change
- **Immutable snapshots** — structural sharing keeps unchanged sub-trees reference-equal
- **Memoized computed values** — class getters are automatically cached, recompute only when deps change
- **Batched updates** — multiple synchronous mutations coalesce into one re-render
- **Type-safe** — full TypeScript inference from your class definitions
- **Two hook modes** — explicit selector or automatic property tracking
- **Reactive collections** — `reactiveMap()` and `reactiveSet()` for Map/Set-like state
- **Persistence** — `persist()` utility with transforms, versioning, migration, debounce, cross-tab sync, and SSR support

## Installation

```bash
bun add @codebelt/classy-store
```

Peer dependency: `react >= 18.0.0`

## Quick Start

### 1. Define a store class

```typescript
class TodoStore {
  todos: Todo[] = [];
  filter: 'all' | 'done' | 'pending' = 'all';

  addTodo(text: string) {
    this.todos.push({ text, done: false });
  }

  toggle(index: number) {
    this.todos[index]!.done = !this.todos[index]!.done;
  }

  // Getter = computed value
  get filtered() {
    if (this.filter === 'all') return this.todos;
    return this.todos.filter(t =>
      this.filter === 'done' ? t.done : !t.done,
    );
  }

  get remaining() {
    return this.todos.filter(t => !t.done).length;
  }
}
```

### 2. Create a reactive store

```typescript
import { store } from '@codebelt/classy-store';

const todoStore = store(new TodoStore());
```

### 3. Use in React components

```tsx
import { useStore } from '@codebelt/classy-store';

// Selector mode: explicit control over what triggers re-renders
function TodoCount() {
  const remaining = useStore(todoStore, s => s.remaining);
  return <span>{remaining} left</span>;
}

// Auto-tracked mode: reads are tracked automatically
function TodoList() {
  const snap = useStore(todoStore);
  return (
    <ul>
      {snap.filtered.map((t, i) => (
        <li key={i}>{t.text}</li>
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

### `store(instance)`

Wraps a class instance in a reactive Proxy. Mutations are intercepted, batched via `queueMicrotask`, and subscribers are notified.

```typescript
const myStore = store(new MyClass());
```

- **Methods** are automatically bound so `this` mutations go through the proxy
- **Getters** are automatically memoized — they only recompute when a dependency changes (like MobX `@computed`)
- **Nested objects/arrays** are lazily deep-proxied on first access

### `useStore(store, selector?, isEqual?)`

React hook that subscribes to store changes via `useSyncExternalStore`.

**Selector mode:**

```typescript
const count = useStore(myStore, s => s.count);
const user = useStore(myStore, s => s.user);
const items = useStore(myStore, s => s.items);
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
import { shallowEqual, useStore } from '@codebelt/classy-store';

const userData = useStore(myStore, s => ({
  name: s.user.name,
  role: s.user.role,
}), shallowEqual);
```

### `snapshot(store)`

Creates a deeply frozen, immutable snapshot of the current state. Used internally by `useStore` but also available directly.

```typescript
import { snapshot } from '@codebelt/classy-store';

const snap = snapshot(myStore);
// snap is deeply frozen — mutations throw
// Structural sharing: unchanged sub-trees === previous snapshot
```

### `subscribe(store, callback)`

Low-level subscription API. Returns an unsubscribe function. The callback fires once per batched mutation (after microtask).

```typescript
import { subscribe } from '@codebelt/classy-store';

const unsub = subscribe(myStore, () => {
  console.log('Store changed');
});

// Later: unsub();
```

### `getVersion(store)`

Returns the current version number of a store proxy. Versions are monotonically increasing and bump on any mutation in the store's subtree (child mutations propagate up to the root). Useful for debugging, testing whether a store has changed, or custom cache invalidation.

```typescript
import { getVersion } from '@codebelt/classy-store';

const v1 = getVersion(myStore);
myStore.count++;
// After microtask:
const v2 = getVersion(myStore);
// v2 > v1
```

### `shallowEqual(a, b)`

Shallow equality comparison for objects and arrays. Useful as a custom `isEqual` for selectors that return derived objects.

### `reactiveMap<K, V>(initial?)`

Creates a reactive Map-like collection backed by a plain array. Use inside a `store()` for full reactivity.

```typescript
import { reactiveMap, store, useStore } from '@codebelt/classy-store';

class UserStore {
  users = reactiveMap<string, { name: string; role: string }>();

  addUser(id: string, name: string, role: string) {
    this.users.set(id, { name, role });
  }

  removeUser(id: string) {
    this.users.delete(id);
  }
}

const userStore = store(new UserStore());

function UserList() {
  const snap = useStore(userStore, s => [...s.users.entries()]);
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

Creates a reactive Set-like collection backed by a plain array. Use inside a `store()` for full reactivity.

```typescript
import { reactiveSet, store, useStore } from '@codebelt/classy-store';

class TagStore {
  tags = reactiveSet<string>();

  addTag(tag: string) {
    this.tags.add(tag);
  }
}

const tagStore = store(new TagStore());

function TagList() {
  const tags = useStore(tagStore, s => [...s.tags]);
  return tags.map(tag => <span key={tag}>{tag}</span>);
}
```

Supports: `.add()`, `.has()`, `.delete()`, `.clear()`, `.size`, `.keys()`, `.values()`, `.entries()`, `.forEach()`, `for...of`.

> **Note:** `reactiveMap()` and `reactiveSet()` are not real `Map`/`Set` instances — they emulate the API on top of plain arrays so the store proxy can track mutations. `instanceof Map` / `instanceof Set` will return `false`.

### `Snapshot<T>`

TypeScript utility type that converts a store type to its deeply readonly snapshot equivalent.

```typescript
import type { Snapshot } from '@codebelt/classy-store';

type MyStoreSnap = Snapshot<MyStore>;
// All properties are readonly, arrays become ReadonlyArray, etc.
```

## Utilities (`@codebelt/classy-store/utils`)

Tree-shakeable utilities are available via a separate entry point:

```bash
import { persist } from '@codebelt/classy-store/utils';
```

### `persist(store, options)`

Persist store state to `localStorage`, `sessionStorage`, `AsyncStorage`, or any custom storage adapter. Subscribes to store mutations, serializes selected properties into a versioned JSON envelope, and writes to storage. On init (or manual rehydrate), reads from storage and applies the state back.

```typescript
import { store } from '@codebelt/classy-store';
import { persist } from '@codebelt/classy-store/utils';

class TodoStore {
  todos: { text: string; done: boolean }[] = [];
  filter: 'all' | 'done' | 'pending' = 'all';

  addTodo(text: string) {
    this.todos.push({ text, done: false });
  }

  get remaining() {
    return this.todos.filter(t => !t.done).length;
  }
}

const todoStore = store(new TodoStore());

// Persist all data properties to localStorage.
// Getters (remaining) and methods (addTodo) are automatically excluded.
const handle = persist(todoStore, {
  name: 'todo-store',
});

// On next page load, todos and filter are restored automatically.
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | *required* | Unique storage key |
| `storage` | `StorageAdapter` | `localStorage` | Any sync or async adapter with `getItem`/`setItem`/`removeItem` |
| `properties` | `Array<keyof T \| PropertyTransform<T>>` | all data props | Which properties to persist (getters and methods always excluded) |
| `debounce` | `number` | `0` | Debounce writes to storage (ms) |
| `version` | `number` | `0` | Schema version number for migration |
| `migrate` | `(state, oldVersion) => state` | — | Transform old persisted data to current shape |
| `merge` | `'shallow' \| 'replace' \| fn` | `'shallow'` | How to merge persisted state with current store state |
| `skipHydration` | `boolean` | `false` | Defer hydration for SSR (call `handle.rehydrate()` manually) |
| `syncTabs` | `boolean` | auto | Sync state across browser tabs via `window.storage` event |

**Return value (`PersistHandle`):**

| Property | Type | Description |
|----------|------|-------------|
| `unsubscribe()` | `() => void` | Stop persisting and clean up all listeners |
| `hydrated` | `Promise<void>` | Resolves when initial hydration completes |
| `isHydrated` | `boolean` | Whether hydration has completed |
| `save()` | `() => Promise<void>` | Immediate write to storage (bypasses debounce) |
| `clear()` | `() => Promise<void>` | Remove this store's data from storage |
| `rehydrate()` | `() => Promise<void>` | Manually re-read from storage and apply |

**Per-property transforms** handle non-JSON types like `Date` or `ReactiveMap`:

```typescript
persist(sessionStore, {
  name: 'session',
  properties: [
    'token',  // plain key — no transform needed
    {
      key: 'expiresAt',
      serialize: (date) => date.toISOString(),
      deserialize: (stored) => new Date(stored as string),
    },
  ],
});
```

**Cross-tab sync** is enabled by default with `localStorage`. When another tab writes to the same key, this tab auto-rehydrates.

**SSR support** via `skipHydration`:

```typescript
const handle = persist(todoStore, {
  name: 'todos',
  skipHydration: true,
});

// In a React component:
useEffect(() => { handle.rehydrate(); }, []);
```

> For a comprehensive walkthrough, see the [Persist Tutorial](./PERSIST_TUTORIAL.md). For internal design details, see [Persist Architecture](./PERSIST_ARCHITECTURE.md).

## Patterns

### Multiple stores

```typescript
const authStore = store(new AuthStore());
const uiStore = store(new UiStore());

function Header() {
  const user = useStore(authStore, s => s.currentUser);
  const theme = useStore(uiStore, s => s.theme);
  return <header className={theme}>{user?.name}</header>;
}
```

### Class inheritance

Subclasses work out of the box. Methods, getters, and `super` calls from any ancestor are fully reactive:

```typescript
class BaseStore {
  loading = false;
  error: string | null = null;

  setLoading(value: boolean) { this.loading = value; }
  setError(msg: string | null) { this.error = msg; }
  get hasError() { return this.error !== null; }
}

class UserStore extends BaseStore {
  users: string[] = [];

  addUser(name: string) {
    this.users.push(name);
  }

  get count() { return this.users.length; }
}

const userStore = store(new UserStore());

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

const settingsStore = store(new SettingsStore());

// Only re-renders when push notification setting changes
function PushToggle() {
  const push = useStore(settingsStore, s => s.settings.notifications.push);
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
const filtered = useStore(myStore, s => s.filtered);
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
| Bundle size | ~3.5KB | ~1.2KB | ~16KB | ~3KB |

## Vision

I wanted state management that feels like writing plain TypeScript.

- **A class is the store.** Define fields, methods, and getters — that's your state, your actions, and your derived values. The class *is* the type. TypeScript infers everything automatically.
- **Getters are computed values.** Write `get filtered()` and it's memoized with dependency tracking out of the box. It caches until a dependency changes.
- **A single hook connects React.** One `useStore` call subscribes a component. Choose a selector for precision or let the library figure out what you read.
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
