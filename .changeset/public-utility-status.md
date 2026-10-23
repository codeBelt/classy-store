---
'@codebelt/classy-store': minor
---

**Upgrade required from 0.7.x.** Add observable utility status and simplify the public API. See the [0.8.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_8) for migration examples.

- History and persistence handles expose `getSnapshot()`, `getServerSnapshot()`, and `subscribe(listener)`. Use the new `useHistoryStatus(history)` React hook for undo/redo availability and recording state, and `usePersistStatus(handle)` for hydration, expiry, and persistence errors. Both expose disposal status and update even when store data does not change. Each hook accepts its matching handle type and shares an internal subscription implementation.
- Explicit `save()`, `clear()`, and `rehydrate()` calls reject on failure after reporting through `onError` and status. These methods take no options; catch rejected promises in event handlers and effects. Automatic writes and initial hydration handle reported failures internally. Failed calls do not block later queued writes. Calls on disposed handles and explicit queued operations cancelled by disposal reject.
- Persistence cleanup is now `dispose()`. The `unsubscribe()` method has been removed; update effect cleanups and other teardown calls to `handle.dispose()`. Repeated disposal is safe and still stops listeners and timers, ignores pending reads, and skips queued writes that have not started.
- Remove the public `getVersion` export. Use `subscribe()` for notifications or compare `snapshot()` references for change detection. The version helper remains internal for persistence and core bookkeeping.
- Keep the shared `UtilityStatusSource` type internal. Use the exported `HistoryHandle`, `PersistHandle`, `HistoryStatus`, and `PersistStatus` types in consumers. Also export `PersistOperation` from the utilities entry.
- Import `prepareStoreForHydration` from `@codebelt/classy-store/react/server` on both server and client. The duplicate export from `@codebelt/classy-store/react` has been removed.
- Persistence transforms infer their value type from `key`. Serializers receive that property's readonly snapshot; deserializers must return the matching mutable property type. Existing transforms that return another property's type or mutate snapshot inputs now fail TypeScript checks. Persistence flags are readonly in the public types, matching their existing runtime getters.
- Preserve explicit history pause state when undo/redo finishes. Update React and Next.js examples to subscribe to utility status directly.

`hydrated` and `isHydrated` indicate that a hydration attempt has settled, including failure or an obsolete read. Inspect `lastError`; await explicit operations and handle their errors when success matters. Utility status uses its initial snapshot during SSR/hydration; construct server and client handles with matching initial status.

Reorganize React hooks and internal types by ownership, split computed tests by layer, and name regression suites by behavior. This structural cleanup preserves runtime behavior and package entry points.
