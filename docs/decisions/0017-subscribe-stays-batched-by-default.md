# 0017. `subscribe()` stays batched by default

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** no

## Context

`subscribe(store, cb)` calls `cb` in a microtask, so several writes in one
task give one call. `{sync: true}` calls it before the write returns. Users
of other libraries may expect a synchronous default, and the question was
whether 1.0 should have one.

## Decision

No change. The reference says at the top of the `subscribe` section that
the callback runs in a microtask, that `{sync: true}` runs it before the
write returns, and that the callback receives no arguments.

## Alternatives considered

### A synchronous default

A direct property write has no unit that groups two fields, so the microtask
is what gives `store.a = 1; store.b = 2` and `Object.assign` one call. A
synchronous default would hand every caller of `subscribe()` the cost that
only the adapters carry now (one call, and often one snapshot, per direct
write), and would turn the option of `persist`, `withHistory` and
`subscribeKey` around. Not taken, and final for 1.0.

## Consequences

- Nothing changes in the code. The reference states the timing first.
- Counted on a prototype: the batched default gives 1 call per turn in every
  case measured. A synchronous default gives 2 for two direct writes and for
  `Object.assign`, and 4 around an `await`.
- Open again only with a new reason; changing the default after 1.0 is a
  breaking change.
