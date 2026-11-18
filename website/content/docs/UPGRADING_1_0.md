---
title: "1.0 upgrade guide"
description: "Breaking changes and behavior changes when upgrading from 0.11.x to the first stable release."
---

1.0 is the first stable release. From here on the public API and its documented behavior follow semantic versioning. This guide lists everything that changed since 0.11.x, the code edits each change may need, and what stayed the same.

If you are coming from an older release, apply the [0.11.0](./UPGRADING_0_11.md), [0.8.0](./UPGRADING_0_8.md) and [0.7.0](./UPGRADING_0_7.md) notes first.

## At a glance

Changes that can require an edit:

| Change                                                       | What to do                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `devtools()` returns a handle                                | Call `handle.dispose()` instead of calling the result                  |
| Angular `injectStore` renamed                                | Import and call `injectClassyStore`                                    |
| `subscribe()` on a nested proxy no longer fires for siblings | Subscribe to the store itself if you relied on that                    |
| `persist` ignores another stored `version` without `migrate` | Provide `migrate` to keep reading old data                             |
| The Solid adapter requires Solid 2                           | Install `solid-js` and `@solidjs/web` `^2.0.0`                         |
| `shallowEqual` is stricter                                   | Usually nothing; check selectors that compared unlike values           |
| Sync subscribers hear once per method, not once per write    | Usually nothing; remove code that relied on seeing intermediate states |

Changes that need no edit: transactions for array operations, per-field hydration, history restoration, object keys in reactive collections, the new `PROXYABLE` export.

## Store methods and array operations are transactions

A call to a store method, or to an array method on store state, now notifies synchronous subscribers once, after the outermost call returns or throws. Before, each property write inside the call notified them. Every framework adapter subscribes synchronously, so this applies to React, Vue, Svelte, Solid and Angular alike.

```ts
class Cart {
  items: number[] = [];
  total = 0;

  add(price: number) {
    this.items.push(price);
    this.total += price;
  }
}

const cart = createClassyStore(new Cart());
subscribe(cart, listener, {sync: true});

cart.add(5);
// 0.11: listener ran after the push and again after the total changed
// 1.0:  listener runs once, and never sees items updated but total stale
```

The practical effect is on lists. One `sort()`, `reverse()`, `unshift()` or `splice()` moves many elements, and each move used to notify every mounted consumer, which then rebuilt the list snapshot. With one mounted React component, `unshift` on 3,000 rows took about 2.4 seconds; it now takes a few milliseconds.

What to check:

- **Ordinary `subscribe()` callbacks are unchanged.** They were already batched into one microtask notification.
- **Direct writes outside a method still notify one by one.** `store.a = 1; store.b = 2` in an event handler is two notifications. A plain loop of direct writes notifies per write; move it into a store method to make it one transaction.
- **An `async` method is a transaction up to its first `await`.** Writes after an `await` notify individually, so loading and result states still render separately.
- **Reads inside a method are current.** Versions and snapshots update with every write; only the notification is deferred.

## `subscribe()` on a nested proxy observes its subtree only

In 0.11, a subscription to a nested proxy also fired when a sibling field in the owning store changed, a behavior kept from releases where every subscription was attached to the root. It now fires only for changes inside the object you passed.

```ts
const store = createClassyStore({user: {name: 'Ada'}, count: 0});
subscribe(store.user, listener);

store.count++; // 0.11: listener ran. 1.0: it does not.
store.user.name = 'Grace'; // listener runs in both
```

If you relied on the old behavior, subscribe to the store: `subscribe(store, listener)`. The same applies to `useClassyStore(store.user)`, `subscribeKey`, `persist` and `withHistory` when given a nested proxy.

## Each `subscribe()` call is its own registration

Subscribing the same callback twice used to register it once, so the first unsubscribe silently removed both. Each call now registers separately and each returned function removes only its own registration.

```ts
const first = subscribe(store, listener);
const second = subscribe(store, listener);
// 1.0: listener runs twice per change until one of them is released
first();
// listener still runs once per change
```

## A snapshot assigned into a store stays a snapshot

Assigning a snapshot object into a store, for example a row taken from a rendered list, used to wrap that frozen object in a store proxy. Reads worked, and the first write failed with `'set' on proxy: trap returned falsish`. The store now keeps the snapshot by reference as an immutable value, the way it keeps a `Date`. This also covers a value read through React's auto-tracked hook.

```tsx
const todos = useClassyStore(todoStore, (state) => state.todos);
// in a click handler:
todoStore.selected = todos[0];

todoStore.selected.done = true;
// 1.0: TypeError, the stored snapshot is read-only
```

Choose what you mean:

- **Follow the live row:** store the live object or its id, `todoStore.selected = todoStore.todos[0]`.
- **Edit an independent copy:** clone first, for example `structuredClone(todos[0])` for plain data.
- **Keep a frozen baseline** for comparison: assign the snapshot as before. It now costs nothing and keeps its identity.

## `persist`: hydration is per field

Before, any change to the store while the stored data was being read made the read obsolete. The stored data was discarded and the next automatic save replaced it with the store's current values, which were usually the defaults. That happened even when the edit was to a field that is not persisted, and with synchronous storage when the edit was in the same tick as `persist()`.

Now a stored field is restored unless that same field was edited locally while the read was in flight, and automatic saves wait for the read to settle.

```ts
const settings = createClassyStore({
  theme: 'light',
  fontSize: 12,
  loading: false,
});
persist(settings, {
  name: 'settings',
  storage,
  properties: ['theme', 'fontSize'],
});
settings.loading = true; // start-up flag, set before the read completes

// Stored: {theme: 'dark', fontSize: 20}
// 0.11: the store stayed light/12 and storage was overwritten with light/12
// 1.0:  the store becomes dark/20; storage is untouched
```

If the user edits `fontSize` during the read, `fontSize` keeps the edited value, `theme` is still restored, and one save after the read writes both. `save()` and `clear()` behave as before and still take precedence over an in-flight read.

## `persist`: another stored version is ignored without `migrate`

When the stored `version` differs from the configured one and no `migrate` is given, the stored data is now ignored and the store keeps its current state. Before, it was applied as it was, whatever its shape. No error is reported, and the old record stays in storage until the next save replaces it.

```ts
persist(store, {name: 'settings', storage, version: 2});
// A record saved with version 1 is no longer applied.

persist(store, {
  name: 'settings',
  storage,
  version: 2,
  migrate: (state, oldVersion) =>
    oldVersion === 1 ? upgradeFromV1(state) : state,
});
// Provide migrate to keep reading older records.
```

A record with no `version` field counts as version `0`.

## `shallowEqual` is stricter

`shallowEqual` compared only enumerable string keys, so it called any two objects without such keys equal: two different dates, two different maps, a `RegExp` and another `RegExp`. A selector returning a `Date` with `isEqual: shallowEqual` never re-rendered when the date was replaced.

| Compared values                               | 0.11    | 1.0                                   |
| --------------------------------------------- | ------- | ------------------------------------- |
| Two `Date` objects                            | `true`  | `true` only for the same instant      |
| Two `Map` or two `Set` objects                | `true`  | `true` only for same size and members |
| Values with different prototypes              | by keys | always `false`                        |
| Two `RegExp`, `Error`, `Promise`, empty class | `true`  | `false` unless the same object        |
| Plain records and arrays                      | by keys | unchanged                             |

A plain object and a null-prototype object with the same keys have different prototypes and are no longer equal.

## `devtools()` returns a handle

`devtools()` returned a function. It now returns a handle with `dispose()`, like `persist()` and `withHistory()`.

```ts
// 0.11
const disconnect = devtools(store, {name: 'Store'});
disconnect();

// 1.0
const connection = devtools(store, {name: 'Store'});
connection.dispose();
```

In a React effect, return `() => connection.dispose()`. The published types also stop declaring `__REDUX_DEVTOOLS_EXTENSION__` on the global `Window`, which could conflict with other DevTools typings. If your code relied on that declaration, declare the property in your own project.

## Angular: `injectStore` is `injectClassyStore`

```ts
// 0.11
import {injectStore} from '@codebelt/classy-store/angular';
readonly state = injectStore(formStore);

// 1.0
import {injectClassyStore} from '@codebelt/classy-store/angular';
readonly state = injectClassyStore(formStore);
```

The signature, return type and behavior are unchanged.

## Changes that need no edit

**`withHistory`**

- Undo and redo now remove top-level fields that the restored entry does not have. Before, a field added after the entry survived the undo.
- `undo()` called in the same tick as an edit records that edit first and steps back over it. Before, it skipped one entry further back and lost the edit. You no longer need to wait for the batched notification.
- Fields that did not change between entries are left untouched, so their snapshots keep their identity and selectors reading them do not re-run.

**Reactive collections**

- Objects work as map keys and set values inside a store. A member is matched by identity, and the original object, its store proxy and any snapshot of it count as the same member. Before, `has()` returned `false` for the object you had just added and `add()` or `set()` appended duplicates.
- `map.set(key, value)` on an existing key keeps the stored key and position and replaces the value; setting the value it already has notifies no one.
- Lookups scan the raw backing array. `get()` on a 10,000-entry map inside a store went from about 3.7 ms to about 0.06 ms.

**`PROXYABLE`**

A class of your own can now be deeply reactive when nested in a store by declaring `static [PROXYABLE] = true`, with `PROXYABLE` imported from `@codebelt/classy-store`. See [reactive nested classes](./TUTORIAL.md#reactive-nested-classes).

## Framework and package support

- **Solid**: the adapter requires Solid 2. The peer range is `solid-js ^2.0.0`; install `solid-js` and `@solidjs/web` at `2.0.0` or later. The adapter's `useClassyStore(store)` signature and behavior are unchanged.
- **React** `^18.0.0 || ^19.0.0`, **Vue** `^3.2.0`, **Svelte** `^4.0.0 || ^5.0.0` and **Angular** `^22.0.0` are unchanged.
- The package declares `engines.node >= 20` and exports `./package.json`.
- TypeScript projects need `moduleResolution` set to `bundler`, `node16` or `nodenext` to resolve the subpath entries such as `@codebelt/classy-store/react`. The legacy `node` (node10) setting cannot resolve package `exports`; this was already the case in 0.x.

## Unchanged

`createClassyStore`, `snapshot`, `useClassyStore` in both modes, `createStoreHook`, `useLocalStore`, `prepareStoreForHydration`, `useHistoryStatus`, `usePersistStatus`, `subscribeKey`, `toSvelteStore`, the Vue and Solid `useClassyStore`, the `persist` and `withHistory` options and handles, and the persisted storage format. Records written by 0.11 are read by 1.0.
