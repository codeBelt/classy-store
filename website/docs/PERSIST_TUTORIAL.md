# Classy Store Persist Utility

`persist()` saves your store's state to storage and restores it on page load. It's a standalone utility function that works with any `createClassyStore()` instance.

## Getting Started

### 1. Create a store

```ts
// todoStore.ts
import {createClassyStore} from '@codebelt/classy-store';

class TodoStore {
  filter: 'all' | 'active' | 'done' = 'all';
  todos: {text: string; done: boolean}[] = [];

  get remaining() {
    return this.todos.filter((todo) => !todo.done).length;
  }

  addTodo(text: string) {
    this.todos.push({text, done: false});
  }

  toggle(index: number) {
    this.todos[index].done = !this.todos[index]!.done;
  }
}

export const todoStore = createClassyStore(new TodoStore());
```

### 2. Persist it

```ts
// todoStore.ts
import {createClassyStore} from '@codebelt/classy-store';
import {persist} from '@codebelt/classy-store/utils';

// ... (Include TodoStore setup from Step 1)

// Saves all store properties to localStorage
const handle = persist(todoStore, {
  name: 'todo-store',
});
```

**What gets stored in storage:**

```json
// In localStorage the key will be `todo-store` and the value will be:
{
  "version": 0,
  "state": {
    "todos": [],
    "filter": "all"
  },
  "expireIn": 1000 // expireIn only will only be added if you have set expireIn as an option
}
```

On every mutation, `todos` and `filter` are saved to `localStorage`. On next page load, they're restored automatically. The getter `remaining` and the methods `addTodo`/`toggle` are **not** persisted -- getters are derived values that recompute from the persisted data, and methods are functions that don't belong in storage.

### Choosing What to Persist

By default, `persist()` saves all own data properties of the store -- everything that isn't a getter or a method. You can narrow this with the `properties` option:

```ts
persist(todoStore, {
  name: 'todo-store',
  properties: ['todos'],  // Only persist todos, not filter
});
```

Now `filter` resets to its class default (`'all'`) on every page load, while `todos` are restored from storage.

### Why getters are excluded

Class getters like `get remaining()` are derived values. They compute their results from the data property (`todos`) every time they're accessed. Persisting a getter result would be redundant and risks restoring a stale value that contradicts the underlying data.

### Configuration and Handle Overview

Quickly highlight all the config items and methods on the returned handle. Most of the time you will not use them but they are there if you need them.

```ts
import {persist} from '@codebelt/classy-store/utils';

const handle = persist(todoStore, {
  name: 'TodoStore',         // Unique storage key (required)
  properties: [],            // Keys or transform descriptors to persist (default: all own data properties)
  storage: localStorage,     // Storage adapter with getItem/setItem/removeItem (default: localStorage)
  debounce: 500,             // Coalesce rapid mutations into one write, in ms (default: 0)
  version: 0,                // Schema version number; triggers migrate when mismatched (default: 0)
  migrate: (state, v) => {}, // Called when stored version ≠ current; must return state in current shape
  merge: 'shallow',          // How to merge persisted state on hydration: 'shallow' | 'replace' | custom fn
  skipHydration: true,       // Don't hydrate on init; call handle.rehydrate() manually (default: false)
  syncTabs: true,            // Re-hydrate when another tab writes to the same key (localStorage only)
  expireIn: 1000,            // TTL in ms; expired data is skipped on hydration. Resets on every write
  clearOnExpire: false,      // Auto-remove storage key when expired data is found (default: false)
});

handle.isHydrated;             // Whether hydration from storage has completed
handle.isExpired;              // True if last hydration found expired data (requires expireIn)
await handle.hydrated;         // Promise that resolves when initial hydration is complete
await handle.save();           // Manually write to storage (bypasses debounce)
await handle.clear();          // Remove this store's persisted data from storage
await handle.rehydrate();      // Manually re-hydrate the store from storage
handle.unsubscribe();          // Stop persisting: unsubscribe + cancel debounce + remove storage listener
```

---

## Configuration Properties

### `properties` (Per-Property Transforms)

Some values aren't JSON-safe. `Date` objects become strings, and custom classes vanish entirely after `JSON.stringify` + `JSON.parse`. Transforms handle the round-trip through the `properties` option.

```ts
class UserStore {
  name = '';
  birthdate = new Date();

  get isAdult() {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    return this.birthdate <= cutoff;
  }
}

const userStore = createClassyStore(new UserStore());

persist(userStore, {
  name: 'user-store',
  properties: [
    'name',  // plain key -- string, no transform needed
    {
      key: 'birthdate',
      serialize: (date) => date.toISOString(),            // Date → string
      deserialize: (stored) => new Date(stored as string), // string → Date
    },
  ],
});
```

**In storage:**

```json
{
  "version": 0,
  "state": {
    "name": "Robert",
    "birthdate": "2026-02-14T00:00:00.000Z"
  }
}
```

On restore, `deserialize` converts the ISO string back into a `Date` object before assigning it to `userStore.birthdate`.

*(If you need to persist `Map` or `Set` objects, see the [Reactive Collections Tutorial](./REACTIVE_COLLECTIONS_TUTORIAL.md).)*

### `storage`

`persist()` handles different storage adapters transparently. The default is `localStorage`. Any object with `getItem`, `setItem`, and `removeItem` (sync or async) works.

**sessionStorage (Tab-Scoped)**

Use `sessionStorage` for state that should reset when the tab closes:

```ts
persist(uiStore, {
  name: 'ui-state',
  storage: sessionStorage,
  properties: ['sidebarOpen', 'activeTab'],
  // syncTabs defaults to false for sessionStorage
});
```

**Async Storage (React Native)**

`AsyncStorage` from React Native works out of the box:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const handle = persist(todoStore, {
  name: 'todo-store',
  storage: AsyncStorage,
  syncTabs: false,  // no window.storage in React Native
});

await handle.hydrated;
```

### `syncTabs` (Cross-Tab Synchronization)

When using `localStorage`, state syncs automatically across browser tabs. If a user logs out in Tab A, Tab B picks up the change immediately:

```ts
persist(authStore, {
  name: 'auth',
  // syncTabs: true -- default for localStorage
});

// Tab A: user logs out
authStore.token = null;
authStore.user = null;
// --> writes to localStorage

// Tab B: automatically receives the update
// --> authStore.token and authStore.user become null
```

This works via the browser's `window.storage` event, which fires in all **other** same-origin tabs. The persist utility listens for changes to its storage key and re-hydrates when it detects a write from another tab.

Disable it when you don't want cross-tab sync:

```ts
persist(uiStore, {
  name: 'ui',
  syncTabs: false,
});
```

Cross-tab sync only works with `localStorage`. It does not fire for `sessionStorage`, `AsyncStorage`, or custom adapters.

### `expireIn` & `clearOnExpire` (Expiration / TTL)

Use `expireIn` to set a time-to-live (in milliseconds) on persisted data. After the TTL elapses, stored data is skipped during hydration and the store keeps its class defaults.

```ts
persist(sessionStore, {
  name: 'session',
  expireIn: 900_000,  // 15 minutes
});
```

**The TTL resets on every write.** As long as mutations keep happening (an active user session), the data stays fresh. The countdown only matters when the store is hydrated from storage after a period of inactivity (e.g., a page reload).

**Checking expiration**

The handle exposes an `isExpired` flag that becomes `true` when hydration encounters expired data:

```ts
const handle = persist(sessionStore, {
  name: 'session',
  expireIn: 900_000,
});

await handle.hydrated;

if (handle.isExpired) {
  // Stored session expired — redirect to login
}
```

By default, expired data is skipped but left in storage. Set `clearOnExpire: true` to automatically remove the key:

```ts
persist(sessionStore, {
  name: 'session',
  expireIn: 900_000,
  clearOnExpire: true,  // Remove key from storage when expired
});
```

### `skipHydration` (SSR / Next.js Support)

`persist()` is SSR-safe out of the box. When `localStorage` is unavailable (server-side rendering, restricted environments), it returns a **dormant handle** instead of throwing. The store keeps its class defaults on the server, and you activate persistence on the client via `rehydrate()`.

This means you can call `persist()` at module scope -- no `typeof window` guards needed:

```ts
// store.ts -- runs on both server and client
export const handle = persist(todoStore, {
  name: 'todo-store',
  skipHydration: true,
});
```

Then hydrate manually in a `useEffect` (which only runs on the client):

```tsx
import {useEffect} from 'react';
import {handle} from './store';

function App() {
  useEffect(() => {
    handle.rehydrate();
  }, []);

  return <TodoList />;
}
```

### `debounce` (Debouncing Writes)

For stores that mutate frequently (form inputs, drag positions, real-time data), debouncing prevents excessive writes:

```ts
persist(formStore, {
  name: 'form-draft',
  debounce: 500,  // Write at most once every 500ms
});

// Rapid mutations:
formStore.name = 'J';
formStore.name = 'Jo';
formStore.name = 'John';
// One write to storage, 500ms after the last mutation.
```

### `version`, `migrate`, & `merge` (Version Migration and Strategies)

When the store's shape changes between releases, versioning and migration prevent data loss:

```ts
persist(todoStore, {
  name: 'todo-store',
  version: 2,
  migrate: (state, oldVersion) => {
    if (oldVersion === 0) {
      // v0 stored todos as `items`
      return {...state, todos: state.items, items: undefined};
    }
    if (oldVersion === 1) {
      // v1 todos were plain strings, v2 todos are objects
      return {
        ...state,
        todos: (state.todos as string[]).map((text) => ({text, done: false})),
      };
    }
    return state;
  },
});
```

**Merge Strategies**

When you add new properties to a store, old persisted data won't include them. The `merge` strategy controls how persisted state combines with the store's current state:

- `'shallow'` (default): Persisted values overwrite the store's current values one key at a time.
- `'replace'`: Replaces the entire nested object rather than merging keys into it.
- **Custom function**: For full control, pass a function that receives `(persisted, current)` and returns the merged state.

---

## The Handle

### `isHydrated` & `hydrated`

If you need to know when the stored data has been applied to the store:

```ts
// Async -- await the promise
await handle.hydrated;
console.log('Restored:', todoStore.todos);

// Sync check
if (handle.isHydrated) {
  // safe to read persisted state
}
```

For `localStorage` (synchronous), hydration resolves almost immediately. For async storage adapters like `AsyncStorage`, the promise resolves after the async read completes.

### `clear()` (Clear stored data)

```ts
// Remove the stored data without affecting in-memory state
await handle.clear();

// The store still has its current state in memory.
// Next page load starts with class defaults (nothing in storage).
```

### `save()` (Manual save)

When you need to save immediately (e.g., before the user navigates away):

```ts
const handle = persist(formStore, {
  name: 'form-draft',
  debounce: 1000,
});

// Force save before page unload
window.addEventListener('beforeunload', () => {
  handle.save();
});
```

`save()` cancels the pending debounce timer and writes the current state immediately.

### `unsubscribe()` (Stop persisting)

```ts
const handle = persist(todoStore, {name: 'todo-store'});

// Later: stop all persistence (e.g., on logout)
handle.unsubscribe();

// Mutations after this point are NOT written to storage.
// Cross-tab sync listener is also removed.
// Pending debounce timer is cancelled.
todoStore.addTodo('This is not persisted');
```

---

## Multiple Persistence Targets

Call `persist()` multiple times with different options to persist different parts of a store to different locations:

```ts
const todoStore = createClassyStore(new TodoStore());

// Persist todos to localStorage (survives page close)
persist(todoStore, {
  name: 'todo-items',
  properties: ['todos'],
});

// Persist UI filter to sessionStorage (resets on tab close)
persist(todoStore, {
  name: 'todo-filter',
  storage: sessionStorage,
  properties: ['filter'],
});
```

## Putting It All Together

Here's a complete example combining several features:

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {persist} from '@codebelt/classy-store/utils';

class AppStore {
  theme: 'light' | 'dark' = 'light';
  language = 'en';
  lastLogin = new Date(0);

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
  }
}

const appStore = createClassyStore(new AppStore());

const handle = persist(appStore, {
  name: 'app-store',
  version: 1,
  debounce: 300,

  properties: [
    'theme',
    'language',
    {
      key: 'lastLogin',
      serialize: (date) => date.toISOString(),
      deserialize: (stored) => new Date(stored as string),
    },
  ],

  migrate: (state, oldVersion) => {
    if (oldVersion === 0) {
      // v0 didn't have language
      return {...state, language: 'en'};
    }
    return state;
  },
});

// Wait for hydration, then start the app
await handle.hydrated;
console.log(`Welcome back! Theme: ${appStore.theme}`);
```

## Quick Reference

| Feature | Code Example |
|---|---|
| **Persist everything** | `persist(myStore, {name: 'key'})` |
| **Persist specific properties** | `properties: ['count', 'name']` |
| **Handle Dates & Objects** | `{key: 'date', serialize: (d) => d.toISOString(), deserialize: (s) => new Date(s)}` |
| **Handle Reactive collections** | `users: reactiveMap<string, User>()` (supported natively) |
| **Use sessionStorage** | `storage: sessionStorage` |
| **Use AsyncStorage** | `storage: AsyncStorage, syncTabs: false` |
| **Disable cross-tab sync** | `syncTabs: false` |
| **Expire payload after time**| `expireIn: 900_000` |
| **Auto-clear expired data** | `clearOnExpire: true` |
| **SSR & manual hydration** | `skipHydration: true` + `handle.rehydrate()` |
| **Debounce storage writes**| `debounce: 500` |
| **Migrate schema versions**| `version: 2, migrate: (state, old) => { ... }` |
| **Check hydration** | `handle.isHydrated` |
| **Wait for hydration** | `await handle.hydrated` |
| **Clear stored data** | `handle.clear()` |
| **Force immediate save** | `handle.save()` |
| **Stop persisting** | `handle.unsubscribe()` |
| **Check if data expired** | `handle.isExpired` |
