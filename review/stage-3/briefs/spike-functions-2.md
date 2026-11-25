# Brief: a function in a field is a method only when it is read through the store

- **Report:** `review/stage-3/spike-functions-2.md`
- **Scratch folder:** `<scratch>/stage-3-spike-functions-2/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief (`review/stage-3/briefs/COMMON.md`)
  describes. Read that file first.

## Why this spike exists

Decision 1 of `review/stage-3-decisions.md` takes the rule of
`review/stage-3/spike-functions.md` in its form F1: a function an object is
"born with" is a method, and the store writes its wrapper into the raw
object, so the store, the raw object and every snapshot hold one function.

The second adversarial review (`review/stage-3/adversarial-2-core.md`,
objections 1, 2, 3, 6, 7 and 8) shows what the write into the raw object
costs, each with a script:

- A store made from a copy of a raw object or of a snapshot runs the old
  store's methods, in silence (`copy.ts`).
- A callback on a snapshot or on the raw object ignores the `this` its
  caller passes (`thiscall.ts`).
- A snapshot getter that calls an own method writes the live store
  (`snapgetter.ts`).
- A callback restored by `withHistory` comes back wrapped (`restore-fn.ts`).
- A read-only function defined on a new key is wrapped, and the engine
  throws after the property is defined (`define-ro.ts`).

The scripts are in `<scratch>/stage-3-adversarial-2-core/repro/`. Copy them;
do not write to that folder.

## The rule to build

> A function is a method, bound to the proxy of the object that holds it and
> run as one transaction, in two cases.
>
> 1. It is found on the prototype chain, under any key but `constructor`.
>    Any kind of function. This is today's rule.
> 2. It is the value of an own data property of an object that is not an
>    array, **and it is read through the store**. Not when it is: a function
>    with its own `prototype` property (a class, a `function` declaration or
>    expression, a generator); a frozen function; a store; a wrapper that a
>    read through any store made; or the value of a property that is
>    read-only and not configurable.
>
> The rule never changes the object. The raw object and every snapshot hold
> the function as it was written.

There is no rule about when the function was written, no scan when a node is
created, and no clause in the `set` or `defineProperty` trap except this:

- **A wrapper written back.** A wrapper made by the same node is stored as
  the function it wraps, so `store.f = store.f` is no change and
  `store.b = store.a` stores the function. A wrapper made by another node is
  stored as it is: it is data there, bound to the node that made it.
- **A read records a dependency.** A getter that calls a function held in a
  field must see a later replacement of that field.
- **One wrapper per node and function**, kept on the node itself (a field of
  the node or of its closure), not in a module-wide map: `spike-functions.md`
  measured a method call about 5% slower on Node with the module map.
- **The name.** The key a method is read under is passed into
  `transactional()`, for a prototype method and for an own one, so that a
  naming hook (`spike-combos.md`, K2, the hook form) can read it. Give the
  wrapper that name too.

Build it on the same base as `spike-functions.md`: `c1-t1strict.patch` of
`spike-classes.md` (decision 2's T3 (a), T1 strict and the base class C1).
The lenient variant of `spike-traps.md` (T1) is the nearest existing patch
to case 2; `rule-f1.patch` in `spike-functions.md` has `methodOf`, the
frozen test and the store test.

## What to find out

1. **The case tables of `spike-functions.md`**, sections 1, 2, 4 and 5, with
   a column for this rule beside "Today", "Strict" and "F1". Reuse its
   `repro/cases.ts`. Add rows for:
   - a callback assigned to a field declared `= null`: `store.onSave === cb`,
     `snapshot(store).onSave === cb`, `store.onSave === store.onSave`;
   - the four rows of the reviewer's `copy.ts`, and `thiscall.ts`,
     `restore-fn.ts` and `define-ro.ts`;
   - a method of a `ClassyStore` subclass written as an arrow-function field,
     read from a snapshot and called: does it work, and how many
     notifications for two writes;
   - a wrapper handed to another store's field and pushed into a list, then
     called;
   - one function held by two stores; a subclass whose arrow field overrides
     the parent's, compiled with class fields as assignments and as
     definitions (the script of `spike-functions.md` does this with Bun's
     transpiler).
2. **A property that cannot be written.** After `Object.freeze(store)`
   through the store, and for a read-only definition, a read of an own
   function must not throw and must hand out what the Proxy rules allow. Say
   what a user then gets (the function itself, unbound), what it costs to
   detect on a read, and whether a flag on the node avoids a descriptor
   lookup on every read of an own function.
3. **What it breaks.** The unit suite against the base's 28 failures, each
   new or missing failure classed as the common brief says. The typecheck.
4. **What it costs.** `bun run size` for every entry, against the base
   (3,718 bytes for the main entry) and F1 (3,888). Timings of
   `store.method`, `store.read`, `create.small` and `create.rows` on Bun and
   Node, two rounds back to back with the base and with F1; saved copies of
   both are in `<scratch>/stage-3-spike-functions/wt/packages/classy-store/_copies/`
   and `bench.sh` there shows how they were run. Copy what you need.
5. **What a user has to know.** The sentences the reference would carry, as
   `spike-functions.md` did for its rule. Include what stays true of today:
   a function read through the store is not the function that was stored,
   and it ignores the `this` its caller passes.
6. **Recommendation**: this rule, F1, or strict with the base class's
   exception, and why. Say plainly if this rule is worse than F1 anywhere.

## Not in scope

The getter that writes (objection 3's second half), the per-prototype table
and the restore: another agent has those.
