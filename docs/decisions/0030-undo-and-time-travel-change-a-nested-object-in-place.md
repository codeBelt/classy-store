# 0030. Undo and time travel change a nested object in place

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, performance
- **Label:** Before 1.0: the reference says "changed fields are replaced
  with mutable copies"
- **Changes documented behaviour:** yes

## Context

Before 1.0, a restore by `withHistory` replaces a changed branch with a mutable
copy; the reference says "changed fields are replaced with mutable copies".
After undoing an edit to one row, every row of the list is a new object,
every row component renders again, and a row the caller held is detached.

It is worse for a store that holds other stores, which record 0011 makes
ordinary. After one undo every row is a frozen snapshot: a prototype method
on it throws, and an arrow method writes the old store. An undo also puts a
copy in place of an object two stores share, which ends the sharing without
a word. A DevTools jump uses a restore of its own (record 0027).

## Decision

- A restore goes down while both sides are containers of the same kind, and
  writes only what differs. Where a restored value is the snapshot of an
  object that is still live, the live object is put back.
- Undo, redo and a DevTools jump share that one function.
- The function enters each live object at most once per restore, and treats
  the recorded root as the store, so a store that refers to itself is
  restored like any other (record 0044).
- **A container that would refuse the restore is replaced, as before 1.0.**
  Before an object is restored in place, one check asks whether every write
  the restore would make there is allowed. A key to add to an object that is
  not extensible, a read-only key whose value differs, and a key that cannot
  be deleted each fail it. The check counts only the writes the restore will
  make: a function field that a state from outside does not carry is not a
  key to delete (record 0029), so a jump by JSON on a sealed store whose
  methods are own fields does not fail it. The object is then replaced at its
  parent by a copy.
- The root cannot be replaced. When the root fails the check, the restore
  throws a `TypeError` with the code `restore-locked` (record 0035) before
  it writes anything, and the history does not move. A DevTools jump on
  such a root writes nothing, and `devtools` logs the error (record 0027).
- **The restore follows the object, not the place it was recorded in.** An
  object that was in the store when the entry was recorded and is still live
  is put back and restored in place, wherever else it now sits. If it is also
  part of another store, that store sees the restore, and its subscribers are
  told once. The history guide says: a history records one store, an object
  two stores share is undone in both, and a move between two stores is
  undone by a history on a store that holds both.
- A DevTools jump that the extension sends as JSON restores data, not class
  instances. The guide says so.

## Alternatives considered

### Keep replacing every changed branch

The cost described above, and it is slower.

### Restore in place without entering each object once

With record 0044 in the same build, every restore that reached an object on
a cycle overflowed the stack, left the store half restored and moved the
history pointer all the same.

### Restore in place without the check for a container that refuses

Record 0005 keeps the children of a container that is frozen through the
store, and record 0002 keeps that freeze silent, so no history entry records
it. Without the check, an undo into such a container was refused part-way:
the store was half restored, its one notification carried the half state,
and the history had moved. Before 1.0 the same undo works, because it
replaces the branch.

## Consequences

- Undo of one row in 1,000 goes from 2,315 microseconds to 273 on Bun, and
  999 row snapshots are kept.
- A container that was locked after the entry comes back as a new copy
  without the lock, child objects included, so a reference to the old
  container no longer points into the store. That is the behaviour before
  1.0 for every restored branch.
- An undo in one store can take back an edit made through another store that
  shares the object.
- Size on `./utils`: 113 bytes for the restore in place, 16 for entering each
  object once, 211 for the check. The mark and the check changed no unit
  test of their own.
- Six stores with a cycle were undone, redone and jumped back: all return,
  each object is the one that was made, and each undo notifies once. An undo
  of 1,000 plain rows stayed inside the spread with the mark (264
  microseconds against 263); 1,000 rows that point back to their store take
  1.9 milliseconds, which is the cost of record 0044. Four cases of an object
  that moved to another store or is shared by two were run.
- With the check, seven kinds of locked container that threw part-way return
  with the recorded values and one notification. A frozen root throws with
  nothing written and the history unmoved, where the code before 1.0 throws
  with the history moved. The 1,000-row undo stays inside the spread, with medians 5 to 8%
  higher, on Bun.
- Not timed on Node. Not run: a DevTools jump on a frozen root. The check as
  built counted a function field as a key to delete; the rule above was not
  built, and a jump by JSON is tested first.
- Its tests are the six rows of a store with a cycle (undo, redo and a
  jump), the four rows of an object that moved or is shared, and ten rows of
  a container that would refuse the restore.
- This lands on top of record 0027, and takes over the line record 0044 adds
  to `history.ts`.
