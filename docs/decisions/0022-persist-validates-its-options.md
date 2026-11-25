# 0022. `persist()` validates its options when it is called

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0
- **Changes documented behaviour:** no

## Context

Before 1.0, `persist()` accepts any options and does the wrong thing later:

- A getter named in `properties` is saved, and restoring it fails part-way.
  With `properties: ['count', 'doubled', 'tail']`, `save()` stores the
  getter's value; hydrating then sets `count`, throws on `doubled`, leaves
  `tail` unset and records a `'parse'` error. The types say getters are
  always excluded.
- A malformed entry in `properties` is ignored: `{key: 'other',
  deserialize}` with no `serialize` means `other` is never persisted.
- A bad `version` or an `async` `migrate` would only be found out record by
  record, where the cost is a user's stored data.

These are mistakes in the application's own code, at a boundary the library
owns.

## Decision

`persist()` throws a `TypeError` with the code `persist-option` (record
0035), before it reads or writes anything, for:

- a prototype key, a getter or a method named in `properties`;
- a transform that is half written;
- a `version` that is not a finite number of zero or more;
- a `migrate` that is a native `async` function.

A native `async` function is told by its `Symbol.toStringTag`, named
exactly.

## Alternatives considered

### A looser test for an `async` function

It refused the mock functions of the test runner.

## Consequences

- A mistake in the options fails at the call, with a code.
- Size: 82 bytes for the checks of `properties` and transforms, 56 for the
  checks of `version` and `migrate`. 5 unit tests changed: 4 fixes and 1
  incidental.
