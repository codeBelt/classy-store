# 0005. A write stores raw values, and there is one node per raw object

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Changes behaviour that 0.11 documents:** no

## Context

In 0.11 the `set` trap stores whatever it is given, a proxy included, and
`linkChild` finds an existing node by the proxy only. Two defects follow:

- A class instance that is already a store, placed in another store by its
  raw object, is not connected. `outer.inner === raw`, and a method call
  through it changes state without telling any subscriber of either store.
  A plain object in the same position is shared and notifies both.
- Raw objects fill up with proxies. After `to.row = from.row`, or after
  `store.list.reverse()`, the raw object behind the store holds the proxy,
  not the raw row.

Record 0002 needs a definition to store the raw value too.

## Decision

- The `set` trap stores the raw object behind a store proxy, and
  `linkChild` finds an existing node by the raw object as well as by the
  proxy.
- When a property becomes read-only through the store while it holds an
  object the store tracks (`Object.freeze(container)`, or a definition
  without a value), the trap first puts that object's proxy in the raw slot.
  A read-only property has to hand out what the raw object holds, and this
  way that is the proxy. So every child the store tracked before such a
  freeze stays a child, however it got there.
- Two cases stay raw, and are documented: an object frozen before it reached
  the store, and a read-only property defined with an object as its value
  (both engines refuse a swap there). Such an object is handed out as it is;
  a write through it is not seen, and the snapshot holds it unfrozen. That is
  the behaviour of 0.11.

This lands in the commit after record 0002: record 0002 stores a defined
value as it is given, and this commit changes both traps to store the raw
value and adds the swap.

## Alternatives considered

### Raw values on write without the swap

Then a child reads back raw after its container is frozen through the
store, and a write through it tells no one, where in 0.11 a child that was
assigned as a proxy stays reactive.

### Replace the proxies in a list built from proxies

`this.items = this.items.filter(…)` still holds proxies in its raw array.
Replacing them would change an array the caller may still hold, so it is not
done.

## Consequences

- `outer.inner === inner` changes its answer for an instance placed by its
  raw object.
- A child that was assigned as a plain object, or was present at creation,
  stays reactive after its container is frozen through the store, where in
  0.11 it read back raw.
- Size: +104 bytes on the main entry in all (36 for raw values on write, 68
  for the swap, measured on top of it). 3 unit tests changed, all fixes.
- One run showed store creation about 20% slower on Node. A second run,
  between two runs of 0.11, did not: creating a small store and a store of
  rows were both inside the drift of the machine on both engines.
