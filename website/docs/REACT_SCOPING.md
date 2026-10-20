# React store scoping and lifecycle

Use React context to choose a store instance for a subtree, then `useClassyStore` to subscribe to that instance. This is useful for independent forms, editors, nested workspaces, and request-scoped server rendering.

The runnable [scoped editors demo](https://codebelt.github.io/classy-store/demos/#/scoped-stores) shows two independent editors and a nested editor. Its [source](https://github.com/codeBelt/classy-store/tree/main/examples/react/src/demos/scoped-store) is an application example built from existing APIs; there is no new context factory to install.

## Define a typed context

Share the context definition across the application. Create store instances inside each provider, so server requests and sibling providers cannot accidentally share mutable state.

```ts
// editorStore.ts
export type EditorData = {title: string; body: string};

export class EditorStore {
  title: string;
  body: string;

  constructor(initialData: EditorData) {
    this.title = initialData.title;
    this.body = initialData.body;
  }

  setTitle(title: string) { this.title = title; }
  setBody(body: string) { this.body = body; }
}
```

```ts
// editorStoreContext.ts
import {createContext} from 'react';
import type {EditorStore} from './editorStore';

export const EditorStoreContext = createContext<EditorStore | null>(null);
```

```ts
// hooks/useEditorStore.ts
import {useContext} from 'react';
import {EditorStoreContext} from '../editorStoreContext';

export function useEditorStore() {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within EditorStoreProvider');
  }
  return store;
}
```

The hook returns a typed mutable `EditorStore`, with its methods intact. It fails clearly when a provider is missing. React resolves the [closest matching provider](https://react.dev/reference/react/useContext), so a nested provider overrides the instance only for its own subtree.

## Let the provider own creation and effects

The example provider initializes once per mount and captures the initial hydration data before starting persistence:

```tsx
// components/editorStoreProvider/EditorStoreProvider.tsx
import {prepareStoreForHydration, useLocalStore} from '@codebelt/classy-store/react';
import {persist, type StorageAdapter} from '@codebelt/classy-store/utils';
import {type ReactNode, useEffect} from 'react';
import {type EditorData, EditorStore} from '../../editorStore';
import {EditorStoreContext} from '../../editorStoreContext';

type Props = {
  initialData: EditorData;
  children: ReactNode;
  persistence?: {name: string; storage: StorageAdapter};
};

export function EditorStoreProvider({initialData, children, persistence}: Props) {
  const store = prepareStoreForHydration(
    useLocalStore(() => new EditorStore(initialData)),
  );
  const name = persistence?.name;
  const storage = persistence?.storage;

  useEffect(() => {
    if (name === undefined || storage === undefined) return;
    const handle = persist(store, {
      name,
      storage,
      properties: ['title', 'body'],
      skipHydration: true,
    });
    void handle.rehydrate();
    return () => handle.unsubscribe();
  }, [store, name, storage]);

  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}
```

Keep constructors and initializers pure: Strict Mode can evaluate them more than once. Start subscriptions, timers, and storage work in effects with cleanup. The persistence effect depends on the storage adapter and name, so passing a new options object with those same values does not restart it. Keep a custom storage adapter's identity stable too.

The context holds the stable store proxy. Consumers read snapshots through the existing React hook and send edits through store methods:

```tsx
// components/editorTitle/EditorTitle.tsx
import {useClassyStore} from '@codebelt/classy-store/react';
import {useEditorStore} from '../../hooks/useEditorStore';

export function EditorTitle() {
  const store = useEditorStore();
  const title = useClassyStore(store, (state) => state.title);
  return <input value={title} onChange={(event) => store.setTitle(event.target.value)} />;
}
```

Auto-tracking also works: `const state = useClassyStore(useEditorStore())`. Reading fields directly from the mutable store during render does not subscribe to mutations. Avoid creating a module-level bound hook for one store if consumers must select different instances through context.

## Preserve drafts and reset intentionally

`initialData` is an initializer. New props or an ordinary parent render leave the existing store and draft intact. Use a [changed React key](https://react.dev/learn/preserving-and-resetting-state#resetting-state-with-a-key) to create a fresh session:

```tsx
<EditorStoreProvider
  key={`${documentId}:${revision}`}
  initialData={documentData}
>
  <EditorTitle />
</EditorStoreProvider>
```

Change `documentId` when moving to a different document; increment `revision` for an explicit reset. A key change remounts the provider's whole subtree, including nested providers. Resetting a nested provider leaves its parent and siblings intact.

| Event | Store and effect behavior |
| --- | --- |
| Parent render or changed `initialData`, same key | Preserve the existing store and edits |
| Provider key changes | Create a new store and clean up the old subtree |
| Nested provider | Consumers inside it use its independent store |
| Storage name or adapter changes | Keep the store; detach old persistence and load from the new configuration |
| Persistence removed | Keep current state and stop persistence |
| Provider unmounts | React releases its store reference and effect cleanup detaches persistence |

A reset does **not** clear saved data. If the new provider uses the same persistence key, it restores that saved draft. To reset saved data as well, first unmount or disable the old persistence owner, await `storage.removeItem(name)`, then remount. Use distinct storage keys for independent documents or users. Different React providers using the same storage key still share that storage namespace.

Cleanup prevents pending storage reads from applying after unsubscribe, including the discarded first effect in Strict Mode. Such reads still finish and their promises settle; the adapter's I/O is not cancelled. Already-issued writes cannot be undone by cleanup. External code retaining a store can still mutate it after unmount, but its disposed persistence owner and unmounted consumers no longer react. `useLocalStore` does not automatically call application-specific `dispose()` methods.

## Server rendering and hydration

Render a fresh provider for each server request. Transfer only its initial data through the framework's serialization facility, then initialize the client provider from that same data. The provider prepares the initial snapshot before any persistence effect, so a delayed Suspense boundary can hydrate correctly even after another part of the tree restores browser storage. See the [SSR guide](./REACT_SSR.md) for transport and streaming details.

Browser storage belongs in the client setup; do not access `localStorage` at module initialization on the server. Effects do not run during server rendering. The server and client's initial markup must match regardless of whether browser persistence is enabled.

## Regression coverage

`bun run test:react:compatibility` copies the actual example provider, context, hook, and class into isolated installed-package consumers on React 18.0, 18.3, and 19.3. Tests cover sibling and nested isolation, missing providers, stable initialization, keyed resets, Strict Mode, persistence replacement/removal, pending-read cleanup, request isolation, and delayed Suspense hydration with DOM reuse. Strict type checks verify mutable commands, readonly snapshots, selector inference, and provider props.
