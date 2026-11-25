# Brief: one rule for functions held by a store

- **Report:** `review/stage-3/spike-functions.md`
- **Scratch folder:** `<scratch>/stage-3-spike-functions/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Why this spike exists

Decision 1 of `review/stage-3-decisions.md` takes the "strict" rule of
`review/stage-3/spike-traps.md` (T1): a method is a function on the prototype
chain, and a function an object holds itself is data. Decision 11 then makes
an exception for a class that extends the base class `ClassyStore`: an arrow
function that creates a field is a method (`review/stage-3/spike-classes-2.md`,
V3, "W2 on create").

Two reviewers object to the strict rule for the same reason. A method written
in an object literal, `createClassyStore({count: 0, inc() {…}})`, stops being a
transaction, so a synchronous subscriber sees each write inside it, and
nothing says so (`review/stage-3/pinned.md`; `review/stage-3/adversarial-whole.md`,
objection 8). That is a new silent failure.

## The rule to test

One rule for every store, in place of strict plus an exception:

> A function that an object is born with is a method: bound to the store and
> run as one transaction. A function written later to a field that exists is
> data, kept as it is. An element of a list, and any function that has its
> own `prototype` property (a class, a constructor), is always data.

"Born with" means one of:

- found on the prototype chain (as today, `constructor` excepted);
- an own property of an object at the moment that object becomes a node of a
  store (the object given to `createClassyStore()`, or a plain object placed
  in a store);
- written through the store to a field that does not exist yet, by `set` or
  `defineProperty` (this is what a `ClassyStore` subclass does for its
  fields, under every compiler `spike-classes-2.md` tried).

Build it on top of `t3a.patch` and the base class of `spike-classes.md` (C1).
The patches of the strict and lenient variants and of W2 are in the
appendices of `spike-traps.md`, `spike-classes.md` and `spike-classes-2.md`;
the reproduction scripts of T1 are in appendix D of `spike-traps.md`.

## What to find out

1. **The case table of T1** (`spike-traps.md`, "The cases", thirteen rows),
   with a column for this rule beside strict and lenient. Add rows for: a
   method written in an object literal, called attached and detached; an
   arrow function in an object literal; a callback present at creation and
   one assigned later, with `===` against the original; a nested plain
   object that has a method; the same object placed in a store after
   creation; a class instance without the base class that has an
   arrow-function field.
2. **The three defects the lenient variant keeps** (same section): a wrapper
   that gets stored when a function is copied between fields or pushed into a
   list; a getter that calls a function held in a field and goes stale; a
   bound or frozen function. Which does this rule keep, and what does it take
   to remove each?
3. **Where the wrapper lives.** In the raw object, or in a table beside the
   node. Say what the raw object holds afterwards, what a snapshot holds,
   what `withHistory`, `persist` and `shallowEqual` see, and what
   `store.cb = store.cb` does.
4. **Does the rule make the base class's exception unnecessary?** That is,
   is "W2 on create" the same code path, so that `ClassyStore` needs no rule
   of its own?
5. **Measures**, as the common brief says: tests by class against strict's
   ten and lenient's eight, typecheck, bytes against strict (0) and strict
   with W2 on create (90), `store.method`, `store.read`, `create.small` and
   `create.rows` on both engines.
6. **Your recommendation**: this rule, strict with the exception, or lenient.
   Say what a user has to be told under the one you recommend, in sentences
   fit for the reference.
