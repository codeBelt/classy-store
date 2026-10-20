# React server rendering and hydration

Create one store for each server request and reconstruct a client store from the same initial data. Pass the store through props or React context. A module-level store on the server shares mutable state across requests and can expose one user's data to another.

`useClassyStore` and hooks from `createStoreHook` use the store's current snapshot for both server rendering and the first client render. They do not keep a separate copy of the original server state. Keep the initial client store unchanged until its consumers have hydrated. React requires the initial server and client data to match; see [React's external-store SSR guidance](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).

## Initialize from request data

Keep the serialized payload limited to the data the client needs. Reconstruct the class so its methods and getters remain available:

```ts
// profileStore.ts
import {createClassyStore} from '@codebelt/classy-store';

export type ProfileData = {
  name: string;
  visits: number;
};

export class ProfileStore {
  name: string;
  visits: number;

  constructor(initialData: ProfileData) {
    this.name = initialData.name;
    this.visits = initialData.visits;
  }

  recordVisit() {
    this.visits++;
  }
}

export function createProfileStore(initialData: ProfileData) {
  return createClassyStore(new ProfileStore(initialData));
}
```

```tsx
// Profile.tsx
import {useClassyStore} from '@codebelt/classy-store/react';
import type {ProfileStore} from './profileStore';

export function Profile({store}: {store: ProfileStore}) {
  const state = useClassyStore(store);
  return (
    <button type="button" onClick={() => store.recordVisit()}>
      {state.name}: {state.visits}
    </button>
  );
}
```

For each request, render `<Profile store={createProfileStore(initialData)} />`. Transfer `initialData` using the framework's serialization facility and initialize the browser store from that same payload before hydration. If implementing the HTML transport yourself, use safe JSON serialization for the embedding context; do not interpolate raw JSON into an executable script. Class instances, functions, and native collection types need an explicit data representation.

For a store owned by a component, `useLocalStore(() => new ProfileStore(initialData))` keeps its identity stable across that component's renders. Keep the initializer pure: React Strict Mode can evaluate it more than once in development. Changes to `initialData` after mounting do not automatically reset this store.

## Restore browser persistence after hydration

Browser storage may contain values different from the server-rendered payload. Attach persistence in an effect, defer the storage read with `skipHydration`, and unsubscribe when the component unmounts:

```tsx
// PersistedProfile.tsx
import {useEffect} from 'react';
import {useLocalStore} from '@codebelt/classy-store/react';
import {persist} from '@codebelt/classy-store/utils';
import {Profile} from './Profile';
import {type ProfileData, ProfileStore} from './profileStore';

export function PersistedProfile({initialData}: {initialData: ProfileData}) {
  const store = useLocalStore(() => new ProfileStore(initialData));

  useEffect(() => {
    const persistence = persist(store, {
      name: 'profile',
      storage: localStorage,
      skipHydration: true,
    });
    void persistence.rehydrate();
    return () => persistence.unsubscribe();
  }, [store]);

  return <Profile store={store} />;
}
```

This pattern covers a store whose consumers hydrate together. With streaming or selectively hydrated Suspense boundaries, an ancestor's effect may run before every consumer hydrates. Keep shared stores at their initial state until all relevant boundaries have hydrated, or scope independently restored stores to those boundaries. Updating a shared store earlier can cause a hydration mismatch because the hook reads its live value during hydration.

React subscriptions notify synchronously by default, including after hydration. Ordinary `subscribe(store, listener)` callbacks remain batched. The React hooks do not have a `sync` option. A normal sequence of mutations in an event can be batched into one React commit, but selectors may run after each mutation; this is not a transaction API.
