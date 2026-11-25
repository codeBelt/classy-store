# 0019. `persist()` restores before it returns when the storage is synchronous

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** no

## Context

In 0.11 `persist()` reads the storage after it returns, even when the
storage is synchronous. A store on `localStorage` renders its defaults first,
and the saved state a microtask later.

## Decision

- `persist()` restores before it returns when the storage is synchronous. It
  awaits only a storage that returns a promise.
- There is no option for it. `skipHydration` keeps its meaning: with it,
  nothing is read, and so nothing is saved, until `rehydrate()` is called
  (record 0021).
- The handle exists before the first read starts, so a report made during
  that read can hand the handle to `onError` (record 0021).
- `hydrated` settles even when the store cannot be snapshotted at the start
  of a read, and `rehydrate()` keeps the `finally` that guarantees it.

The persist guide has to say two things:

- **Call `persist()` after the store is constructed, never inside a
  constructor.** With the base class of record 0011 a constructor is a
  natural place for it, and it is the wrong one: the field initialisers of a
  subclass run after the restore and overwrite it, and under record 0002
  they count as edits, so the next save writes them over the stored record.
  A test pins what happens, so that the sentence stays true. The test needs
  the base class, so it is written with record 0011.
- **On the client, `prepareStoreForHydration(store)` is called before
  `persist(store)`** (record 0041).

## Alternatives considered

None was named. There is no option that keeps the timing of 0.11.

## Consequences

- A store on a synchronous storage holds its saved state when `persist()`
  returns, so its first render shows that state.
- 15 lines added and 18 removed; `./utils` gets 6 bytes smaller. 1 unit test
  changed, incidental: it relied on the old timing.
- Nothing can detect a `persist()` call made inside a constructor; the guide
  forbids it.
