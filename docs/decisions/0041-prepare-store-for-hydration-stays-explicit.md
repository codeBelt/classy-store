# 0041. React: `prepareStoreForHydration` stays an explicit call, and `isEqual` keeps its name

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Label:** No change
- **Changes documented behaviour:** no

## Context

For server rendering, a React store is passed to
`prepareStoreForHydration(store)`, which captures the snapshot the server
renders so that the client hydrates from the same data. One question was
whether to capture that snapshot automatically. Separately, the equality
option of the hooks is called `isEqual`, where Zustand and Jotai say
`equalityFn`.

## Decision

- The server snapshot is not captured automatically.
  `prepareStoreForHydration` stays an explicit call.
- The equality option keeps the name `isEqual`.
- The guides say that on the client `prepareStoreForHydration(store)` is
  called before `persist(store)`. The React SSR guide already says that it
  captures the snapshot "before persistence or other live updates begin";
  the change of record 0019 names `persist()` there, and the persist
  tutorial gains the same sentence. With record 0019,
  a store restored by
  `persist()` holds its saved state when `persist()` returns; prepared
  afterwards, it would capture that state and not the one the server
  rendered.

## Alternatives considered

### Capture the hydration snapshot automatically

Both automatic forms were built, and both break the pattern the guide
teaches: create the store, load the request's data, then render. The capture
fires on the first load write, so the server renders the empty store, and a
later explicit call cannot undo it. A store that refers to itself throws on
its first write or cannot be created. Memory grows by 19 megabytes per
100,000 rows. 12 and 20 tests failed, all regressions.

### Rename `isEqual`

React's own `useSyncExternalStoreWithSelector` calls the parameter
`isEqual`. Zustand and Jotai say `equalityFn`. A breaking rename for a split
precedent is not worth it. Not taken, and final for 1.0.

## Consequences

- Nothing changes in the code. The persist tutorial gains the sentence on
  the order of the two calls, and the React SSR guide names `persist()`.

- Open again for the capture only with a form that keeps the
  create-load-render pattern.
