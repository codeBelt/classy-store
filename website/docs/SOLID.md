# Solid 2 integration

The `/solid` adapter targets **Solid 2.0.0-rc.18 only**. Solid 2 is a release
candidate, so pin this exact version. Solid 1 is no longer supported by this
adapter. The import and return shape stay the same:

```typescript
import {useClassyStore} from '@codebelt/classy-store/solid';

// Inside a component or live createRoot():
const state = useClassyStore(store); // () => Snapshot<typeof store>
```

Install the runtime packages for a browser application:

```sh
npm install @codebelt/classy-store solid-js@2.0.0-rc.18 @solidjs/web@2.0.0-rc.18
```

The repository example uses `@solidjs/vite-plugin@3.0.0-next.51`,
`@solidjs/compiler@2.0.0-rc.18`, and Vite `8.3.5`. The Vite plugin requires
Node.js 22.12 or later. Use `@solidjs/web` for DOM imports and
`jsxImportSource: "@solidjs/web"` in TypeScript configuration. Replace the
Solid 1 `vite-plugin-solid` package with `@solidjs/vite-plugin`.

## Inputs, computed values, and lists

Read immutable snapshots through the returned accessor in JSX or `createMemo`.
Write to the original store through actions in event handlers. The adapter
publishes whole snapshots; it does not expose React's selector or auto-tracking
options.

```tsx
import {createClassyStore} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/solid';
import {For} from '@solidjs/web';
import {createMemo, flush} from 'solid-js';

class FormStore {
  text = 'Hello';
  items = [{id: 1, label: 'First'}];

  get length() {
    return this.text.length;
  }
  setText(text: string) {
    this.text = text;
  }
  replaceItems() {
    this.items = [{id: 1, label: 'Updated'}, {id: 2, label: 'Second'}];
  }
}

// Shared state for this client-rendered example.
const formStore = createClassyStore(new FormStore());

export function Form() {
  const state = useClassyStore(formStore);
  const uppercase = createMemo(() => state().text.toUpperCase());

  function handleReset() {
    formStore.setText('Hello');
    flush();
    // Reactive reads and DOM bindings now reflect the mutation.
    console.log(uppercase());
  }

  return (
    <section>
      <label>
        Text
        <input
          value={state().text}
          onInput={(event) => formStore.setText(event.currentTarget.value)}
        />
      </label>
      <p>{uppercase()} ({state().length} characters)</p>
      <button type="button" onClick={handleReset}>Reset</button>
      <button type="button" onClick={() => formStore.replaceItems()}>
        Replace items
      </button>
      <ul>
        <For each={state().items} keyed={(item) => item.id}>
          {(item) => <li>{item().label}</li>}
        </For>
      </ul>
    </section>
  );
}
```

Solid 2's custom-key `For` callback receives an item **accessor**. A stable key
preserves the row's DOM when an immutable snapshot replaces the item object;
read `item().label` in JSX so its content updates too.

## Timing

The adapter forwards each store mutation to its internal Solid signal
synchronously. Solid 2 then schedules its normal reactive updates, coalescing
consecutive writes. The adapter never calls `flush()` itself.

Use Solid's `flush()` after an action when imperative code needs updated
computed values or DOM immediately. Ordinary event handlers can let Solid apply
the updates normally. Avoid capturing snapshot fields at component setup time;
read them in JSX or a memo to retain reactivity.

Ordinary `subscribe(store, callback)` listeners remain microtask-batched.
Calling Solid's `flush()` does not flush these core listeners. Read
`snapshot(store)` when imperative code needs the current core state independently
of Solid's scheduler.

## Ownership and cleanup

Call `useClassyStore()` during component setup or inside a live `createRoot()`.
Calls without an owner, or with an already-disposed owner, throw before a
subscription is created. Unmounting the component or disposing its owner removes
the subscription. Nested roots follow Solid 2's parent-owned lifetime; independent
roots clean up independently.

For manual ownership, retain and call the root's disposer:

```typescript
import {createRoot, flush} from 'solid-js';
import {useClassyStore} from '@codebelt/classy-store/solid';

const session = createRoot((dispose) => ({
  state: useClassyStore(formStore),
  dispose,
}));

formStore.setText('Updated');
flush();
console.log(session.state().text);
session.dispose();
```

This integration pass covers client rendering, real inputs, computed values,
keyed lists, and owner cleanup. It does not establish Solid 2 streaming,
hydration, router, or async-transition compatibility.
