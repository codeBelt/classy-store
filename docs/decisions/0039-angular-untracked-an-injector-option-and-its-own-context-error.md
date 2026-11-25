# 0039. Angular: a store write inside a `computed` is not lost, and `injectClassyStore` takes an injector

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, public API
- **Changes behaviour that 0.11 documents:** no

## Context

- In 0.11 a store write made while an Angular `computed` runs makes Angular
  throw inside the adapter's listener. The core logs the error, and the
  signal stays stale until the next write.
- `injectClassyStore` works only inside an injection context.
- Angular's own assertion for a missing injection context names the function
  only in Angular's development mode; in a production build it is a bare
  `NG0203`.

## Decision

- The adapter updates its signal inside `untracked()`.
- `injectClassyStore(store, {injector})` works outside an injection context.
  The option is added while the signature is written down for 1.0.
- The adapter checks for an injection context itself and throws its own
  error, with the library's prefix and a code, in every Angular build.

## Alternatives considered

### Call Angular's own assertion

Its message is a bare `NG0203` in a production build.

## Consequences

- The signal is current after a write made inside a `computed`.
- 19 bytes for the fix, 51 more for the option and the message, on
  `./angular`. The library's own context check was not built in a prototype;
  its ceiling has 30 bytes for it (record 0004).
- The fix can follow 1.0; the option is an addition.
