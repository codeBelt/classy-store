# 0011. Nested class instances stay opt-in, and a base class `ClassyStore` makes arrow-function methods work

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** no

## Context

An arrow-function field has `this` bound to the raw instance:

```ts
class Counter {
  count = 0;
  increment = () => {
    this.count++; // writes the raw instance; no subscriber hears it
  };
}
const store = createClassyStore(new Counter());
```

This is the most prominent silent failure of 0.11, and the docs can only
warn about it. The same holds for a method bound in the constructor and for
a timer the constructor starts.

Separately, a class instance nested in a store is opaque unless its class
sets `static [PROXYABLE] = true`. The question was whether to proxy nested
instances by default.

## Decision

- **Nested class instances stay opaque unless the class says otherwise.**
  `static [PROXYABLE] = true` stays, and `static [PROXYABLE] = false` is
  documented as "opaque on purpose"; it already works.
- **A base class, `ClassyStore`, is exported from the main entry.** Its
  constructor returns the store, so a class that extends it is a store from
  its first line: arrow-function fields, methods bound in the constructor
  and whatever the constructor starts all write through the store. Such a
  class is reactive wherever it is placed, with no marker.
  `createClassyStore(new X())` stays, for a plain object and for a class that
  cannot extend the base class.
- **The base class has no rule of its own for functions.** An arrow-function
  field is a function in a field, so record 0001 makes it a method when it is
  read through the store, and so is a subclass's field that overrides the
  parent's.
- **A `#private` field is never state.** With the base class it can be used
  on the live store; a snapshot cannot carry it. The docs say so.
- The base class lands after records 0001, 0002 and 0030, which it needs.
  The compilations listed under Consequences are run again on the real code.

## Alternatives considered

### Wrap nested class instances by default

Run and not taken. Eight tests change, six of them the documented rule. A
class with `#private` fields throws. An object that changes itself leaves a
stale copy that no check can see. A graph of 5,461 objects placed in a store
costs 20 milliseconds. What stays opaque by default is what the user does
not own, and for those objects opaque is right.

### Detect an arrow function by its source text

It finds 6 of 7 lost writes, reports 2 fields that lose nothing, and costs
256 to 342 bytes.

### An `opaque()` helper, and a mixin form of the base class

Not taken.

### Make the base class an exception to the rule for functions

An earlier form did, and the exception held only here. Record 0001 now
covers the base class with no rule of its own.

## Consequences

- A class has to extend `ClassyStore` for its arrow-function fields to work.
  The docs gain these sentences:
  - A callback held in a field is compared on a snapshot, where it is the
    function that was stored.
  - An arrow method is called on the store. Taken from a snapshot it still
    writes the store, one write at a time and not as one transaction.
  - Under React's `StrictMode`, `useLocalStore` makes two stores in
    development, so a constructor that starts a timer starts two.
  - A class that has to extend another class uses `createClassyStore(new
    X())` and prototype methods.
- Size: 4 lines and +13 bytes on the main entry.
- One subclass was compiled 17 ways (TypeScript with class fields as
  definitions and as assignments, Bun, Oxc, esbuild, the SWC of Next.js with
  the example's configuration, Babel in spec and loose mode). In every output
  the first snapshot is right, an arrow method notifies once, and a field
  write and a timer's write are seen. Those runs used an earlier rule for
  functions; the current rule changes nothing when an object is created, and
  the override case was run again both ways with Bun's transpiler. Seven
  throwaway tests passed for Vue, Svelte, Solid, Angular, `createStoreHook`
  and `useLocalStore`. A base-class store made inside a getter works on both
  layers.
- After 1.0, a warning for an unmarked class placed in a store may follow,
  once it can be silenced for a class that is opaque on purpose (record
  0036).
