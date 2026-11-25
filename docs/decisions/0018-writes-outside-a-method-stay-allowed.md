# 0018. Writes outside a method stay allowed, without a warning

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** no

## Context

A direct write is allowed anywhere, and each one notifies synchronous
subscribers. A method is a transaction only up to its first `await`. Neither
case is reported to the developer. Libraries such as MobX can enforce that
state changes only inside actions, and the question was whether 1.0 should
restrict or report writes outside a method.

## Decision

No change. Direct writes stay allowed, and `batch()` stays in the API. A
development warning when a synchronous subscriber is called many times in
one task may follow in a 1.x release (record 0036).

## Alternatives considered

### A warning for a write outside a method

It would fire for ordinary code that writes directly, and a warning for a
write after an `await` would fire for the ordinary `async` method. A warning
that fires for correct code and cannot be silenced is worse than none.
Because a warning changes no behaviour, one can arrive in any release.

## Consequences

- Nothing changes in the code or the docs.
- Open again when a warning is designed that can be silenced and does not
  fire for correct code.
