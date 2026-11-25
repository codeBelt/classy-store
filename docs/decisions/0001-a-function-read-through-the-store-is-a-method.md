# 0001. A function in a field is a method when it is read through the store, and the object is never changed

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API, bug
- **Changes behaviour that 0.11 documents:** no

## Context

In 0.11 the `get` trap binds every function it reads to the proxy. That
gives defects of its own:

- A function in a list is a new wrapper on every read, so
  `store.callbacks.indexOf(store.callbacks[0])` is `-1`, and
  `store.callbacks.splice(store.callbacks.indexOf(first), 1)` removes the
  last callback.
- A class held as a value comes back as a bound wrapper:
  `store.Model.label` is `undefined`, and
  `new store.Model('x') instanceof store.Model` is `false`. The same holds
  for `constructor`.
- `store.f = store.f` writes a wrapper back.
- A getter that calls a function held in a field does not see a later
  replacement of that function.
- A read of a read-only function property throws.

A rule is needed for which functions a store hands out as methods (bound to
the proxy, run as one transaction) and which it hands out as data.

## Decision

A function is a **method**, bound to the proxy of the object that holds it
and run as one transaction, in two cases:

1. It is found on the prototype chain, under any key but `constructor`. Any
   kind of function.
2. It is the value of an own data property of an object that is not an
   array, **and it is read through the store**.

Case 2 does not apply, and the function is handed out as it is, when:

- it is a class or a built-in constructor, told by its own `prototype`
  property being read-only;
- it is a method that a read through any store handed out before;
- it is frozen, or it is a store;
- the property that holds it is read-only and not configurable.

So an arrow function, a shorthand method, an `async` function, a bound
function, a generator method and a `function` are all methods when read
through the store.

**The object is never changed.** The raw object and every snapshot hold each
function as it was written. There is one method per object and function, so
`store.f === store.f`, and the method takes the name of the key it was first
read under.

A method written back:

- A method that the same object handed out is stored as the function it
  wraps. `store.f = store.f` is no change; `store.b = store.a` stores `a`'s
  function.
- A method that another object handed out is stored as it is. It is data
  there, and stays bound to the object it came from.

A read of a function in a field counts as a read for a getter.

**Short path.** The full test asks for the property's descriptor. Once an
object has handed out the method for a function, a later read skips the
descriptor while the object is extensible, no definition through the store
has made one of its properties read-only, and the function is not frozen. A
function on the prototype chain never needs the descriptor.

The change lands only if the core benchmark's `store.method` stays inside
the spread of the commit before it on both engines, and two new benchmark
rows stay inside these bounds against that commit: a call of a method held
in a field at most 10% slower, a read and call of an arrow function held in
a field at most 1.6 times slower.

## Alternatives considered

### Strict: only a function on the prototype chain is a method

A method in an object literal is then not a transaction, throws when called
detached, and loses its transaction in silence. The base class of record
0011 would need an exception of its own.

### Born with: write the store's wrapper into the object

It keeps the identity of a callback assigned to a declared field. It was
built, and it fails five ways: a store made from a copy of the object or of
a snapshot ran the old store's methods; a callback on a snapshot ignored the
`this` its caller passed; a getter read on a snapshot could write the live
store through an object's own method; a callback restored by `withHistory`
came back wrapped; and a read-only definition threw after it was made.

### Every function with a `prototype` of its own is data

It fixes a constructor held as a value. It also takes the binding and the
transaction away from `inc: function () {…}` in an object literal: two
notifications for two writes, a `TypeError` when called detached in strict
code, and a write to `globalThis` in code that is not strict.

### Lenient: wrap every function on every read

Except an element of a list, a class and `constructor`. It keeps the copied
wrapper and the stale getter.

### The same rule without the short path

No read can throw, also after a change made on the raw object. It costs
every class method 2 to 3% on Node, a call of a method held in a field 10 to
15% against 0.11, and a read and call of an arrow function held in a field
1.6 to 1.8 times the time of 0.11. The one read it protects is unspecified
and throws in 0.11.

### Telling a bound function by its name

A user can fake the name.

## Consequences

- `store.onSave === cb` is `false`, as in 0.11. `snapshot(store).onSave ===
  cb` is `true`.
- A method read through the store ignores the `this` its caller passes, as
  in 0.11. An object of callbacks for another library is handed over from a
  snapshot.
- A method is called on the store, not on a snapshot. A snapshot holds the
  plain function: a method that writes `this` throws there in strict code,
  and an arrow-function field of a `ClassyStore` subclass writes the live
  store one write at a time, with one notification per write. Nothing
  reports it. What a function read from a snapshot does is unspecified.
- `{...store}` copies methods, and a store built from that copy calls the old
  store's methods, as in 0.11. A copy of a snapshot or of the object copies
  plain functions.
- A constructor written as a `function` and held as a value is still handed
  out as a method, as in 0.11: it is not `===` to itself, its statics are not
  on what is read, and `instanceof` against it is `false`. `new` on it still
  builds a real instance. The same holds for TypeScript's ES5 output of a
  class. A real class, a built-in constructor and Babel's class shape (a
  read-only `prototype`) are handed out as they are. A constructor that must
  keep its identity is frozen or held in a list.
- Cost on Node: a call of a method held in a field is 270 nanoseconds against
  250 (about 8%); on Bun it stays at 177. A read and call of an arrow function
  held in a field is 74 against 47 nanoseconds on Node and 39 against 35 on
  Bun. A class method costs what it cost in 0.11.
- One read can still throw: after the store has handed out a method, a
  definition on the raw object behind the store that makes the property
  read-only makes the next read throw a `TypeError`. That is unspecified.
- A property that is read-only and not configurable, for example after
  `Object.freeze(store)`, hands out its function unbound.
- A class that does not extend `ClassyStore` and has an arrow-function field
  still writes to the raw instance, unseen. Record 0011 answers it, and
  record 0036 reports it if its check ships.
- Size: +228 bytes on the main entry, measured together with records 0002
  and 0011 (3,951 bytes for the three).
- Not run: the browser, framework and mutation suites; the `devtools` naming
  reading the key; a component that calls an arrow method taken from a
  snapshot; a compiler's real ES5 output (the rows were written by hand in
  each compiler's shape).
- Open again if a way is found to tell a constructor written as `function`
  from a method written as `function`.
