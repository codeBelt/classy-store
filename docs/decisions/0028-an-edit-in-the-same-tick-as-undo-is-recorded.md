# 0028. An edit made in the same tick as `undo()` is recorded

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Changes behaviour that 0.11 documents:** yes

## Context

In 0.11 `withHistory` keeps a `restoring` counter while it applies an undo or
a redo, and skips what is written while it is set:

```ts
history.undo();
store.value = 9; // no flush in between
```

Here `canRedo` stays `true`, and `redo()` discards the 9. With a flush
between the two lines, the edit is recorded. The version check already
skips the restore's own notification, so the counter is redundant as well as
wrong. The history guide describes the behaviour of 0.11.

## Decision

`withHistory` drops its `restoring` counter and runs undo and redo as one
transaction each. An edit made in the same tick as `undo()` or `redo()` is
then recorded like any other.

## Alternatives considered

None was proposed.

## Consequences

- The history guide sentence that describes the old behaviour goes.
- `./utils` gets 24 bytes smaller. 1 unit test changed, a fix.
