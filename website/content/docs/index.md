---
title: "Getting started"
description: "Install Classy Store, create a store, and read it in a React component."
---

## Installation

For the upgrade from 0.10.x and framework support in 0.11.0, see the [0.11.0 release notes](./UPGRADING_0_11.md).

Upgrading from 0.7.x? Read the [0.8.0 upgrade guide](./UPGRADING_0_8.md) for public API changes and persistence error handling. From 0.6.x or earlier, also follow the [0.7.0 upgrade guide](./UPGRADING_0_7.md).

```bash
bun add @codebelt/classy-store
```

All framework peer dependencies are optional — install only what your project uses:

| Framework         | Peer Dependency                | Import                           |
| ----------------- | ------------------------------ | -------------------------------- |
| React             | `react ^18.0.0 \|\| ^19.0.0`   | `@codebelt/classy-store/react`   |
| Vue               | `vue ^3.2.0`                   | `@codebelt/classy-store/vue`     |
| Svelte            | `svelte ^4.0.0 \|\| ^5.0.0`    | `@codebelt/classy-store/svelte`  |
| Solid 2 (preview) | `solid-js 2.0.0-rc.18` (exact) | `@codebelt/classy-store/solid`   |
| Angular           | `@angular/core ^22.0.0`        | `@codebelt/classy-store/angular` |

These ranges include stable releases within the listed majors and exclude
untested future majors. Solid remains pinned to its exact tested prerelease.
Use matching React/React DOM versions. Development dependencies stay pinned
independently of the supported consumer ranges.

Packed compatibility checks cover React 18.0.0 and 19.0.0, Vue 3.2.0, and Svelte
4.0.0 and 5.0.0. React's existing 18.3.1/current-19 checks remain in the matrix.
The Vue and Svelte checks reuse the focused input, timing, computed, list, and
cleanup tests with each consumer's native compiler; CI runs them in Chromium.

## Quick Start

### 1. Define a store class

```typescript
type Todo = {text: string; done: boolean};

class TodoStore {
  todos: Todo[] = [];
  filter: 'all' | 'done' | 'pending' = 'all';

  // Getter = computed value
  get filtered() {
    if (this.filter === 'all') return this.todos;
    return this.todos.filter((todo) =>
      this.filter === 'done' ? todo.done : !todo.done,
    );
  }

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
```

### 2. Create a reactive store

This shared instance is for a client-only app. For SSR or independent subtrees,
create stores per request or provider; see [store scoping](./REACT_SCOPING.md).

```typescript
import {createClassyStore} from '@codebelt/classy-store';

const todoStore = createClassyStore(new TodoStore());
```

### 3. Use in React components

```tsx
import {useClassyStore} from '@codebelt/classy-store/react';

// Selector mode: explicit control over what triggers re-renders
function TodoCount() {
  const remaining = useClassyStore(todoStore, (state) => state.remaining);
  return <span>{remaining} left</span>;
}

// Auto-tracked mode: reads are tracked automatically
function TodoList() {
  const snap = useClassyStore(todoStore);
  return (
    <ul>
      {snap.filtered.map((todo, index) => (
        <li key={index}>{todo.text}</li>
      ))}
    </ul>
  );
}

// Actions: call methods directly on the store
function AddButton() {
  return <button onClick={() => todoStore.addTodo('New')}>Add</button>;
}
```

## Choose a guide

- [React tutorial](./TUTORIAL.md), [scoped stores](./REACT_SCOPING.md), [server rendering](./REACT_SSR.md), and [Next.js](./REACT_NEXT.md)
- [Vue](./VUE.md), [Svelte](./SVELTE.md), [Solid 2 preview](./SOLID.md), and [Angular](./ANGULAR.md)
- [API reference](./API_REFERENCE.md) and [store patterns](./PATTERNS.md)
- [Persistence](./PERSIST_TUTORIAL.md), [undo and redo](./HISTORY_TUTORIAL.md), [property subscriptions](./SUBSCRIBE_KEY_TUTORIAL.md), and [Redux DevTools](./DEVTOOLS_TUTORIAL.md)
