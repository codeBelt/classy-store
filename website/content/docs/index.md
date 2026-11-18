---
title: "Getting started"
description: "Install Classy Store, create a store, and read it in a React component."
---

## Installation

```bash
bun add @codebelt/classy-store
```

## Quick Start

### 1. Define a store class

```ts title="counter.ts"
export class Counter {
  count = 0;

  increment() {
    this.count++;
  }
}
```

### 2. Create a reactive store

```ts title="stores.ts"
import {createClassyStore, snapshot} from '@codebelt/classy-store';
import {Counter} from './counter';

export const counter = createClassyStore(new Counter());
snapshot(counter).count; // 0
```

### 3. Use in React components

```tsx title="CounterButton.tsx"
import {useClassyStore} from '@codebelt/classy-store/react';
import {counter} from './stores';

export function CounterButton() {
  const count = useClassyStore(counter, (state) => state.count);
  return <button onClick={() => counter.increment()}>{count}</button>;
}
```

This shared instance is for a client-only app. For SSR or independent subtrees, [scope the store](./REACT_SCOPING.md) to a request or provider.

[Open the reactivity example →](/examples/reactivity/)

## Framework support and upgrades

1.0 is the first stable release. Upgrading from 0.11.x? Read the [1.0 upgrade guide](./UPGRADING_1_0.md) for the breaking changes and the edits they need.

From an older release, apply the earlier notes first: [0.11.0](./UPGRADING_0_11.md), then [0.8.0](./UPGRADING_0_8.md) for public API changes and persistence error handling, and [0.7.0](./UPGRADING_0_7.md) from 0.6.x or earlier.

All framework peer dependencies are optional — install only what your project uses:

| Framework | Peer Dependency              | Import                           |
| --------- | ---------------------------- | -------------------------------- |
| React     | `react ^18.0.0 \|\| ^19.0.0` | `@codebelt/classy-store/react`   |
| Vue       | `vue ^3.2.0`                 | `@codebelt/classy-store/vue`     |
| Svelte    | `svelte ^4.0.0 \|\| ^5.0.0`  | `@codebelt/classy-store/svelte`  |
| Solid 2   | `solid-js ^2.0.0`            | `@codebelt/classy-store/solid`   |
| Angular   | `@angular/core ^22.0.0`      | `@codebelt/classy-store/angular` |

These ranges include stable releases within the listed majors and exclude
untested future majors. Solid 1 and the Solid 2 release candidates are not supported.
Use matching React/React DOM versions. Development dependencies stay pinned
independently of the supported consumer ranges.

Packed compatibility checks cover React 18.0.0 and 19.0.0, Vue 3.2.0, and Svelte
4.0.0 and 5.0.0. React's existing 18.3.1/current-19 checks remain in the matrix.
The Vue and Svelte checks reuse the focused input, timing, computed, list, and
cleanup tests with each consumer's native compiler; CI runs them in Chromium.

## Choose a guide

- [React tutorial](./TUTORIAL.md), [scoped stores](./REACT_SCOPING.md), [server rendering](./REACT_SSR.md), and [Next.js](./REACT_NEXT.md)
- [Vue](./VUE.md), [Svelte](./SVELTE.md), [Solid 2](./SOLID.md), and [Angular](./ANGULAR.md)
- [API reference](./API_REFERENCE.md) and [store patterns](./PATTERNS.md)
- [Persistence](./PERSIST_TUTORIAL.md), [undo and redo](./HISTORY_TUTORIAL.md), [property subscriptions](./SUBSCRIBE_KEY_TUTORIAL.md), and [Redux DevTools](./DEVTOOLS_TUTORIAL.md)
