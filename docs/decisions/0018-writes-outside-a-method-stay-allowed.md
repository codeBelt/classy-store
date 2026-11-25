# 0018. Writes outside a method stay allowed, without a warning

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Label:** No change
- **Changes documented behaviour:** no

## Context

A direct write is allowed anywhere, and each one notifies synchronous
subscribers. A method is a transaction only up to its first `await`. Neither
case is reported to the developer. Libraries such as MobX can enforce that
state changes only inside actions, and the question was whether 1.0 should
restrict or report writes outside a method.

## Decision

No change. Direct writes stay allowed, and `batch()` stays in the API. A
development warning when a synchronous subscriber is called many times in
one task follows in a 1.x release (record 0036).

Why: a direct write is a documented way to change a store, and the ordinary
one in an event handler: `store.count++`. A warning for it would fire for
correct code and could not be silenced, which record 0036 rules out for
every warning. What a direct write costs is one notification per write on
the synchronous channel, and `batch()` is the answer to that cost, so it
stays.

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
