---
title: "Vue 3"
description: "Read a reactive snapshot in Vue and update the store through actions."
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

```vue
<script setup lang="ts">
import {useClassyStore} from '@codebelt/classy-store/vue';
import {counter} from './counter';

const state = useClassyStore(counter);
</script>

<template>
  <button @click="counter.increment()">{{ state.count }}</button>
</template>
```

## Timing and cleanup

Vue's `useClassyStore(store)` updates its shallow ref synchronously, so computed
values are current immediately after an action and `await nextTick()` waits for
Vue's DOM update. Vue still batches rendering. Call the hook synchronously in
`setup()` / `<script setup>` or inside `effectScope().run()`; it throws without an
active scope, and stops subscribing when that scope is stopped. For inputs, use
`:value` with an action in `@input`, or a writable `computed` that reads the
snapshot and writes through a store action. Do not bind `v-model` directly to
readonly snapshot fields. The Vue adapter supports Vue 3.2 through the rest of
Vue 3 (`^3.2.0`). Its public return type uses `Ref<Snapshot<T>>`, which is available
in Vue 3.2.0; the runtime still uses a shallow ref.

[Runnable Vue example](https://github.com/codeBelt/classy-store/tree/main/examples/vue).
