# Upgrading to 0.8.0

Version 0.8.0 adds observable history and persistence status and simplifies the public API. This pre-1.0 release includes breaking changes for consumers of 0.7.x.

## Required updates

| Previous usage | Use in 0.8.0 |
| --- | --- |
| `persistence.unsubscribe()` | `persistence.dispose()` |
| Import `prepareStoreForHydration` from `/react` | Import it from `@codebelt/classy-store/react/server`, on both server and client |
| Import `getVersion` from the root entry | Use `subscribe()` for notifications or compare `snapshot()` references |
| Assume explicit persistence calls always resolve | Handle rejected promises from `save()`, `clear()`, and `rehydrate()` |
| Transform a property's value as a union of all store properties | Match `serialize` and `deserialize` to the property selected by `key` |

## Dispose persistence handles

Update effect cleanups and other teardown calls:

```ts
// Before
return () => persistence.unsubscribe();

// After
return () => persistence.dispose();
```

Disposal is idempotent. It stops subscriptions and timers, ignores pending read results, and cancels writes that have not started. Already-issued storage I/O cannot be cancelled. Explicit queued operations cancelled by disposal reject, as do explicit operations called after disposal.

## Handle explicit persistence failures

`save()`, `clear()`, and `rehydrate()` take no options. They report storage failures through `onError` and `lastError`, and reject their promises. Handle the promise even when an `onError` callback is configured:

```ts
try {
  await persistence.save();
  showSavedMessage();
} catch (error) {
  showSaveError(error);
}
```

Automatic writes and initial hydration handle reported failures internally. `hydrated` resolves once an attempt settles; `isHydrated` also means an attempt settled, including failure or a superseded read. Both stay settled during later reads; await `rehydrate()` for a specific new attempt. Check `persistence.getSnapshot().lastError` when the result matters. A failed operation does not prevent later queued writes from running.

## Subscribe to utility status in React

Use `useClassyStore(store)` for store data. Use the new hooks when rendering utility metadata that can change independently of that data:

```tsx
import {useHistoryStatus, usePersistStatus} from '@codebelt/classy-store/react';

const {canUndo, canRedo, isPaused} = useHistoryStatus(history);
const {isHydrated, isExpired, lastError} = usePersistStatus(persistence);
```

Call these hooks inside a component or custom hook, with stable handles. Both status snapshots include `isDisposed`. History pause state now stays consistent when undo/redo finishes.

Outside React, handles expose `getSnapshot()`, `getServerSnapshot()`, and `subscribe(listener)`. The function returned by `subscribe` removes that status listener; `dispose()` tears down the utility handle itself. The shared status source implementation is internal. Consumer types are `HistoryHandle`, `HistoryStatus`, `PersistHandle`, and `PersistStatus`, exported from `@codebelt/classy-store/utils`.

During SSR and hydration, status hooks use the handle's initial status snapshot. Construct server and client handles with matching initial status.

## Use the hydration entry on server and client

```ts
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';
```

The `/react` entry exports React hooks and `createStoreHook`. Hydration preparation is exported only from `/react/server`; its captured-snapshot behavior is unchanged.

## Match persistence transforms to their property

Transform serializers receive the selected property's readonly snapshot value. Deserializers receive `unknown` and must return that property's mutable value. Validate stored values before returning them. Transforms that mutate their snapshot input or return another property's type now fail TypeScript checks.

Persistence status flags are readonly, matching their runtime getters. `PersistOperation` is exported from the utilities entry for typed error handlers.

If upgrading from 0.6.x or earlier, also follow the [0.7.0 upgrade guide](./UPGRADING_0_7.md) for React timing options and the native `WeakRef` requirement.
