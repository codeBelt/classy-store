# 0043. A snapshot carries class getters on one derived prototype per class

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API, performance
- **Changes behaviour that 0.11 documents:** yes

## Context

In 0.11 every snapshot of a class instance gets each class getter as an
enumerable own accessor. So:

- `Object.keys(store)` and `Object.keys(snapshot(store))` differ.
- A spread or a `JSON.stringify` of a snapshot runs every getter, and throws
  if one does. A DevTools entry is serialised the same way, so one class
  getter that throws spoils the entry.
- A snapshot of a class with eight getters is slow to make and large.
- Inside a snapshot getter, `this` is a tracking proxy over an empty object:
  it has no own keys, is not an instance of the class, and `return this`
  hands that proxy out. A getter that reads `Object.keys(this)` answers 0 on
  a snapshot and 2 on the store.
- A class setter gets an own key on a snapshot.
- A snapshot lists every data field before any own getter, whatever their
  order on the store.

No compared library lists a class getter among the own enumerable keys of a
copy.

## Decision

- A class getter is no longer an own accessor of every snapshot. For each
  class that has getters, one object that inherits from the class prototype
  is made once, with one memoizing accessor per getter, and snapshots of that
  class are created from it.
- Inside a snapshot getter, `this` is the frozen snapshot behind a tracker,
  so it has the store's keys, and the class as its constructor and for
  `instanceof`. Its prototype is the derived object, not `Class.prototype`.
- A getter on an object literal stays an own accessor of the snapshot,
  listed where the store lists it.
- `devtools` adds the values of the root store's class getters to what it
  sends, each read guarded, so a class getter of the root that throws shows
  its error text and the entry is still sent. Nested objects are sent as
  they are. A getter of an object literal is run by the extension's
  serialiser, and one that throws still loses the entry, at the root or below
  it.
- On the React tracking path a tracked read and a plain read have to share
  one cached result. That is where the risk of this change is.

## Alternatives considered

### Own accessors that are not enumerable

One line, the same visible change for `Object.keys` and JSON, none of the
gain in time and memory, and `this` then needs a filter to match the store.

### Keep the shape of 0.11

No compared library does it, and it keeps every defect above.

## Consequences

- A spread or a serialised snapshot no longer carries computed values; they
  have to be named. Nothing reports it: `{...snap}.total` still type-checks
  and is `undefined`, as it is for any class instance in TypeScript. Every
  compared library behaves this way, and the cost is taken on purpose. The
  tutorial paragraph changes, and the changelog names it (record 0034).
- `Object.getPrototypeOf(snapshot)` is no longer `Class.prototype` for a
  class with a getter. `instanceof` and `constructor` are unchanged. The
  reference's "keep the class prototype" becomes "are instances of the
  class".
- A snapshot of a reactive collection no longer lists `size` in
  `Object.keys` or JSON. `snap.size` reads as before.
- The DevTools panel no longer shows the getter values of a nested store or
  a nested class instance. Showing them needs a walk and a copy of every
  object on the way for every entry; it can be added in a 1.x release.
- A snapshot of a class with eight getters is four times faster to make and
  holds sixteen times less memory.
- `persist` saves the same fields as before. The base class of record 0011
  gets a correct snapshot on top of this change.
- Size: +239 bytes on the main entry and 14 unit tests changed (fixes, and
  eight tests of the old shape changed by this decision); 95 bytes on
  `./utils` for the `devtools` values. The 239 bytes and the 14 tests were
  measured on the snapshot layer of 0.11. Record 0010 changes that layer first, so
  they are a forecast, and the commit takes its own figures from its own
  build.
- A jump that carries the added keys back restores the fields and adds no
  key. Not run: the real Redux DevTools extension.
