# 0029. `withHistory` restores a function held in an own field, by reference

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** yes

## Context

In 0.11 `withHistory` treats a function held in an own field as behaviour,
not state. The history guide says that keys that resolve to a getter or a
function on the live store are skipped. So undo neither removes a callback
that was added nor puts back one that was replaced.

Under record 0001 a snapshot holds each function as it was written, so a
recorded entry has the value to put back, and history records the field.

## Decision

- Undo removes a function that was added to a field and puts back one that
  was replaced, by reference. Methods on the prototype are untouched.
- **A restore from outside never touches a function field.** A DevTools jump
  that the extension sends as JSON carries no functions. The shared restore
  (record 0030) neither deletes nor writes a function field for such a
  state, so a jump cannot remove the arrow methods or the callbacks of a
  store. Only a state the library recorded itself restores function fields.
- After the restore a read through the store hands out the same method as
  before, because there is one method per object and function.
- This lands after record 0001.

## Alternatives considered

### Restore function fields under an earlier rule for functions

When the store wrote its wrapper into the object, a restored callback came
back wrapped. Record 0001 does not change the object, so the write-back
holds the callback itself.

## Consequences

- The history guide sentence about skipped functions changes.
- The write-back was run on the rule of record 0001: a callback whose key was
  deleted is written back by assignment and by a definition, and the snapshot
  holds the callback itself both times.
- The change in `history.ts` itself was not built. The tests are written
  first: a callback that is replaced, a callback whose key was deleted, a
  function field that held another function at the time of the undo, and a
  jump by JSON on a store whose methods are own fields. If the change turns
  out larger than a few lines in `history.ts`, the work stops and this is
  decided again.
