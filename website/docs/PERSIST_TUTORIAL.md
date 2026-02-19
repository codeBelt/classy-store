# Persist Tutorial

`persist()` saves your store's state to storage and restores it on page load. It's a standalone utility function that works with any `createClassyStore()` instance -- no plugins, no middleware, no configuration files. Import it from `@codebelt/classy-store/utils`, call it once, and your store survives page refreshes.

## Getting Started

### 1. Create a store

```ts
import {createClassyStore} from '@codebelt/classy-store';

class TodoStore {
  todos: { text: string; done: boolean }[] = [];
  filter: 'all' | 'active' | 'done' = 'all';

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

export const todoStore = createClassyStore(new TodoStore());
```

### 2. Persist it

```ts
import {persist} from '@codebelt/classy-store/utils';

const handle = persist(todoStore, {
  name: 'todo-store',
});
```

That's it. On every mutation, `todos` and `filter` are saved to `localStorage`. On next page load, they're restored automatically. The getter `remaining` and the methods `addTodo`/`toggle` are **not** persisted -- getters are derived values that recompute from the persisted data, and methods are functions that don't belong in storage.

### 3. Wait for hydration

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

## Choosing What to Persist

By default, `persist()` saves all own data properties of the store -- everything that isn't a getter or a method. You can narrow this with the `properties` option:

```ts
persist(todoStore, {
  name: 'todo-store',
  properties: ['todos'],  // Only persist todos, not filter
});
```

Now `filter` resets to its class default (`'all'`) on every page load, while `todos` are restored from storage.

### Why getters are excluded

Class getters like `get remaining()` are derived values. They compute their result from the persisted data properties (`todos`) every time they're accessed. Persisting a getter result would be redundant and risks restoring a stale value that contradicts the underlying data. Persist only the inputs; the outputs take care of themselves.

## Per-Property Transforms

Some values aren't JSON-safe. `Date` objects become strings, `ReactiveMap` instances lose their structure, and custom classes vanish entirely after `JSON.stringify` + `JSON.parse`. Transforms handle the round-trip.

### Dates

```ts
class SessionStore {
  token = '';
  expiresAt = new Date();

  get isExpired() {
    return this.expiresAt < new Date();
  }
}

const sessionStore = createClassyStore(new SessionStore());

persist(sessionStore, {
  name: 'session',
  properties: [
    'token',  // plain key -- string, no transform needed
    {
      key: 'expiresAt',
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
    "token": "eyJhbGciOiJIUz...",
    "expiresAt": "2026-02-14T00:00:00.000Z"
  }
}
```

On restore, `deserialize` converts the ISO string back into a `Date` object before assigning it to `sessionStore.expiresAt`.

### ReactiveMap

`reactiveMap()` instances are backed by internal arrays that aren't directly JSON-serializable:

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

class UserStore {
  users = reactiveMap<string, { name: string; role: string }>();

  addUser(id: string, name: string, role: string) {
    this.users.set(id, {name, role});
  }
}

const userStore = createClassyStore(new UserStore());

persist(userStore, {
  name: 'user-store',
  properties: [
    {
      key: 'users',
      serialize: (users) => [...users.entries()],        // ReactiveMap → array of tuples
      deserialize: (stored) => reactiveMap(stored as [string, { name: string; role: string }][]),
    },
  ],
});
```

**In storage:**

```json
{
  "version": 0,
  "state": {
    "users": [
      ["u1", { "name": "Alice", "role": "admin" }],
      ["u2", { "name": "Bob", "role": "viewer" }]
    ]
  }
}
```

The same pattern works for `reactiveSet()` -- serialize to an array, deserialize back with `reactiveSet()`.

## Debouncing Writes

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

### Manual save

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

## Version Migration

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

**How it works:**
1. Data is stored with a version number: `{ "version": 2, "state": { ... } }`.
2. On hydration, if the stored version doesn't match the current `version`, `migrate` is called with the raw state and the old version number.
3. `migrate` returns the state transformed into the current shape.
4. The transformed state is then applied to the store normally.

If no `migrate` function is provided and versions mismatch, the old data is applied as-is -- which may silently produce incorrect state. Always pair `version` with `migrate`.

## Merge Strategies

When you add new properties to a store, old persisted data won't include them. The merge strategy controls how persisted state combines with the store's current state:

### Shallow (default)

Persisted values overwrite the store's current values one key at a time. Properties not in storage keep their class defaults.

```ts
class SettingsStore {
  theme: 'light' | 'dark' = 'light';
  fontSize = 14;
  sidebar = true;    // NEW -- not in old persisted data
  language = 'en';   // NEW -- not in old persisted data
}

persist(createClassyStore(new SettingsStore()), {
  name: 'settings',
  // merge: 'shallow',  // default
});

// Old storage has: { theme: 'dark', fontSize: 16 }
// After hydration:
//   theme = 'dark'      (from storage)
//   fontSize = 16       (from storage)
//   sidebar = true      (class default -- not in storage)
//   language = 'en'     (class default -- not in storage)
```

### Replace

Same behavior as `'shallow'` for flat stores. The distinction matters for nested objects -- `'replace'` replaces the entire nested object rather than merging keys into it.

### Custom merge function

For full control, pass a function that receives `(persistedState, currentState)` and returns the merged state:

```ts
persist(settingsStore, {
  name: 'settings',
  merge: (persisted, current) => {
    const merged = {...current};
    for (const key of Object.keys(persisted)) {
      const persistedValue = persisted[key];
      const currentValue = current[key];
      // Deep merge one level for nested objects
      if (persistedValue && currentValue && typeof persistedValue === 'object' && typeof currentValue === 'object') {
        merged[key] = {...currentValue, ...persistedValue};
      } else {
        merged[key] = persistedValue;
      }
    }
    return merged;
  },
});
```

## Cross-Tab Synchronization

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
// --> React components re-render via normal reactivity
```

This works via the browser's `window.storage` event, which fires in all **other** same-origin tabs (not the one that wrote). The persist utility listens for changes to its storage key and re-hydrates when it detects a write from another tab.

Disable it when you don't want cross-tab sync:

```ts
persist(uiStore, {
  name: 'ui',
  syncTabs: false,
});
```

Cross-tab sync only works with `localStorage`. It does not fire for `sessionStorage`, `AsyncStorage`, or custom adapters.

## Expiration / TTL

Use `expireIn` to set a time-to-live (in milliseconds) on persisted data. After the TTL elapses, stored data is skipped during hydration and the store keeps its class defaults.

```ts
persist(sessionStore, {
  name: 'session',
  expireIn: 900_000,  // 15 minutes
});
```

**The TTL resets on every write.** As long as mutations keep happening (an active user session), the data stays fresh. The countdown only matters when the store is hydrated from storage after a period of inactivity (e.g., a page reload).

### Checking expiration

The handle exposes an `isExpired` flag that becomes `true` when hydration encounters expired data:

```ts
const handle = persist(sessionStore, {
  name: 'session',
  expireIn: 900_000,
});

await handle.hydrated;

if (handle.isExpired) {
  // Stored session expired — redirect to login
  router.push('/login');
}
```

`isExpired` is re-evaluated on every `rehydrate()` call, so you can poll or re-check after cross-tab sync events.

### Auto-clearing expired data

By default, expired data is skipped but left in storage. Set `clearOnExpire: true` to automatically remove the key:

```ts
persist(sessionStore, {
  name: 'session',
  expireIn: 900_000,
  clearOnExpire: true,  // Remove key from storage when expired
});
```

### Cross-tab sync and expiration

Expired envelopes received from other tabs via `window.storage` events are also rejected. The same expiry check runs on every hydration path — init, `rehydrate()`, and cross-tab sync.

## SSR / Next.js Support

Server-side rendering creates a hydration mismatch: the server renders with the store's default state, but the client would hydrate from `localStorage` before React reconciles. `skipHydration` defers persistence to the client:

```ts
const handle = persist(todoStore, {
  name: 'todo-store',
  skipHydration: true,
});
```

Then hydrate manually in a `useEffect` (which only runs on the client):

```tsx
import {useEffect} from 'react';

function App() {
  useEffect(() => {
    handle.rehydrate();
  }, []);

  return <TodoList />;
}
```

You can also wait for hydration before rendering content:

```tsx
function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    handle.rehydrate().then(() => setReady(true));
  }, []);

  if (!ready) return <Loading />;
  return <TodoList />;
}
```

## Async Storage (React Native)

`persist()` handles async storage adapters transparently. `AsyncStorage` from React Native works out of the box:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

persist(todoStore, {
  name: 'todo-store',
  storage: AsyncStorage,
  syncTabs: false,  // no window.storage in React Native
});

await handle.hydrated;
```

Any object with `getItem`, `setItem`, and `removeItem` (sync or async) works as a storage adapter.

## sessionStorage (Tab-Scoped)

Use `sessionStorage` for state that should reset when the tab closes:

```ts
persist(uiStore, {
  name: 'ui-state',
  storage: sessionStorage,
  properties: ['sidebarOpen', 'activeTab'],
  // syncTabs defaults to false for sessionStorage
});
```

## Cleanup

### Stop persisting

```ts
const handle = persist(todoStore, {name: 'todo-store'});

// Later: stop all persistence (e.g., on logout)
handle.unsubscribe();

// Mutations after this point are NOT written to storage.
// Cross-tab sync listener is also removed.
// Pending debounce timer is cancelled.
todoStore.addTodo('This is not persisted');
```

### Clear stored data

```ts
// Remove the stored data without affecting in-memory state
await handle.clear();

// The store still has its current state in memory.
// Next page load starts with class defaults (nothing in storage).
```

### Full reset

```ts
async function resetToDefaults() {
  handle.unsubscribe();        // Stop persisting
  await handle.clear();         // Remove from storage

  // Reset in-memory state manually:
  todoStore.todos = [];
  todoStore.filter = 'all';

  // Optionally re-enable persistence:
  const newHandle = persist(todoStore, {name: 'todo-store'});
}
```

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
import {reactiveMap} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

class AppStore {
  theme: 'light' | 'dark' = 'light';
  language = 'en';
  lastLogin = new Date(0);
  bookmarks = reactiveMap<string, { title: string; url: string }>();

  get bookmarkCount() {
    return this.bookmarks.size;
  }

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
  }

  addBookmark(id: string, title: string, url: string) {
    this.bookmarks.set(id, {title, url});
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
    {
      key: 'bookmarks',
      serialize: (map) => [...map.entries()],
      deserialize: (stored) =>
        reactiveMap(stored as [string, { title: string; url: string }][]),
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
console.log(`Welcome back! Theme: ${appStore.theme}, Bookmarks: ${appStore.bookmarkCount}`);
```

## Quick Reference

| What you want | How to do it |
|---|---|
| Persist everything | `persist(myStore, {name: 'key'})` |
| Persist specific properties | `properties: ['count', 'name']` |
| Handle Dates | `{key: 'date', serialize: (date) => date.toISOString(), deserialize: (stored) => new Date(stored)}` |
| Handle ReactiveMap | `{key: 'map', serialize: (map) => [...map.entries()], deserialize: (stored) => reactiveMap(stored)}` |
| Debounce writes | `debounce: 500` |
| Migrate schema changes | `version: 2, migrate: (state, old) => { ... }` |
| SSR support | `skipHydration: true` + `handle.rehydrate()` in `useEffect` |
| Cross-tab sync | Enabled by default with `localStorage` |
| Disable cross-tab sync | `syncTabs: false` |
| Use sessionStorage | `storage: sessionStorage` |
| Use AsyncStorage | `storage: AsyncStorage, syncTabs: false` |
| Expire after 15 minutes | `expireIn: 900_000` |
| Auto-clear expired data | `clearOnExpire: true` |
| Check if data expired | `handle.isExpired` |
| Force immediate save | `handle.save()` |
| Clear stored data | `handle.clear()` |
| Stop persisting | `handle.unsubscribe()` |
| Wait for hydration | `await handle.hydrated` |
| Check hydration | `handle.isHydrated` |
