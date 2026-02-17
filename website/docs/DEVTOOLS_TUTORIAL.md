# DevTools Tutorial

`devtools()` connects a store proxy to the [Redux DevTools](https://github.com/reduxjs/redux-devtools) browser extension for state inspection and time-travel debugging. Every mutation sends a snapshot to the DevTools panel. You can inspect state, jump to any point in history, and the store updates in real-time.

## Prerequisites

Install the Redux DevTools extension for your browser:

- [Chrome](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)
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

const disconnect = devtools(counterStore, {name: 'CounterStore'});
```

Open the Redux DevTools panel in your browser. You'll see `CounterStore` in the instance selector with the initial state: `{ count: 0, step: 1 }`.

### 3. Mutate and observe

```ts
counterStore.increment();
// DevTools shows: action "STORE_UPDATE", state { count: 1, step: 1 }

counterStore.increment();
// DevTools shows: action "STORE_UPDATE", state { count: 2, step: 1 }

counterStore.setStep(5);
counterStore.increment();
// DevTools shows: action "STORE_UPDATE", state { count: 7, step: 5 }
```

Each batched mutation appears as a new entry in the DevTools timeline.

### 4. Time-travel

Click any previous entry in the DevTools timeline. The store proxy updates to match that state — your React components re-render, side effects fire, everything stays in sync. Click "Jump to State" or "Jump to Action" to navigate through history.

### 5. Disconnect when done

```ts
disconnect();
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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `'ClassyStore'` | Display name in the DevTools panel |
| `enabled` | `boolean` | `true` | Set to `false` to disable (returns a noop) |

### Return value

A dispose function `() => void` that disconnects from DevTools and unsubscribes from the store.

## How It Works

1. **Connect:** calls `window.__REDUX_DEVTOOLS_EXTENSION__.connect({ name })` to create a DevTools connection.
2. **Init:** sends the initial snapshot via `connection.init(snapshot(store))`.
3. **Subscribe:** uses `subscribe(store, ...)` to listen for mutations. On each batched mutation, sends `snapshot(store)` to DevTools via `connection.send()`.
4. **Time-travel:** listens for `DISPATCH` messages from DevTools. When a `JUMP_TO_STATE` or `JUMP_TO_ACTION` message arrives, parses the state and applies it back to the store proxy — skipping getters and methods (same pattern as `persist()`).
5. **Dispose:** unsubscribes from the store and disconnects from DevTools.

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

When `enabled` is `false`, `devtools()` returns a noop immediately — no DevTools connection is created, no subscriptions are added, and the function has zero runtime cost.

### Conditional connection

Connect DevTools only when the extension is available:

```ts
const disconnect = devtools(counterStore, {name: 'CounterStore'});

// If the extension isn't installed, `disconnect` is a noop.
// No errors, no warnings — the store works normally.
```

`devtools()` checks for `window.__REDUX_DEVTOOLS_EXTENSION__` internally. If it's not available (missing extension, SSR, Node.js), it returns a noop without throwing.

### Late disposal on unmount (React)

```tsx
import {useEffect} from 'react';
import {devtools} from '@codebelt/classy-store/utils';

function App() {
  useEffect(() => {
    const disconnect = devtools(counterStore, {name: 'CounterStore'});
    return () => disconnect();
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

During time-travel, the utility temporarily pauses sending updates to DevTools to avoid echoing the applied state back as a new action.

## Quick Reference

| What you want | How to do it |
|---|---|
| Connect a store | `devtools(store, {name: 'MyStore'})` |
| Disconnect | `const dispose = devtools(...); dispose()` |
| Disable in production | `enabled: import.meta.env.DEV` |
| Multiple stores | Call `devtools()` once per store with unique names |
| Use without extension | Works safely — returns a noop if extension is missing |
