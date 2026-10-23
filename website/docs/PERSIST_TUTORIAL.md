# Classy Store Persist Utility

`persist()` saves your store's state to storage and restores it on page load. It's a standalone utility function that works with any `createClassyStore()` instance.

## Getting Started

### 1. Create a store

```ts
// todoStore.ts
import {createClassyStore} from '@codebelt/classy-store';

export class TodoStore {
  filter: 'all' | 'active' | 'done' = 'all';
  todos: {text: string; done: boolean}[] = [];

  get remaining() {
    return this.todos.filter((todo) => !todo.done).length;
  }

  addTodo(text: string) {
    this.todos.push({text, done: false});
  }

  toggle(index: number) {
    const todo = this.todos[index];
    if (todo) todo.done = !todo.done;
  }
}

export const todoStore = createClassyStore(new TodoStore());
```

### 2. Persist it

For a client-only app, pass `localStorage` explicitly. Both `name` and `storage` are required. For server-rendered React apps, attach persistence in a client effect as shown in the [SSR section](#skiphydration-ssr--nextjs-support).

```ts
// todoStore.ts
import {createClassyStore} from '@codebelt/classy-store';
import {persist} from '@codebelt/classy-store/utils';

// ... (Include TodoStore setup from Step 1)

// Saves all store properties to localStorage
const handle = persist(todoStore, {
  storage: localStorage,
  name: 'todo-store',
});
```

**Stored under the `todo-store` key:**

```json
{
  "version": 0,
  "state": {
    "todos": [],
    "filter": "all"
  }
}
```

The optional `expiresAt` field is an absolute timestamp in milliseconds, calculated as `Date.now() + expireIn` when writing.

Store notifications trigger writes once per mutation batch, or after the configured debounce. On the next initialization, persistence restores saved data. The getter `remaining` and the methods `addTodo`/`toggle` are excluded.

### Choosing What to Persist

By default, `persist()` selects string-keyed data fields from the initial snapshot, excluding getters and functions. That list is resolved once when the handle is created; newly added top-level keys are not automatically included. Use declared fields for a stable shape, or put dynamic keys inside a declared object field. You can narrow the selection with `properties`:

```ts
persist(todoStore, {
  storage: localStorage,
  name: 'todo-store',
  properties: ['todos'],  // Only persist todos, not filter
});
```

Now `filter` resets to its class default (`'all'`) on every page load, while `todos` are restored from storage.

An explicit list is used as supplied. Select writable data fields, not getters or
methods. Values still need to be JSON-compatible, or have a transform: ordinary
JSON drops `undefined` and functions, and rejects `BigInt` and cyclic structures.

### Why getters are excluded

Class getters like `get remaining()` are derived values. Their memoized results are invalidated when the data they depend on changes. Persisting a getter result would be redundant and risks restoring a stale value that contradicts the underlying data.

### Configuration and Handle Overview

Here is a quick overview of every configuration option and handle method. You won't need most of them day-to-day, but they're available when you do.

```ts
import {persist} from '@codebelt/classy-store/utils';

const handle = persist(todoStore, {
  name: 'TodoStore',         // Unique storage key (required)
  properties: ['todos'],     // Omit for initial data fields; [] persists no properties
  storage: localStorage,     // Required adapter with getItem/setItem/removeItem; no default
  debounce: 500,             // Coalesce rapid mutations into one write, in ms (default: 0)
  version: 0,                // Schema version number; triggers migrate when mismatched (default: 0)
  migrate: (state, oldVersion) => state, // Return the migrated state when versions differ
  merge: 'shallow',          // How to merge persisted state on hydration: 'shallow' | custom function
  skipHydration: false,      // Set true to wait for a manual handle.rehydrate() call
  syncTabs: true,            // Opt in to localStorage tab updates (default: false)
  expireIn: 1000,            // TTL in ms; expired data is skipped on hydration. Resets on every write
  clearOnExpire: false,      // Auto-remove storage key when expired data is found (default: false)
  onError: (error, operation) => console.error(operation, error),
});

handle.isHydrated;           // Whether a hydration attempt has settled, including failures
handle.isExpired;            // Expiry observed since init or the latest explicit rehydrate()
await handle.hydrated;       // An attempt settled; inspect getSnapshot().lastError
handle.getSnapshot();       // Current readonly status
handle.getServerSnapshot(); // Initial status for SSR/hydration
const stopStatus = handle.subscribe(() => console.log(handle.getSnapshot()));

try {
  await handle.save();       // Save now, bypassing debounce
  await handle.clear();      // Remove stored data; keep in-memory state
  await handle.rehydrate();  // Read storage again
} catch (error) {
  console.error('Explicit persistence operation failed', error);
}

stopStatus();               // Remove only this status listener
handle.dispose();           // Stop persistence and release its resources
```

---

## Configuration Properties

### `properties` (Per-Property Transforms)

Some values aren't JSON-safe. `Date` objects become strings, and JSON loses custom class prototypes and methods. Transforms handle the round-trip through the `properties` option.

The transform's `key` selects its TypeScript types: `serialize` receives that property's readonly snapshot value, and `deserialize` must return that property's mutable value. Stored input remains `unknown`, so validate it before restoring. Optional properties retain `undefined` in their value type. Standalone descriptors can use `PropertyTransform<YourStore, 'propertyName'>`, exported from `@codebelt/classy-store/utils`.

```ts
class UserStore {
  name = '';
  birthdate = new Date();

  get birthYear() {
    return this.birthdate.getUTCFullYear();
  }
}

const userStore = createClassyStore(new UserStore());

persist(userStore, {
  name: 'user-store',
  storage: localStorage,
  properties: [
    'name',  // plain key -- string, no transform needed
    {
      key: 'birthdate',
      serialize: (date) => date.toISOString(),            // Date → string
      deserialize: (stored) => {
        if (typeof stored !== 'string') throw new Error('Expected a birthdate');
        const date = new Date(stored);
        if (Number.isNaN(date.getTime())) throw new Error('Invalid birthdate');
        return date;
      },
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

`persist()` requires a storage adapter. Any object with `getItem`, `setItem`, and `removeItem` (sync or async) works, including `localStorage`.

**sessionStorage (Tab-Scoped)**

Use `sessionStorage` for state that should reset when the tab closes:

```ts
persist(uiStore, {
  name: 'ui-state',
  storage: sessionStorage,
  properties: ['sidebarOpen', 'activeTab'],
  // syncTabs defaults to false; opt in only for localStorage
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

Opt in to keep `localStorage`-backed state in sync across browser tabs. When another tab writes to the same key, this tab re-hydrates from the new value:

```ts
persist(authStore, {
  name: 'auth',
  storage: localStorage,
  syncTabs: true,
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
  storage: localStorage,
  name: 'ui',
  syncTabs: false,
});
```

For synchronization between separate browser tabs, use `localStorage`.
[`sessionStorage` events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)
are limited to same-tab contexts sharing that storage area; async and custom
adapters do not emit browser storage events themselves. `syncTabs` installs a
browser event listener, so leave it disabled in environments without that API.

Storage deletion events are ignored. Calling `handle.clear()` in one tab does
not reset another tab's in-memory state. To broadcast a reset, assign the desired
data and save it, as the logout example does above.

An event whose value has already been replaced in its storage area is ignored.
This prevents a delayed event from rolling a newer local save back in the UI.
Accepted remote updates cancel pending debounced auto-saves and do not write
the restored state back to storage.

### Overlapping async operations

Each persistence handle orders its writes and removals. A slow earlier save
cannot finish after a later save and overwrite it. `save()` captures the current
state when requested and resolves after that write completes; a failed write
reports through `onError` and does not block later writes.

`rehydrate()` waits for writes/removals already requested through that handle.
If another read, save, clear, accepted storage event, or local mutation supersedes
an in-flight read, its result is ignored. In particular, typing while initial
async hydration is pending keeps the newer local state. An ignored read still
settles its promise; hydration completion does not guarantee that stored data won.

`clear()` cancels pending auto-saves and removes stored data after earlier issued
writes finish. Later edits can persist again. `dispose()` skips queued writes
that have not started; it cannot cancel adapter I/O already in progress.

Ordering is per handle. Separate handles sharing an async storage key still
need coordination at the application or adapter level.

### `expireIn` & `clearOnExpire` (Expiration / TTL)

Use `expireIn` to stamp a time-to-live (in milliseconds) on saved data. Hydration skips an expired payload and preserves the store's current values, which are usually its defaults during initialization. Any stored `expiresAt` timestamp is honored on read, even if the reading handle does not specify `expireIn`.

```ts
persist(sessionStore, {
  storage: localStorage,
  name: 'session',
  expireIn: 900_000,  // 15 minutes
});
```

**A new expiry timestamp is calculated when each save is serialized.** An async write may wait in the queue after that point. Expiry is checked during hydration or an incoming storage event; no timer expires or resets live state merely because time passes.

**Checking expiration**

The handle exposes an `isExpired` flag that becomes `true` when hydration encounters expired data:

```ts
const handle = persist(sessionStore, {
  storage: localStorage,
  name: 'session',
  expireIn: 900_000,
});

await handle.hydrated;

if (handle.isExpired) {
  // Stored session expired — redirect to login
}
```

The flag records observed expiry, not a live countdown. `rehydrate()` resets it
before checking storage again. Saving, clearing, or receiving a fresh cross-tab
payload does not reset a previously observed expiry flag.

By default, expired data is skipped but left in storage. Set `clearOnExpire: true` to automatically remove the key:

```ts
persist(sessionStore, {
  storage: localStorage,
  name: 'session',
  expireIn: 900_000,
  clearOnExpire: true,  // Remove key from storage when expired
});
```

### `skipHydration` (SSR / Next.js Support)

Create the store per request or provider from matching initial data. Call
`prepareStoreForHydration(store)` from `@codebelt/classy-store/react/server`
before rendering or starting persistence. This preserves the server snapshot
for boundaries that hydrate after the live store changes.

Attach persistence in a client effect. The effect owns the handle and disposes
it during cleanup, including Strict Mode replay:

```tsx
'use client';

import {useEffect} from 'react';
import {persist} from '@codebelt/classy-store/utils';
import type {TodoStore} from './todoStore';

export function TodoPersistence({store}: {store: TodoStore}) {
  useEffect(() => {
    const handle = persist(store, {
      name: 'todo-store',
      storage: localStorage,
      skipHydration: true,
      onError: (error, operation) => console.error(operation, error),
    });

    // Explicit calls reject even when onError is configured.
    void handle.rehydrate().catch(() => {
      // onError already reported the failure; keep the current store values.
    });

    return () => handle.dispose();
  }, [store]);

  return null;
}
```

Render this component inside the provider that owns the prepared store. It
accesses browser storage only inside the effect. Avoid module-level mutable
stores or shared in-memory storage adapters on the server, where they can mix
state across requests.

`skipHydration: true` delays the initial read until `rehydrate()` is called.
It does not delay writes, and it does not replace snapshot preparation for
streamed or selective hydration. If no manual timing is needed, omit it and
let the effect's `persist()` call start automatic hydration.

See [React SSR](./REACT_SSR.md), [store scoping](./REACT_SCOPING.md), and
[Next.js App Router](./REACT_NEXT.md) for complete provider examples. Rendering
children only after restoration settles is also possible, but then those
children do not contribute their own server-rendered content.

### `debounce` (Debouncing Writes)

For stores that mutate frequently (form inputs, drag positions, real-time data), debouncing prevents excessive writes:

```ts
persist(formStore, {
  storage: localStorage,
  name: 'form-draft',
  debounce: 500,  // Wait for 500ms without a new store notification
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
  storage: localStorage,
  name: 'todo-store',
  version: 2,
  migrate: (state, oldVersion) => {
    if (oldVersion !== 0 && oldVersion !== 1) {
      throw new Error(`Unsupported stored version: ${oldVersion}`);
    }

    // v0 used `items`; v1 renamed it to `todos`. Both stored strings.
    const storedTodos = oldVersion === 0 ? state.items : state.todos;
    if (!Array.isArray(storedTodos)) throw new Error('Expected saved todos');
    const todos = storedTodos.map((text) => {
      if (typeof text !== 'string') throw new Error('Expected a todo string');
      return {text, done: false};
    });

    const {items: _oldItems, ...remaining} = state;
    return {...remaining, todos};
  },
});
```

Migration runs only when stored and configured versions differ. Without a
`migrate` callback, a version mismatch does not reject the payload. Validate the
versions and shapes your application accepts. Migration and hydration do not
automatically rewrite storage; a later save writes the configured version.

**Merge Strategies**

When you add new properties to a store, old persisted data won't include them. The `merge` strategy controls how persisted state combines with the store's current state.

Imagine your store adds a new `tags` property, but old persisted data only has `todos` and `filter`:

```ts
// Current store class (v2 — added `tags`)
class TodoStore {
  filter: 'all' | 'active' | 'done' = 'all';
  todos: {text: string; done: boolean}[] = [];
  tags: string[] = ['work', 'personal'];  // new property with defaults
}

// Old persisted data in storage (no `tags` key):
// { "version": 1, "state": { "filter": "done", "todos": [{"text": "Buy milk", "done": false}] } }
```

**`'shallow'`** (default) — persisted values overwrite current values one key at a time. Properties not in storage keep their current value, which is the class default on a fresh store:

```ts
persist(todoStore, {
  name: 'todo-store',
  storage: localStorage,
  merge: 'shallow',
});

// Result after hydration:
// filter → "done"                              (from storage)
// todos  → [{text: "Buy milk", done: false}]   (from storage)
// tags   → ["work", "personal"]                (kept class default)
```

**Custom function** — for full control, pass a function that receives `(persisted, current)` and returns the merged state:

```ts
persist(todoStore, {
  storage: localStorage,
  name: 'todo-store',
  merge: (persisted, current) => {
    return {
      ...current,             // start with the current selected fields
      ...persisted,           // overwrite with stored values
      tags: [                 // custom: combine stored + default tags
        ...new Set([
          ...(persisted.tags as string[] ?? []),
          ...(current.tags as string[] ?? []),
        ]),
      ],
    };
  },
});
```

---

## The Handle

### Observable status

```tsx
import {usePersistStatus} from '@codebelt/classy-store/react';
import type {PersistHandle} from '@codebelt/classy-store/utils';

function PersistenceStatus({handle}: {handle: PersistHandle}) {
  const {isHydrated, isExpired, lastError} = usePersistStatus(handle);
  if (lastError) return <span>Persistence failed: {lastError.operation}</span>;
  if (!isHydrated) return <span>Restoring…</span>;
  return <span>{isExpired ? 'Stored data expired' : 'Ready'}</span>;
}
```

`PersistStatus` contains readonly `isHydrated`, `isExpired`, `isDisposed`, and `lastError` fields. `lastError` is `null` or `{error, operation}`; the next successful operation clears it. Hydration, expiry, and errors notify status consumers even when store data stays unchanged.

Outside React, use `handle.subscribe(() => handle.getSnapshot())`. The callback takes no arguments; read the current snapshot inside it. `subscribe` returns listener cleanup and does not control persistence itself. `getSnapshot()` returns the same frozen object until status changes. `getServerSnapshot()` returns initial status for SSR/hydration; server and client handles must start with matching status. See [`usePersistStatus`](./index.md#usepersiststatushandle).

Public types `PersistStatus` and `PersistOperation` are exported from `@codebelt/classy-store/utils`.

### `isHydrated` & `hydrated`

These indicate that a hydration attempt has settled, including failures and obsolete reads that were skipped. `hydrated` resolves once and remains resolved during later reads; await `rehydrate()` to wait for a specific new attempt. They do not guarantee that stored data was applied:

```ts
// Async -- await the promise
await handle.hydrated;
console.log('Hydration status:', handle.getSnapshot());

// Sync check
if (handle.isHydrated) {
  // The attempt has settled; inspect lastError for a reported failure.
}
```

Hydration is asynchronous even with `localStorage`: read results are applied after an `await`, not before `persist()` returns. Async adapters can take longer, and a read waits for earlier writes. With `skipHydration: true`, `hydrated` stays pending until a manual hydration attempt settles; disposal alone does not resolve a never-started attempt. Once `isHydrated` becomes true, later reads do not reset it to false.

### Handle operation failures

Explicit `save()`, `clear()`, and `rehydrate()` calls reject on failure after reporting through `onError` and `lastError`. Automatic writes and initial hydration report failures without producing unhandled rejections. Handle errors around manual operations:

```ts
try {
  await handle.save();
  console.log('Saved');
} catch (error) {
  console.error('Could not save', error);
}

try {
  await handle.clear();
  await handle.rehydrate();
} catch (error) {
  console.error('Could not clear or restore stored data', error);
}
```

Each failing operation still calls `onError` once and updates status before rejecting with the original error. `PersistOperation` is `'read' | 'write' | 'remove' | 'parse'`; decoding, transforms, migrations, and merge failures use `'parse'`. A failed operation does not block later queued saves. `rehydrate` also waits for expired-data removal when `clearOnExpire` is enabled and rejects if that removal fails.

An obsolete read superseded by a local edit or newer request is still ignored. Calls on a disposed handle reject; explicit queued writes cancelled by disposal also reject without invoking the adapter. Disposal errors do not invoke `onError` or publish more status.

Handle rejected promises in DOM event handlers, for example `onClick={() => { void handle.save().catch(showError); }}`. Use `try`/`catch` inside an async handler when the UI also needs to show success.

### `clear()` (Clear stored data)

```ts
// Remove the stored data without affecting in-memory state
await handle.clear();

// The store still has its current state in memory.
// Next page load starts with class defaults (nothing in storage).
```

### `save()` (Manual save)

Save and await completion while the page is still active, for example in an application-controlled navigation handler:

```ts
const handle = persist(formStore, {
  name: 'form-draft',
  storage: localStorage,
  debounce: 1000,
});

async function saveAndContinue(continueNavigation: () => void) {
  try {
    await handle.save();
    continueNavigation();
  } catch (error) {
    console.error('Could not save', error);
  }
}
```

`save()` cancels the pending debounce timer and requests a write of the current
state immediately. It waits behind earlier writes, including when a synchronous
adapter's prior operation is still settling. Browser unload handlers cannot
guarantee that queued or async writes finish.

### `dispose()` (Stop persisting)

```ts
const handle = persist(todoStore, {name: 'todo-store', storage: localStorage});

// Later: stop all persistence (e.g., on logout)
handle.dispose();

// Mutations after this point are NOT written to storage.
// Cross-tab sync listener is also removed.
// Pending debounce timer is cancelled.
todoStore.addTodo('This is not persisted');
```

Pending storage reads that finish after disposal no longer apply state, clear expired entries, or invoke read-error callbacks. Hydration promises still settle when the read finishes. This prevents a retired React effect from overwriting a newer scope during Strict Mode replay, resets, or storage configuration changes. Already-issued adapter I/O is not cancelled; cleanup cannot undo a write already sent to storage. See the [typed context lifecycle example](./REACT_SCOPING.md).

`dispose()` is safe to call repeatedly. Disposal publishes `isDisposed: true` and clears status listeners; no later callbacks run. A pending hydration may still settle afterward and update the readable `isHydrated` flag without notifying disposed listeners. The public `isHydrated` and `isExpired` properties are readonly, matching their runtime getters.

---

## Multiple Persistence Targets

Call `persist()` multiple times with different options to persist different parts of a store to different locations:

```ts
const todoStore = createClassyStore(new TodoStore());

// Persist todos to localStorage (survives page close)
persist(todoStore, {
  storage: localStorage,
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
  storage: localStorage,
  name: 'app-store',
  version: 1,
  debounce: 300,

  properties: [
    'theme',
    'language',
    {
      key: 'lastLogin',
      serialize: (date) => date.toISOString(),
      deserialize: (stored) => {
        if (typeof stored !== 'string') throw new Error('Expected a login date');
        const date = new Date(stored);
        if (Number.isNaN(date.getTime())) throw new Error('Invalid login date');
        return date;
      },
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

Catch failures from explicit `save()`, `clear()`, and `rehydrate()` calls. Reading `isHydrated` or awaiting `hydrated` only confirms an attempt settled; inspect status for errors.

| Feature | Code Example |
|---|---|
| **Persist everything** | `persist(myStore, {name: 'key', storage: localStorage})` |
| **Persist specific properties** | `properties: ['count', 'name']` |
| **Handle Dates & Objects** | Supply a property transform with a serializer and a validating deserializer |
| **Handle reactive collections** | Serialize entries/values and deserialize with `reactiveMap()` / `reactiveSet()`; see the [collections guide](./REACTIVE_COLLECTIONS_TUTORIAL.md) |
| **Use sessionStorage** | `storage: sessionStorage` |
| **Use AsyncStorage** | `storage: AsyncStorage, syncTabs: false` |
| **Disable cross-tab sync** | `syncTabs: false` |
| **Expire payload after time**| `expireIn: 900_000` |
| **Auto-clear expired data** | `clearOnExpire: true` |
| **SSR & manual hydration** | `skipHydration: true` + `handle.rehydrate()` |
| **Debounce storage writes**| `debounce: 500` |
| **Migrate schema versions**| `version: 2, migrate: (state, old) => { ... }` |
| **Merge strategy** | `merge: 'shallow'` or a custom `(persisted, current) => merged` function |
| **Check hydration** | `handle.isHydrated` |
| **Wait for hydration** | `await handle.hydrated` |
| **Clear stored data** | `await handle.clear()` |
| **Force immediate save** | `await handle.save()` |
| **Re-hydrate manually** | `await handle.rehydrate()` |
| **Stop persisting** | `handle.dispose()` |
| **Check if data expired** | `handle.isExpired` |
