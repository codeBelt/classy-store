---
title: "Svelte 4 and 5"
description: "Use a Svelte readable store for rendering and write through store actions."
---

Create a store for a client-rendered counter.

```ts
// counter.ts
import {createClassyStore} from '@codebelt/classy-store';

class Counter {
  count = 0;

  increment() {
    this.count++;
  }
}

export const counter = createClassyStore(new Counter());
```

Read the snapshot inside the component and call the store method to update it.

```svelte
<script lang="ts">
  import {toSvelteStore} from '@codebelt/classy-store/svelte';
  import {counter} from './counter';

  const state = toSvelteStore(counter);
</script>

<button onclick={() => counter.increment()}>{$state.count}</button>
```

The component above uses Svelte 5 event syntax. In Svelte 4, use `on:click={() => counter.increment()}`.

## Timing and cleanup

Svelte's `toSvelteStore(store)` delivers the initial snapshot immediately and
notifies subscribers synchronously: after each direct write, and once after each store method or array operation. `$store` subscriptions
are cleaned up automatically when the component is destroyed; manual subscribers
must call the returned unsubscribe function. Snapshots are readonly: update the
original store or call its actions from input handlers instead of using
`bind:value` on snapshot fields. Ordinary core subscriptions use microtask
batching. In Svelte 4, native `$:` computed statements update before the next
render, while the store snapshot and its class getters are current during the
input event. Svelte 5's `$derived` reads are current immediately. The adapter
preserves each version's native rendering schedule.

[Runnable Svelte example](https://github.com/codeBelt/classy-store/tree/main/examples/svelte).
