# Brief: the rule for functions, two changes the third review asks for

- **Report:** `review/stage-3/spike-functions-3.md`
- **Scratch folder:** `<scratch>/stage-3-spike-functions-3/`
- **Spikes:** yes, as the common brief (`review/stage-3/briefs/COMMON.md`)
  describes. Read that file first.

## Why this spike exists

Decision 1 of `review/stage-3-decisions.md` takes rule R of
`review/stage-3/spike-functions-2.md`: a function in a field is a method
only when it is read through the store, and the object is never changed.
The third adversarial review (`review/stage-3/adversarial-3.md`, objections
1, 5 and 6) found two things against it, with scripts in
`<scratch>/stage-3-adversarial-3/repro/` (`fn-rows.ts`, `sloppy.ts`,
`own-method.mjs`). Copy them; do not write to that folder.

1. R hands out as data every function that has its own `prototype`. That
   was meant for a class. It also takes the binding and the transaction away
   from `inc: function () {…}` in an object literal, which today is a bound
   method and one transaction, and from every arrow function and shorthand
   method in code compiled to ES5. Nothing reports it.
2. Against today, a call of a method held in a field is 10 to 15% slower
   under R, and a read and call of an arrow function held in a field takes
   1.7 to 1.8 times as long. R's fast path (`r-fast-on-r.patch`) takes that
   back and has two gaps.

## What to build, on R (`c1-t1strict.patch`, then `rule-r.patch`)

**Change 1: only a class is data, not every function with a `prototype`.**
In case 2, a function is handed out as it is when its own `prototype`
property is **read-only**. That is true of a class and of a built-in
constructor, and false of a `function` declaration or expression and of a
generator. Read the descriptor only when the function has a `prototype` at
all, so an arrow function, a shorthand method, an `async` function and a
bound function pay nothing for the test. R recognised a method the store
handed out before by its `prototype`; with this change it has to be
recognised through the map from wrapper to function instead, on a read and
on a write.

**Change 2: the fast path, with the frozen test kept.** `r-fast-on-r.patch`
as it is, except that a function that was frozen after its first read is
handed out as it is (one `Object.isFrozen(fn)` on the fast path).

Build and measure three forms: R (already built: reuse its figures only
where the build is byte for byte the same), R with change 1, and R with
changes 1 and 2.

## What to find out

1. **The case tables of `spike-functions-2.md`**, sections 1 and 2, with a
   column for each new form beside "Today" and "R". Mark every row that
   differs from R. Add rows for:
   - `inc: function () {…}` in an object literal that writes two fields:
     notifications when called on the store; called detached in strict code;
     the reviewer's `fn-rows.ts` and `sloppy.ts`;
   - a class held as a value: statics, `instanceof`, `new store.Model()`;
   - a constructor written as a `function` held as a value: `===`, and
     `new store.Ctor()` (what does it construct, and does it touch the
     store?);
   - a built-in constructor held as a value (`Date`);
   - a generator method and an `async` method in an object literal;
   - a method the store handed out, written to another store's field and
     into a list, read back and called;
   - `store.f = store.f`, `store.b = store.a`;
   - the four rows of the fast path's table in `spike-functions-2.md`,
     section 2 ("after a first read through the store").
2. **Tests.** The unit suite on each form against R's 27 failures. Which
   tests pass again, which fail anew, each classed as the common brief says.
   In particular `core.characterisation.identity.test.ts`, "a function stored
   as data is read back as one stable wrapper bound to the store, while the
   snapshot holds the original".
3. **Cost.** `bun run size` for each form. `own-method.mjs` on today's
   source, R and each form, two rounds per engine. `store.method`,
   `store.read`, `create.small` on both engines, two rounds back to back with
   today's source and R.
4. **What stays wrong.** Say plainly what each form still gets wrong that
   today gets wrong too (for example a constructor written as a `function`
   and held as a value), and anything it gets wrong that today gets right.
5. **Recommendation**: R, R with change 1, or R with both. And the sentences
   of the reference that change from the nine in `spike-functions-2.md`.
