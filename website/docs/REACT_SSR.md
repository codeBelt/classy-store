# React server rendering and hydration

Create one store for each server request and reconstruct a client store from the same initial data. Pass the store through props or React context. A module-level store on the server shares mutable state across requests and can expose one user's data to another.

Call `prepareStoreForHydration(store)` after initializing the store with the data used to render the page, on both the server and client. It captures that initial snapshot before persistence or other live updates begin. All direct and bound hooks use the captured data during server rendering and client hydration, then read the current live store. React requires the initial server and client data to match; see [React's external-store SSR guidance](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).

## Initialize from request data

Keep the serialized payload limited to the data the client needs. Reconstruct the class so its methods and getters remain available:

```ts
// profileStore.ts
import {createClassyStore} from '@codebelt/classy-store';
import {prepareStoreForHydration} from '@codebelt/classy-store/react';

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
  return prepareStoreForHydration(
    createClassyStore(new ProfileStore(initialData)),
  );
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

For a store owned by a component, `prepareStoreForHydration(useLocalStore(() => new ProfileStore(initialData)))` captures its initial state while keeping its identity stable across renders. Preparation is idempotent. Keep the factory pure: React Strict Mode can evaluate it more than once in development. Changes to `initialData` after mounting do not automatically reset the store or its captured snapshot.

## Restore persistence while other boundaries hydrate

Browser storage may contain values different from the server-rendered payload. Prepare the store before starting persistence, attach persistence in an effect, and unsubscribe when the component unmounts. The effect can restore storage even while a Suspense boundary is still waiting to hydrate:

```tsx
// PersistedProfile.tsx
import {useEffect} from 'react';
import {prepareStoreForHydration, useLocalStore} from '@codebelt/classy-store/react';
import {persist} from '@codebelt/classy-store/utils';
import {Profile} from './Profile';
import {type ProfileData, ProfileStore} from './profileStore';

export function PersistedProfile({initialData}: {initialData: ProfileData}) {
  const store = prepareStoreForHydration(
    useLocalStore(() => new ProfileStore(initialData)),
  );

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

For example, the server renders `Server:1`, persistence restores `Saved:8`, and a delayed boundary then hydrates. The boundary first reads `Server:1` from the captured snapshot, reuses the server DOM, and then updates to `Saved:8` from the live store. It does not need an earlier hook read to establish the initial data. This applies to completed server HTML with selective hydration and to streamed Suspense content.

## Snapshot lifetime and scope

- Capture after loading the initial request data, before rendering or starting persistence. Preparation cannot recover earlier data if the store has already changed.
- Repeated calls return the same mutable proxy and retain the first snapshot. The capture is kept for the store's lifetime because another boundary or root may hydrate later. Use a fresh store for a different request or initial payload.
- Prepare the exact proxy passed to `useClassyStore` or `createStoreHook`. If a hook subscribes directly to a nested proxy, prepare that proxy separately.
- Capture follows ordinary `snapshot()` semantics. Plain objects, arrays, and supported class state are immutable snapshots; opaque leaves such as native `Date`, `Map`, and `Set` retain their identity. Replace those fields instead of mutating their native objects in place.
- Selectors read captured data during hydration and live data afterward. Their caches are separate, while equal selected results preserve reference identity at the handoff.

Client-only apps need no preparation. `createRoot` reads current state even for a prepared store. Unprepared stores retain the existing behavior of reading current state for server rendering and hydration, so keep them unchanged until every consumer hydrates if you do not use preparation. Neither preparation nor hydration resets the live store; `snapshot(store)` continues to return current data.

React subscriptions notify synchronously by default, including after hydration. Ordinary `subscribe(store, listener)` callbacks remain batched. The React hooks do not have a `sync` option. A normal sequence of mutations in an event can be batched into one React commit, but selectors may run after each mutation; this is not a transaction API.
