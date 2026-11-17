---
title: "DevTools Tutorial"
description: "Connect Classy Store to Redux DevTools for inspection and time-travel debugging."
---

`devtools()` connects a store proxy to the [Redux DevTools](https://github.com/reduxjs/redux-devtools) browser extension for state inspection and time-travel debugging. It sends an initial snapshot and one update per batched store notification. Supported jump messages restore JSON data fields into the live store.

[Try the DevTools example →](/examples/devtools/)

## Prerequisites

Install the Redux DevTools extension for your browser:

- [Chrome](https://chromewebstore.google.com/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/reduxdevtools/)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/redux-devtools/nnkgneoiohoecpdiaponcejilbhhikei)

## Getting Started

### 1. Create a store

```ts
import {createClassyStore} from '@codebelt/classy-store';

class CounterStore {
  count = 0;
  step = 1;

  get doubled() {
    return this.count * 2;
  }

  increment() {
    this.count += this.step;
  }

  decrement() {
    this.count -= this.step;
  }

  setStep(step: number) {
    this.step = step;
  }
}

export const counterStore = createClassyStore(new CounterStore());
```

### 2. Connect to DevTools

```ts
import {devtools} from '@codebelt/classy-store/utils';

const connection = devtools(counterStore, {name: 'CounterStore'});
```

Open the Redux DevTools panel in your browser. Select `CounterStore` to inspect the initial snapshot, including `count: 0`, `step: 1`, and the computed `doubled` getter.

### 3. Mutate and observe

```ts
counterStore.increment();
await Promise.resolve();
// STORE_UPDATE: count 1, step 1, doubled 2.

counterStore.increment();
await Promise.resolve();
// STORE_UPDATE: count 2, step 1, doubled 4.

counterStore.setStep(5);
counterStore.increment();
await Promise.resolve();
// One STORE_UPDATE for both writes: count 7, step 5, doubled 14.
```

Each batched mutation appears as a new entry in the DevTools timeline.

### 4. Time-travel

Use a state/action jump in the DevTools timeline. The utility assigns the parsed data fields to the store, notifying its subscribers. Other utilities, including persistence and history, can observe these mutations too.

### 5. Disconnect when done

```ts
connection.dispose();
```

After disconnecting, mutations are no longer sent to DevTools and time-travel messages are ignored.

## Signature

```ts
function devtools<T extends object>(
  proxyStore: T,
  options?: DevtoolsOptions,
): () => void;
```

### Options

| Option    | Type      | Default         | Description                              |
| --------- | --------- | --------------- | ---------------------------------------- |
| `name`    | `string`  | `'ClassyStore'` | Display name in the DevTools panel       |
| `enabled` | `boolean` | `true`          | Set to `false` to disable (inert handle) |

### Return value

A `DevtoolsHandle`, the same shape of handle that `persist()` and `withHistory()` return. Its `dispose()` method removes the store subscription and DevTools message listener; calling it again does nothing. It does not call an extension-level disconnect API or clear the panel's recorded history.

## How It Works

1. **Connect:** calls `window.__REDUX_DEVTOOLS_EXTENSION__.connect({ name })` to create a DevTools connection.
2. **Init:** sends the initial snapshot via `connection.init(snapshot(store))`.
3. **Subscribe:** uses `subscribe(store, ...)` to listen for mutations. On each batched mutation, sends `snapshot(store)` to DevTools via `connection.send()`.
4. **Time-travel:** listens for `DISPATCH` messages from DevTools. For `JUMP_TO_STATE` and `JUMP_TO_ACTION`, it parses the state and assigns top-level data fields to the store proxy, skipping top-level getters and methods.
5. **Dispose:** unsubscribes from the store and removes the DevTools message listener.

## Use Cases

### Multiple stores

Connect each store with a unique name to distinguish them in the DevTools panel:

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {devtools} from '@codebelt/classy-store/utils';

const authStore = createClassyStore(new AuthStore());
const todoStore = createClassyStore(new TodoStore());
const uiStore = createClassyStore(new UiStore());

devtools(authStore, {name: 'AuthStore'});
devtools(todoStore, {name: 'TodoStore'});
devtools(uiStore, {name: 'UiStore'});
```

Each store appears as a separate instance in the DevTools dropdown.

### Development-only

Disable DevTools in production by tying the `enabled` option to your build environment:

```ts
devtools(counterStore, {
  name: 'CounterStore',
  enabled: import.meta.env.DEV,
});
```

When `enabled` is `false`, `devtools()` returns an inert handle immediately. No DevTools connection or ongoing subscription is created. `import.meta.env.DEV` is a Vite example; use your application's build-time development flag in other environments.

### Conditional connection

Connect DevTools only when the extension is available:

```ts
const connection = devtools(counterStore, {name: 'CounterStore'});

// If the extension isn't installed, `connection.dispose()` does nothing.
// No errors, no warnings — the store works normally.
```

`devtools()` checks for `window.__REDUX_DEVTOOLS_EXTENSION__` internally. If it's not available (missing extension, SSR, Node.js), it returns an inert handle without throwing. The library reads that global through its own type and declares nothing on `Window`, so it cannot clash with other DevTools typings in your project.

### Late disposal on unmount (React)

```tsx
import {useEffect} from 'react';
import {devtools} from '@codebelt/classy-store/utils';

function App() {
  useEffect(() => {
    const connection = devtools(counterStore, {name: 'CounterStore'});
    return () => connection.dispose();
  }, []);

  return <Counter />;
}
```

## Time-Travel Details

When you click a previous state in the DevTools timeline, the extension sends a message like:

```json
{
  "type": "DISPATCH",
  "payload": {"type": "JUMP_TO_STATE"},
  "state": "{\"count\": 0, \"step\": 1}"
}
```

The `devtools()` utility:

1. Parses `message.state` via `JSON.parse()`.
2. Iterates over the keys of the parsed state.
3. **Skips getters** — detected via `findGetterDescriptor()` on the prototype chain. Getters like `doubled` are computed values that recompute from the restored data automatically.
4. **Skips methods** — detected via `typeof value === 'function'`.
5. Assigns data properties directly to the store proxy: `proxy[key] = value`.
6. The SET trap fires, triggers reactivity, and your components update.

During time-travel, the utility suppresses the batched notification for the jump. A local write in that same batch can also be absent from the DevTools timeline.

Restoration replaces nested values with their parsed JSON. A nested object's
methods are lost, and a serialized nested getter becomes an ordinary data field.
Dates, custom class instances, and reactive collections also lose their original
types. Store fields missing from the received state keep their live values.
Use JSON-compatible data for time travel. Persistence transforms apply only to
storage restoration. The supported dispatch commands are `JUMP_TO_STATE` and
`JUMP_TO_ACTION`.

## Quick Reference

| What you want         | How to do it                                                   |
| --------------------- | -------------------------------------------------------------- |
| Connect a store       | `devtools(store, {name: 'MyStore'})`                           |
| Disconnect            | `const connection = devtools(...); connection.dispose()`       |
| Disable in production | `enabled: import.meta.env.DEV`                                 |
| Multiple stores       | Call `devtools()` once per store with unique names             |
| Use without extension | Works safely — returns an inert handle if extension is missing |
