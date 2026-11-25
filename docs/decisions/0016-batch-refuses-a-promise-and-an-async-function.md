# 0016. `batch()` refuses a callback that returns a promise, by its type, and an `async` function when it runs

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Label:** Before 1.0
- **Changes documented behaviour:** yes

## Context

`batch(async () => …)` groups only the writes before the first `await` and
hands back the promise as if it had worked. The reference says that `batch`
"Returns whatever `run` returns".

A type can stop that where it is written, but it cannot see an `async`
function held under a `() => void` type, a JavaScript caller or an `any`.
Both refusals have to be decided before 1.0: accepting promises again later
would be a compatible change, and starting to refuse them would be a
breaking one.

## Decision

- The parameter of `batch()` becomes a function whose result is not a
  promise, with a type whose error message says why.
- At run time, `batch()` throws a `TypeError` with the code `batch-async`
  when it is given a native `async` function, before the function is called,
  in every build. Nothing is half applied and no promise is lost. It tells
  an `async` function by `Symbol.toStringTag` equal to `'AsyncFunction'`,
  the test record 0022 uses, because a looser test refuses the mock
  functions of the test runner. A test pins that a mock function is
  accepted.
- The type of the parameter is not exported in 1.0. Exporting it later is
  an addition.

- The reference states the rule for an `async` method: it is a transaction
  up to its first `await`.

## Alternatives considered

### The type alone

It costs no bytes, and it leaves the silent split for every caller it
cannot see.

### Drop a write that is undone inside a batch

A value set and set back inside a batch notifies once. One notification for
a batch that wrote is the simpler rule.

## Consequences

- `batch(() => { store.loading = true; return save(); })` no longer
  compiles, and is rewritten with `save()` outside. At run time it is
  accepted, because it is not an `async` function and it batches everything
  it should.
- A wrapper generic over the result of `batch()` needs a cast.
- An `async` function that a build step has turned into a generator is not
  seen by the check.
- The type is 7 lines and 0 bytes, and 3 type assertions in 2 test files
  change. The check is 10 lines and 50 to 83 bytes with its message as first
  written, less with a code (+50 on the main entry in record 0004). 2 unit
  tests changed, both fixes.
