# 0014. A subscriber's error is caught and logged, a rejection too, and the writer is never told

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API, bug
- **Changes behaviour that 0.11 documents:** no

## Context

In 0.11 a subscriber's synchronous error is caught and sent to
`console.error`, and the other subscribers run. Two gaps:

- A subscriber that returns a rejected promise is not reported. It becomes
  an unhandled rejection, which ends a Node or Bun process.
- The report itself is not guarded. In a test setup that fails on console
  output, `console.error` throws; that error reaches the writer and skips
  every later subscriber of the round.

## Decision

The rule becomes part of what 1.0 guarantees: a subscriber's error is
caught, the other subscribers run, and the code that wrote is not told. The
rejection of an `async` subscriber is caught and logged in the same way. The
report is guarded: if `console.error` throws, the round goes on and the
writer still is not told.

Where the report goes is unspecified.

## Alternatives considered

### Throw the first error to the writer

Preact and Legend-State 3 do this. Every adapter is a synchronous
subscriber, so the code that fails is usually not the code that wrote. An
unrelated `store.count = 1` would throw after the count has changed, a
method's own error would be hidden and its return value lost. On the
microtask path there is no writer at all. Not taken, and final for 1.0.

### `reportError()`

It ends a Bun process and only logs on Node.

### A reporter the application can replace

An addition. It can follow 1.0.

## Consequences

- The two ways a callback can fail land in one place. The rejection handler
  costs 25 bytes. 1 unit test changed, a fix.
- The guard on the report was not built in a prototype. Its test is written
  first.
- The bound on delivery rounds (record 0013) reports through the same path.
