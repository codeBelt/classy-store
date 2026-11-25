# 0012. A table per prototype answers "is this key a getter?"

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** performance
- **Label:** Can follow 1.0
- **Changes documented behaviour:** no

## Context

Before 1.0, the `get` and `set` traps walk the prototype chain with
`Object.getOwnPropertyDescriptor` on every access, to learn whether a key is
a getter. A read is the hottest operation the library has, and this walk is
most of its cost.

## Decision

- An own key is decided with `hasOwnProperty` and one flag per node.
- An inherited key is decided from a table per prototype, filled on the
  first miss, that says for each key which prototype object carries an
  accessor for it, or that none does.
- The table holds no function. A read whose cached result is still valid
  returns it; only a recompute asks that prototype for its getter, so the
  function that runs is the one the class has now.
- **The table cannot grow without bound.** A key the prototype chain has is
  always recorded. A key that is absent everywhere is recorded only while the
  table holds fewer than 256 keys; after that such a key is looked up at each
  read, as before 1.0.

This lands before records 0001 and 0002, because the trap then already knows
"own or inherited", which record 0001 asks.

The table assumes that a prototype is not changed after its first read
through a store. That is unspecified, with these answers for now:

- A getter added to a prototype for a key that was read as absent is seen,
  and it is not memoized: its body runs at every read, where before 1.0 it
  runs once.
- An override nearer the instance is not seen.
- A getter removed or replaced by a value is seen at its next recompute,
  where before 1.0 it is seen at once.

## Alternatives considered

### Cache the whole descriptor, getter included

46 bytes smaller and wrong: a getter redefined on the class kept its old body
on the live store while snapshots ran the new one, a getter replaced by a
value still ran, and a deleted getter still answered.

### Record every absent key, with no bound

The table of `Object.prototype` is shared by every plain object of every
store. A dictionary read by keys it does not have yet grew the heap by 88 MB
for a million keys, with no key left in the store. With the bound the same
run grows the heap by 0.2 MB, as the code before this change does.

### Never record an absent key

A read of a key that a class instance does not have is then slower than
before this change on Node: 107 to 116 nanoseconds against 97 to 100.

### No table for `Object.prototype` and `Array.prototype`

The tables of class prototypes still grow, and `Object.prototype` carries an
accessor, `__proto__`, which needs an exception that is easy to miss.

### A table that names the prototype and reads the getter at every read

23 bytes smaller than the form taken, and a cached getter read is then 19%
slower on Node than before this change.

## Consequences

- Timings against the code before this change (Bun / Node): a field read from 31.9 to 11.5
  nanoseconds and from 47.5 to 38; a read three objects deep from 108 to 48
  and from 143 to 116; a cached getter read from 58 to 35 and from 85 to 77.
  Timed in three rounds of five processes per engine. All 1,341 unit tests
  pass, and typecheck and lint pass.
- Size: +180 bytes on the main entry (165 for the table, 15 for the bound).
- Not measured: a read of an absent key once the table holds 256 keys. From
  the form that never records one, that is about the cost before this change
  on Node for a plain object
  and up to 10% above it for a class instance.
- Not built: this table on top of the getter changes of record 0010.
- Open again if changing a prototype after its first read has to be
  supported.
