# Stage 3 decisions

Stage 3 of the pre-1.0 review. No library source has been changed. Stage 4
implements what is decided here, one change per commit, test first.

**Status: decided.** Three rounds of review by agents that took no part in
the work raised 58, 30 and 17 objections. After each, the entries they
touched were decided again, most of them from a spike that built what the
objection asked for: seven more spikes in all. "Objections and answers" at
the end has a table for each round, and says what was decided after the
last round and has not been reviewed.

## How to read this

- **Who decides.** The owner handed the decisions to the agent running the
  plan on 2026-11-19, except merging into `main` and releasing. Each entry
  therefore says what is decided and why, not what is proposed.
- **Evidence.** Every entry names the report that holds the patch, the tests
  it changes and the measurements. The reports are under `review/stage-3/`;
  `merged.md` there lists the issues as `M1` to `M77`, and those ids are used
  here. "Finding N" is a numbered finding of `review/stage-1-report.md`.
- **Tests.** A spike was run against the unit suite of 1,341 tests. A test
  that fails under a spike is one of three kinds: it pins the defect the
  change removes ("fix"), it pins behaviour nobody promised ("incidental"),
  or the change is wrong ("regression"). No change decided here has a
  regression.
- **Labels.** **Before 1.0** means the change alters the public API or
  documented behaviour, so after 1.0 it would be a breaking change. **Can
  follow 1.0** means it could ship in a 1.x release without breaking a
  consumer. The label says when a change must land at the latest. "Stage 4"
  says whether it is scheduled now.
- **Bytes** are gzipped bytes of the main entry unless another entry is
  named. Today it measures 3,661 against a budget of 3,750.

## All decisions on one page

"Kind" is one of the plan's five groups: bug, simplification, public API,
diagnostics, performance. Three more are used for what is not a change to
the library's behaviour: "repository" for the workflows and dependencies,
"constraint" for the numbers of `CONSTRAINTS.md`, and "docs".
"Stage 4" says whether the change is scheduled now. The entries are grouped
by subject below, so their numbers are not in order there.

| No. | Decision                                                                                   | Kind                    | Label                                          | Stage 4              |
| --: | ------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------- | -------------------- |
|   1 | A function in a field is a method when read through the store; the object is never changed | Public API, bug         | Before 1.0                                     | Yes                  |
|   2 | `Object.defineProperty` through a store is a write                                         | Bug                     | Before 1.0                                     | Yes                  |
|   3 | Suspension stays; the walk to a detached parent goes                                       | Bug, simplification     | Can follow 1.0                                 | Yes                  |
|   4 | Size ceilings for every entry, and the tooling that holds them                             | Constraint              | Before 1.0                                     | Yes, first           |
|   5 | Raw values on write, one node per raw object                                               | Bug                     | Before 1.0                                     | Yes                  |
|   6 | `includes`, `indexOf`, `lastIndexOf` find the object the caller holds                      | Bug                     | Before 1.0                                     | Yes                  |
|   7 | `has` and `ownKeys` traps; a missing property is a value                                   | Bug                     | Before 1.0                                     | Yes                  |
|   8 | A delete that removes nothing is not a change                                              | Bug                     | Before 1.0                                     | Yes                  |
|   9 | A plain object from another realm is state                                                 | Bug                     | Before 1.0                                     | Yes                  |
|  10 | Getters: one kind of dependency; errors; the snapshot layer                                | Bug, simplification     | Before 1.0                                     | Yes                  |
|  11 | Nested instances stay opt-in; the base class `ClassyStore`                                 | Public API              | Before 1.0                                     | Yes                  |
|  12 | A table per prototype in place of a descriptor lookup                                      | Performance             | Can follow 1.0                                 | Yes                  |
|  13 | One delivery queue, with a bound                                                           | Bug                     | Before 1.0                                     | Yes                  |
|  14 | A subscriber's error is caught and logged, a rejection too                                 | Public API, bug         | Before 1.0                                     | Yes                  |
|  15 | A setter is a transaction                                                                  | Bug                     | Before 1.0                                     | Yes                  |
|  16 | `batch()` refuses a promise by its type and an `async` function when it runs               | Public API              | Before 1.0                                     | Yes                  |
|  17 | `subscribe()` stays batched by default                                                     | Public API              | No change                                      | Docs                 |
|  18 | Writes outside a method stay allowed                                                       | Public API              | No change                                      | No                   |
|  19 | `persist()` restores before it returns when the storage is synchronous                     | Public API              | Before 1.0                                     | Yes                  |
|  20 | Dead and redundant code goes, in the commit that makes it dead                             | Simplification          | Can follow 1.0                                 | Yes                  |
|  21 | Nothing `persist` cannot use is skipped in silence                                         | Bug, diagnostics        | Before 1.0                                     | Yes                  |
|  22 | `persist()` validates its options                                                          | Bug                     | Before 1.0                                     | Yes                  |
|  23 | A restore is all or nothing                                                                | Bug                     | Before 1.0                                     | Yes                  |
|  24 | A pending save is flushed; nothing is written back at load but an expiry stamp             | Bug                     | Before 1.0                                     | Yes                  |
|  25 | Cross-tab sync ignores an event from another storage area                                  | Bug                     | Can follow 1.0                                 | Yes                  |
|  26 | `persist` options stay as they are                                                         | Public API              | No change                                      | No                   |
|  27 | `devtools`: named entries, exact time travel, off in production                            | Public API, bug         | Before 1.0                                     | Yes                  |
|  28 | An edit made in the same tick as `undo()` is recorded                                      | Bug                     | Before 1.0                                     | Yes                  |
|  29 | `withHistory` restores a function held in an own field                                     | Public API              | Before 1.0                                     | Yes                  |
|  30 | Undo and time travel change a nested object in place                                       | Bug, performance        | Before 1.0                                     | Yes                  |
|  31 | `subscribeKey` without a snapshot of the whole store; no selector form                     | Performance             | Can follow 1.0                                 | Yes                  |
|  32 | The workflows are hardened now; the release job is split after 1.0                         | Repository              | Can follow 1.0                                 | Pins and permissions |
|  33 | Dependencies: exact pin, an audit step                                                     | Repository              | Can follow 1.0                                 | Yes                  |
|  34 | Documentation                                                                              | Docs                    | With each                                      | Yes                  |
|  35 | Every error carries a stable code                                                          | Diagnostics             | Before 1.0                                     | Yes                  |
|  36 | One build, and one development-only check                                                  | Diagnostics             | Before 1.0 for the guard; the check can follow | Yes                  |
|  37 | Vue, Angular and Solid build the snapshot when it is read                                  | Performance             | Before 1.0 for Vue; the others can follow      | Yes                  |
|  38 | Vue: no listener left by a server render; a read-only ref                                  | Bug, public API         | Before 1.0                                     | Yes                  |
|  39 | Angular: `untracked()`, an injector option, its own context error                          | Bug, public API         | Can follow 1.0                                 | Yes                  |
|  40 | The adapter names stay                                                                     | Public API              | No change                                      | Docs                 |
|  41 | `prepareStoreForHydration` stays explicit; `isEqual` stays                                 | Public API              | No change                                      | Docs                 |
|  42 | Collections: one membership rule, a snapshot index                                         | Bug, performance        | Before 1.0 for the rule; the index can follow  | Yes                  |
|  43 | Class getters on one derived prototype per class                                           | Public API, performance | Before 1.0                                     | Yes                  |
|  44 | A snapshot keeps a cycle                                                                   | Bug, public API         | Before 1.0                                     | Yes                  |
|  45 | Snapshot types: tuples, collection snapshots without mutators                              | Public API              | Before 1.0                                     | Yes                  |
|  46 | A snapshot after one row changes still rebuilds the list                                   | Performance             | Can follow 1.0                                 | No                   |

## The four decisions the rest hangs on

### 1. A function in a field is a method when it is read through the store, and the object is never changed

**Decision.** A function is a **method**, bound to the proxy of the object
that holds it and run as one transaction, in two cases:

1. It is found on the prototype chain, under any key but `constructor`. Any
   kind of function. This is today's rule.
2. It is the value of an own data property of an object that is not an
   array, **and it is read through the store**.

Case 2 does not apply, and the function is handed out as it is, when:

- it is a class or a built-in constructor, which is told by its own
  `prototype` property being read-only;
- it is a method that a read through any store handed out before;
- it is frozen, or it is a store;
- the property that holds it is read-only and not configurable.

So an arrow function, a shorthand method, an `async` function, a bound
function, a generator method and a function written with the `function`
keyword are all methods when they are read through the store.

**The rule never changes the object.** The raw object and every snapshot
hold each function as it was written. Only a read through the store hands
out the method. There is one method per object and function, so
`store.f === store.f`, and it takes the name of the key it was first read
under.

Two rules for a method that is written back:

- A method that the same object handed out is stored as the function it
  wraps. `store.f = store.f` is no change, and `store.b = store.a` stores
  `a`'s function.
- A method that another object handed out is stored as it is. It is data
  there, and stays bound to the object it came from.

A read of a function in a field counts as a read for a getter, so a getter
that calls a function held in a field sees a later replacement.

**A read of a method the object has already handed out takes a short
path.** The full test asks for the property's descriptor, which is what
makes a read-only property safe to read. Once an object has handed out the
method for a function, a later read skips the descriptor as long as the
object is extensible, no definition through the store has made one of its
properties read-only, and the function is not frozen. A function on the
prototype chain never needs the descriptor.

**How this entry got here.** It is the fourth form, and each review changed
it.

1. The first draft took the "strict" rule: only a function on the prototype
   chain is a method. The first review showed that a method in an object
   literal then loses its transaction in silence.
2. The second form made a function an object is "born with" a method and
   wrote the store's wrapper into the object. The second review showed what
   that write costs (objections 1, 2, 3, 6, 7 and 8 of
   `adversarial-2-core.md`, each with a script): a store made from a copy of
   the object or of a snapshot ran the old store's methods; a callback on a
   snapshot ignored the `this` its caller passed; a getter read on a
   snapshot could write the live store through an object's own method; a
   callback restored by `withHistory` came back wrapped; and a read-only
   definition threw after it was made.
3. The third form left the object alone and handed out the method on a read
   through the store, but handed out every function with a `prototype` of
   its own as data. The third review showed that this takes the binding and
   the transaction away from `inc: function () {…}` in an object literal,
   which today is a bound method (objection 1 of `adversarial-3.md`): two
   notifications for two writes, a `TypeError` when it is called detached in
   strict code, and a write to `globalThis` in code that is not strict.
4. This form hands out only a class as data, and reads a method it has
   already handed out by a short path.

Each form was built and run against the case tables of the forms before it
and against the reviewers' scripts.

**Why.**

- It is today's behaviour with today's defects removed. On every row that
  was run, it gives either today's answer or a fix of today's answer; no row
  was found on which it is wrong where today is right.
- It keeps every fix. A class, a built-in constructor, a frozen function and
  a store held as a value, and a function in a list, are handed out as they
  are (findings 5, 6 and 42). `store.f = store.f` is no change. A getter that
  calls a function in a field does not go stale. One function held by two
  stores writes the store it is called on. A subclass's arrow field that
  overrides the parent's is one transaction, with class fields compiled as
  assignments and as definitions. A method has a name for `devtools`. A read
  of a read-only property does not throw.
- It has no rule about when a function was written or how, so the result
  does not depend on how a compiler emits a class field, an arrow function
  or a shorthand method, and decision 11 needs no rule of its own.
- It never writes into the object it is given. A copy of that object, or of
  a snapshot, holds plain functions, and a store made from one is
  independent.

**What it costs a user.**

- **A function read through the store is not the function that was stored.**
  `store.onSave === cb` is false. That is so today. The identity is kept
  where a component reads it: `snapshot(store).onSave === cb` is true.
- **A method read through the store ignores the `this` its caller passes.**
  It always runs on the store. That is so today. A function read from a
  snapshot or from the object itself runs with the `this` its caller gives,
  so an object of callbacks for another library is handed over from a
  snapshot.
- **A method is called on the store, not on a snapshot.** A snapshot holds
  the plain function. A method that writes `this` throws there in strict
  code. An arrow-function field of a `ClassyStore` subclass writes the live
  store from there, one write at a time and not as one transaction; a
  component that takes such a method from the hook's snapshot and calls it
  causes one notification per write. Nothing reports it. The reference
  already says to call methods on the store.
- **A method copied through the store stays bound to the store it came
  from.** `{...store}` reads through the store, so it copies methods, and a
  new store built from that copy calls the old store's methods. That is so
  today. A copy of a snapshot or of the object itself copies plain
  functions.
- **A constructor written as a `function`, held as a value, is still handed
  out as a method**, as today: it is not `===` to itself, its static
  properties are not on what is read, and `instanceof` against it is false.
  `new` on it still builds a real instance and does not touch the store.
  The same holds for a class that a compiler has turned into such a
  function with a writable `prototype`, which is what TypeScript emits for
  ES5. A real class and a built-in constructor are handed out as they are,
  and so is a class in the shape Babel emits, which has a read-only
  `prototype`; that shape was written by hand for the run, not compiled.
  The third form fixed this row and this form gives it back, because a
  function cannot be both this and a method written with `function`, and
  the method is the commoner of the two. A constructor that has to keep its
  identity is frozen, or held in a list.
- **A call of a method held in a field is a little slower than today on
  Node.** A call is 270 nanoseconds against 250, about 8%; on Bun it is
  today's 177. A read and call of an arrow function held in a field is 74
  against 47 on Node and 39 against 35 on Bun. A method of a class costs
  what it costs today.
- **One read can still throw.** After the store has handed out a method, a
  definition made on the raw object behind the store that makes that
  property read-only makes the next read throw a `TypeError`: the short path
  cannot see a change made behind the store. Today every read of a
  read-only function property throws. What is done to the raw object behind
  a store is unspecified, and the reference says to make a property
  read-only through the store.
- A property that is read-only and not configurable, for example after
  `Object.freeze(store)`, hands out its function as it is, unbound.
- A class that does not extend the base class and has an arrow-function field
  still writes to the raw instance, and no subscriber hears it. No rule
  about wrapping can change what `this` is inside that arrow function.
  Decision 11 is the answer to it. Decision 36 reports it, if its check
  ships.

**Not taken.**

- **Strict:** only a function on the prototype chain is a method. A method
  in an object literal is then not a transaction and throws when detached,
  and the base class needs an exception of its own.
- **Born with, written into the object** (the second form). It keeps the
  identity of a callback assigned to a declared field, and costs the five
  failures listed above.
- **Every function with a `prototype` of its own as data** (the third form).
  It fixes a constructor held as a value, and silently breaks a method
  written with `function`.
- **Lenient as first spiked:** wrap every function on every read except an
  element of a list, a class and `constructor`. It keeps the copied wrapper
  and the stale getter, which this form removes.
- **The same rule without the short path.** It asks for the descriptor at
  every read of any function, so no read can throw, also after a change
  made on the raw object. It costs every method of a class 2 to 3% on Node,
  at the edge of the spread, a call of a method held in a field 10 to 15%
  against today, and a read and call of an arrow function held in a field
  1.6 to 1.8 times today's time. The one read it protects is in the
  unspecified list and throws today.
- **Telling a bound function by its name.** A user can fake the name.

**Evidence.** `spike-functions-2.md` for the form without the class test
and for the short path as first built, and `spike-functions-3.md` for this
form, all built on the strict rule, decision 2 and the base class. In
`core.ts`: 67 lines added and 18 removed for the rule, 21 and 6 for the
class test, and 20 for the short path with its test for a frozen function.
26 tests change against 28 on that base: the fixes of the strict rule that
concern a class, a list of functions and an array method stay fixes; its
one incidental change, the object-literal method that stopped being a
transaction, passes again; and so does the test that pins a `function` in a
field as a bound method. No regression. The typecheck shows only the base
class's new export. The main entry is 3,951 bytes with all three in. Some
seventy rows were run on today's source and on each form, among them the
scripts of the second and third reviews, and four rows for a property made
read-only after a first read.

Timed in two rounds on both engines against today's source and the two
forms before. `store.read`, `store.method` and `create.small` touch today's
ranges on both engines, and the four cost ratios stay inside their limits.
The rows for a method held in a field are the ones quoted above. Not run:
the browser, framework and mutation suites; the naming hook of decision 27
reading the key; a component that calls an arrow method taken from a
snapshot; a compiler's real ES5 output (the rows are written by hand in
each compiler's shape).

**Label.** Before 1.0. **Stage 4:** yes. The task adds two rows to the core
benchmark, a call of a method held in a field and a read and call of an
arrow function held in a field, and records them before and after. The
change lands only if `store.method` is inside the spread of the commit
before it on both engines, and the two new rows are no slower than the
figures above allow: 10% for the call and 1.6 times for the read and call. The baseline is the commit before, not the figures of stage 1, which
decision 12 has moved by then.

**Docs.** The sentences at the end of `spike-functions-2.md`, with the
second and the eighth changed and one added as `spike-functions-3.md` says,
go into the tutorial and the reference. The architecture page describes the cache of methods, which is
per object.

### 2. `Object.defineProperty` through a store is a write, and nothing is refused

**Decision.** A definition through a store does the bookkeeping of a write:
the value becomes the property's child or the old child is detached, and
subscribers are told when the value, the getter, the kind of property or its
enumerability changed. Every descriptor is still forwarded to the raw object.
`Object.freeze(store)` keeps working and stays silent. A definition or a
delete of a property that is or was an accessor clears the node's getter
cache, so a getter that read it is not left stale (finding 44). No
`setPrototypeOf` trap is added.

**Why.**

- It removes findings 1, 45, 61, 66, 67 and 71 for 49 bytes, and every test
  it changes pins one of those defects.
- It takes nothing away. An accessor or a read-only definition works
  correctly on both layers afterwards, so refusing it would forbid something
  that is right.
- The base class for arrow-function methods needs it: class fields reach the
  trap as data descriptors (`merged.md`, contradiction 8).

**Not taken.**

- Refusing accessor and read-only descriptors (Immer's way): 160 bytes more,
  most of it message text, and it rules out the base class.
- Refusing `Object.freeze(store)` (MobX's way): it gives up a feature added
  on purpose and removes no code, because a frozen root passed to
  `createClassyStore()` still needs the read-only case.
- A `setPrototypeOf` trap that throws (findings 47 and 48). After decision 1
  a method replaced on the prototype or a swapped prototype is picked up,
  which was the defect in finding 47. `persist` cannot swap a prototype
  (security 1). What is left is an application that swaps the prototype of
  its own store on purpose, and that is not ours to forbid.

**Evidence.** `spike-traps.md`, T3 (a). 28 lines added, 9 removed. 17 tests
change, all fixes. Timings inside the spread.

**Label.** Before 1.0: the tutorial says today that `Object.defineProperty`
"bypasses assignment/deletion tracking". **Stage 4:** yes.

### 3. Suspension stays; the walk to a detached parent goes

**Decision.** Remove the `detachedParent` pointer and the walk in
`resumeScope()`. Keep suspend and resume.

**Why.**

- The walk is the cause of findings 61, 66, 67 and 68, among them the read
  that never returns. Each node already saves its children's versions when it
  is suspended, so each can resume on its own when it is touched.
- Suspension itself earns its place. Without it a write to a row that
  outlived 2,000 replaced lists costs 122,610 nanoseconds against 446, until
  the collector runs, and for as long as anything keeps the old lists alive.
- Ten lines out, one in, 36 bytes smaller, and the typecheck passes.

**Not taken.** Removing suspension as a whole (85 lines), for the cost above.
The one-line fix of stage 1 (resume in the `defineProperty` trap) is
contained in decision 2 and is harmless beside this one.

**Evidence.** `own-code.md`, `x2`, run twice in separate worktrees with the
same result. 6 tests change, all fixes. The reproduction of finding 66 hangs
on the unmodified source and returns with the patch.

**Label.** Can follow 1.0: no documented behaviour changes. **Stage 4:**
yes, first, because decisions 2 and 12 touch the same traps.

**Left as it is.**

- The order in which owners are notified (findings 24 and 69, M16) is
  **unspecified**.
- A subscription on a container that has left the store lasts while the
  caller holds the store, the container or the unsubscribe function (M15).
  The docs say so. Holding a subscribed node strongly would turn a forgotten
  unsubscribe into a leak.
- A raw object changed while it is out of the store shows its old content in
  the next snapshot (finding 25, M17). It is a case of "writes outside the
  proxy are not seen", which the docs already state.

### 4. The size budgets move once, to a ceiling, for the whole set

**Decision.** The decided changes do not fit the budgets of
`CONSTRAINTS.md`, and no subset worth shipping does. Each budget gets a
ceiling, set here once for the whole set. One decision record carries all of
them.

| Entry                 | Today | Budget today | Estimate | Ceiling | What moves it                                                    |
| --------------------- | ----: | -----------: | -------: | ------: | ---------------------------------------------------------------- |
| `.` (the main entry)  | 3,661 |        3,750 |    5,375 |   5,575 | The first table below                                            |
| `./utils` adds        | 2,686 |        2,750 |    4,216 |   4,350 | The second table below                                           |
| `./collections` adds  |   727 |          750 |      911 |     950 | The snapshot index, the membership rule, the mutator check       |
| `./react` adds        | 1,662 |        1,700 |    1,693 |   1,750 | The guard for a cyclic snapshot                                  |
| `./vue` adds          |   280 |          300 |      369 |     400 | The read-time ref, the server path, the setter that throws       |
| `./angular` adds      |   271 |          300 |      381 |     425 | The read-time signal, `untracked()`, the injector, its own check |
| `./solid` adds        |   312 |          335 |      346 |     375 | The read-time accessor                                           |
| `./svelte` adds       |   182 |          200 |      182 |     200 | Nothing                                                          |
| `./react/server` adds |   153 |          175 |      153 |     175 | Nothing                                                          |

**How a ceiling is set.** The estimate, plus an allowance for what was
decided and never built, plus the 2% that every budget carries, rounded up
to the next 25 bytes. The allowances: 80 bytes on the main entry, because
two built combinations came out above the sum of their parts; 30 on
`./utils` for three parts of decisions 21 and 24 that no spike holds; 20 on `./vue` for the setter that throws; 30 on `./angular` for its
own context check. The first draft's ceilings for `./react`, `./vue` and
`./angular` were below their own estimates plus 2%, so the last step of
stage 4 would have failed on the reports' own numbers.

**A ceiling is an estimate and a tripwire, not a measurement.** The decided
set was never built as one. Each figure in the two tables below is one
change measured alone against today's source, or, where a change was built
on top of another, the bytes it added there; the note under each table says
which. Two combinations that were built came out above the sum of their
parts (the trap spikes 650 against 617, the snapshot spikes 243 against
230), and one below it (raw values, the searches, the freeze,
`defineProperty` and the table per prototype, 465 against 486). What a
ceiling is for is to stop the work: a change that would pass one is not
committed, and the question goes back to a decision.

**How a budget moves in stage 4, and what enforces it.**

- Stage 4's first commit is tooling only. `budgets.json` gets a `ceiling`
  beside each budget, and the size script fails when a budget is above its
  ceiling or a measured size above its budget.
- **A ceiling does not move with the work.** The floor guard refuses a
  commit that changes a ceiling that exists together with anything else. The
  first commit, which adds the ceilings, is the one exception, because there
  is none before it. A ceiling
  changes only in a commit that holds the new number and the decision
  record's reason for it, and nothing more, so it cannot ride along with the
  change that needs it. The first draft let a ceiling rise under the same
  condition as a budget, which made the tripwire a sentence and not a check.
- **A budget moves with a line in the record.** The floor guard reads
  `budgets.json` and `limits.json` as well as `CONSTRAINTS.md`, and blocks a
  budget or a limit that rises unless the same commit adds a line to the
  decision record. Today it reads `CONSTRAINTS.md` only, and one record
  anywhere on the branch would switch it off for every later change.
- **The guard checks every commit, itself included.** It walks the commits
  from the merge base with `main` to the head and judges each against the
  one before it; today it sees one difference for the whole branch. Its own
  file comes into its scope for a rule that is removed or loosened: today it
  leaves itself out, so a later commit could weaken it unseen. The text of
  its own patterns, in that file and in the fixtures of its tests, is not a
  finding; the fixtures are put together when a test runs, so that no file
  in the repository holds a line the guard would flag. CI runs it on the pull request, and it is run
  before each push during stage 4.
- **Each rule has a test.** The first commit adds tests for the size
  script's two failures and for each rule of the guard, run on throwaway
  repositories made by the test.
- A commit that grows an entry sets that entry's budget to its new measured
  size plus 2%, adds a line with the measured size to the decision record,
  and stays under the ceiling.
- When stage 4 ends, every budget is the final measured size plus 2%.
- The record is approved by the agent running the plan, under the owner's
  words of 2026-11-19 in the plan's first ground rule. `CONSTRAINTS.md` says
  "that the owner approved" and "the owner has not reviewed it yet"; both
  sentences are brought in line with that rule in the same first commit.

**The main entry, change by change.**

| Change                                                                | Decision |  Bytes |
| --------------------------------------------------------------------- | -------: | -----: |
| The rule for functions                                                |        1 |   +228 |
| `defineProperty` as a write                                           |        2 |    +49 |
| The walk to a detached parent removed                                 |        3 |    −36 |
| Raw values on write, and a child kept when its container is frozen    |        5 |   +104 |
| Searches that find the object the caller holds                        |        6 |   +168 |
| `has` and `ownKeys` traps, a missing property as a value              |        7 |   +156 |
| A delete that removes nothing                                         |        8 |    +11 |
| A plain object from another realm                                     |        9 |    +81 |
| Getters: one kind of dependency, errors, a getter that writes         |       10 |   +281 |
| The base class                                                        |       11 |    +13 |
| A table per prototype in place of a descriptor lookup                 |       12 |   +180 |
| The delivery queue with its bound, setters, the rejection handler     | 13 to 15 |   +219 |
| The check for an `async` function in `batch()`                        |       16 |    +50 |
| Dead lines removed                                                    |       20 |    −32 |
| The slot through which `devtools` names a method                      |       27 |    +12 |
| Class getters on a derived prototype, and `this` in a snapshot getter |       43 |   +239 |
| A snapshot keeps a cycle                                              |       44 |     −9 |
| Sum                                                                   |          | +1,714 |

Measured on top of another change, not alone: decision 1 (on the strict
rule, decision 2 and the base class; the row is the three together, 3,951
bytes, less the other two), the later parts of decisions 5, 6, 10 and 12
(each on the part before it), and decision 27 (on the first form of its
entries).

The sum puts the main entry near 5,375 bytes, 47% above today's. The first
draft of this entry counted 4,820 and left two rows open. The 553 bytes
since then are what the three reviews asked for: the rule for functions
(228, an open row before), the child kept through a freeze (68), the searches that
answer correctly for a list of snapshots (68), the throw for a getter that
writes, by any path (116), the table that holds no getter body and cannot
grow without bound (61), and the hook for `devtools` (12, the other open
row). The messages were
measured as their spikes wrote them; the codes of decision 35 shorten them,
by about 100 bytes for the first set and unmeasured for the rest. (The
report that measured the messages gives 271 bytes of text in all; the
difference is the text of refusals this document does not take.)

**What `./utils` adds, change by change.**

| Change                                                                     |     Decision |  Bytes |
| -------------------------------------------------------------------------- | -----------: | -----: |
| `persist`, `history` and `devtools` as one build                           | 19 to 25, 27 |   +710 |
| The `persist` rules of decisions 21 to 24, as built after the third review |     21 to 24 |   +245 |
| The naming moved out of the core into `devtools.ts`                        |           27 |    +57 |
| The root store's getter values in what `devtools` sends                    |       27, 43 |    +95 |
| Restore in place                                                           |           30 |   +113 |
| Each object entered once per restore                                       |           30 |    +16 |
| A container that would refuse the restore is replaced                      |           30 |   +211 |
| `cloneSnapshot` made safe for a cycle                                      |           44 |    +21 |
| `subscribeKey` without a snapshot of the whole store                       |           31 |    +62 |
| Sum                                                                        |              | +1,530 |

The sum is 4,216 bytes. The first row is the first combination of the
`persist`, `history` and `devtools` changes; the second is what the rules
of decisions 21 to 24 add to it in their final form, with the write-back
after a migration taken out again. Three small parts of those decisions are
not in that build, and the ceiling has 30 bytes for them.

**What each of the larger items buys, so that it can be weighed.**

- 239 bytes (decision 43): a snapshot lists the store's keys, a snapshot of
  a class with getters is four times faster to make, and `this` inside a
  snapshot getter is right.
- 219 bytes (decisions 13 to 15): no stack overflow and no hung event loop
  when a subscriber writes, and faster ordinary writes.
- 281 bytes (decision 10): five getter defects, a cached getter read a
  quarter faster, and a getter that writes its own store told so on both
  layers.
- 168 bytes (decision 6): `includes()` and `indexOf()` find the object the
  caller holds, in about 1% of today's time.
- 228 bytes (decision 1): one rule for every function a store holds, a
  method in an object literal that stays a transaction, and arrow-function
  methods that work.
- 156 bytes (decision 7): getters that use `in` or `Object.keys(this)` stop
  returning stale answers. It serves fewer users than the others.
- 180 bytes (decision 12): a field read 2.7 times faster on JavaScriptCore
  and a fifth faster on V8.
- 81 bytes (decision 9): a rare case. It is taken because it cannot be added
  later; stage 4 tries the form without the cache first.

**What was cut to keep it down:** long error messages, refusals in the
`defineProperty` trap (160), recording reads outside a getter's own node
(124), cached getter errors (73), the changed-keys rebuild (270), an index
beside live collections (339), and every development warning but one.

**The cost limits** of `CONSTRAINTS.md` are expected to hold, and that is a
forecast: the whole set was never timed. When stage 4 ends, the baselines
are recorded again. A limit that can be tightened is tightened to the highest
new run times 1.2. A limit that would have to rise needs a line in the
decision record, like a budget.

**The docs.** The README and `CLAUDE.md` say "about 3.7 KB". Stage 5 changes
that to the measured figure.

## Bugs

### 5. Raw values on write, and one node per raw object

**Decision.** The `set` trap stores the raw object behind a store proxy, and
`linkChild` finds an existing node by the raw object as well as by the proxy.
One addition, from the first review: when a property becomes read-only
through the store while it holds an object the store tracks
(`Object.freeze(container)`, or a definition without a value), the trap puts
that object's proxy in the raw slot first. A read-only property has to hand
out what the raw object holds, and this way that is the proxy.

**Why.** It removes findings 9 and 10: a class instance that is already a
store stays connected when it is placed in another store by its raw object,
and the raw object behind a store no longer fills up with proxies. Decision 2
needs it for one line: a definition must store the raw value too.

The addition answers objection C2. Without it, raw values on write made a
child read back raw after its container was frozen through the store, and a
write through it told no one, where today a child that was assigned as a
proxy stays reactive. With it, every child the store tracked before the
freeze stays a child, however it got there. That is better than today for a
child that was assigned as a plain object or was present at creation: today
both read back raw after a freeze.

**What stays raw, and is documented.** An object frozen before it reached
the store, and a read-only property defined with an object as its value
(both engines refuse a swap there). Such an object is handed out as it is; a
write through it is not seen, and the snapshot holds it unfrozen. That is
today's behaviour, and "a frozen object is a value" already says it for the
first.

**Evidence.** `spike-traps.md`, T2, first part: 12 lines added, 8 removed,
36 bytes, 3 tests change, all fixes. `spike-core-2.md`, F1: 15 lines added
and 2 removed in the `defineProperty` trap, 68 bytes, no test changes beyond
those of decisions 2 and 5, typecheck passes, and the reviewer's
reproduction gives today's answers again. One earlier run had shown store
creation about 20% slower on Node with raw values on write. A second run,
between two runs of the unmodified source, does not: creating a small store
and a store of rows are both inside the drift of the machine on both
engines.

**Label.** Before 1.0, because `outer.inner === inner` changes its answer.
**Stage 4:** yes, in the commit after decision 2. Decision 2 lands first and
stores a defined value as it is given; this commit changes both traps to
store the raw value and adds the swap.

**Not covered, on purpose.** A list built from proxies and then assigned
(`this.items = this.items.filter(…)`) still holds proxies in its raw array.
Replacing them would change an array the caller may still hold.

### 6. `includes`, `indexOf` and `lastIndexOf` find the object the caller holds

**Decision.** On a list in a store, the three searches find an element that
is part of a store by any of its forms: its raw object, its proxy, or a
snapshot of it. Any other element, such as a snapshot or a frozen object
kept as a value, or a `Date`, is found by reference, as in a plain array. A
primitive is searched for with the native method.

**Why.** `const row = {…}; store.rows.push(row); store.rows.includes(row)` is
`false` today (finding 7). That is a wrong answer from a documented array
method, in the most ordinary way of using it.

The first draft compared every element by identity, and objection C7 showed
where that is wrong. Every snapshot of one object has the same identity, so
on a list of saved versions `indexOf(v2)` answered 0 and `includes` was true
for a version that was never pushed. A list of snapshots kept as values is
an undo stack, and it has to answer as a plain array does.

**A reactive collection answers differently, on purpose.** `reactiveSet` and
`reactiveMap` match every member by identity, a value too (decision 42). So
two snapshots of one object are two elements of a list and one member of a
set. A list is an array and has to answer as one. A collection is asked
"is this row selected?" with whatever snapshot of the row a component
holds, and has to say yes after the row was edited. The collections guide
states the difference, and a test pins both answers.

**How.** The raw list holds an element that is part of a store by its raw
object, or in an older list by its proxy, and a value by itself. So the
answer is the nearest hit of the engine's own search for up to three
values: the value given, and, when it is a form of an object in a store,
that object's raw form and its proxy. `fromIndex` is passed to the engine
unchanged.

**Evidence.** `spike-traps.md`, T2, searches: 100 bytes, 7 tests change with
the first part of T2, all fixes. `spike-core-2.md`, F3, on top of it: 30
lines added and 14 removed, 68 more bytes, the same 7 tests and no other,
and 18 rows of searches that agree with a plain array wherever a plain array
has an answer. A search for an object in a list of 1,000 rows takes 0.5
microseconds on Bun and 0.9 on Node, against 95 and 180 today, where each
element goes through the `get` trap, and 0.15 and 0.2 for a plain array. It
allocates two short arrays per search for an object. A form with one loop
and no allocation was built as well: 42 bytes larger and five to eleven
times slower.

**Label.** Before 1.0. **Stage 4:** yes.

### 7. `has` and `ownKeys` traps on the live store, and a missing property as a value

**Decision.** A getter that asks `'b' in this` or `Object.keys(this)` records
a dependency: on the key for `in`, and on a per-node counter of the key set
for `Object.keys`. A read of a property that is not there records that it
was missing, so such a getter is memoized like any other.

**Why.** It removes findings 30 and 32 on the live store. A memoized getter
that returns a stale answer is a defect in the feature the library is built
around.

**Not tracked in 1.0.** An own-property check inside a getter:
`Object.hasOwn(this, key)`, `this.hasOwnProperty(key)` and
`Object.getOwnPropertyDescriptor(this, key)`. They do not go through the two
traps, and a getter that uses one stays stale after a key is added, as it
does today. The docs say to use `in`. A trap that records them is an
addition and can follow 1.0.

**For stage 4.** The `defineProperty` trap of decision 2, which lands
earlier, has to move the key counter when a definition adds a key or changes
whether it is enumerable. The lines, bytes, tests and timings below are for
the spike's own records; under decision 10 the change is written in that
decision's single shape, which no spike built, so stage 4 takes its figures
from its own build.

**Evidence.** `spike-traps.md`, T4, the live store. 55 lines added, 7
removed, 156 bytes. 9 tests change, all fixes. Timings inside the spread
except two metrics on Node that are 1.4% and 1.5% slower. Under decision 10
the two new records take the single shape of a getter dependency, so stage 4
writes this on top of that, not beside it.

**Label.** Before 1.0: the reference says "A live getter that reads an absent
field recomputes on subsequent reads", and that sentence goes. **Stage 4:**
yes.

**The snapshot half** (findings 31 and 41: what `this` is inside a snapshot
getter) is decision 43.

### 8. A delete that removes nothing is not a change

**Decision.** `delete store.dict.missing` returns `true` and does nothing
else.

**Evidence.** `spike-traps.md`, T5. 2 lines, 11 bytes. 7 tests change, all
fixes, and one switch leaves the randomized test.

**Label.** Before 1.0: guaranteed rule 2 says that a write which changes
nothing notifies no one, and that is false without this. **Stage 4:** yes.

### 9. A plain object from another realm is state

**Decision.** A plain object made in an iframe or a Node `vm` context is
proxied and frozen in snapshots like any other plain object (M13). Stage 4
builds it first without the per-prototype cache and keeps the smaller form
that leaves store creation inside the spread.

**Why.** Today writes to such an object notify no one and its snapshot is
not frozen, in silence. It ships in 1.0 or not at all: afterwards the object
is a frozen copy in a snapshot where today it is the object itself, so code
that compares or writes through a snapshot would break in a minor release.

**Not taken.** A guard for a read of a property that was frozen behind the
store's back (finding 46, M7). That failure is loud, a `TypeError` on the
read, and its guard takes back most of what decision 12 gains on a nested
read. The docs say that the raw object must not be frozen once a store holds
it.

**Evidence.** `spike-traps.md`, T6. 24 lines, 81 bytes with the cache, no
test changes. The form without the cache was not measured.

**Label.** Before 1.0. **Stage 4:** yes.

### 10. Getters: one kind of dependency, on both layers what the other has

**Decision.** Take the combination of the getter spikes:

- One kind of getter dependency, `{value, version}` by property. It contains
  the version stamp that makes a clean read constant, records each property
  once per run, and treats a missing property as a value.
- A getter that reads a getter which threw records that dependency, on both
  layers, inside a frame that also covers validation.
- The snapshot layer keeps the memo map that nested getters filled (finding
  37) and reports a cycle with the live layer's error where it overflows the
  stack today (finding 38).
- **A getter must not write to the object it is computed on, by any path.**
  - On the live store, a write to the getter's own object throws a
    `TypeError` that names the field: an assignment, a `delete`, a
    definition, also through a method the getter calls.
  - On a snapshot, a write to `this` throws the same way; the traps throw
    themselves, so it holds in code that is not in strict mode too. And
    while a snapshot getter runs, the live object the snapshot was taken
    from counts as having a getter running. So a write that reaches the live
    store around `this` throws as well, with nothing written and nobody
    told: through an arrow-function method of a `ClassyStore` subclass,
    through a reference to the store, or through a method called on the
    store.
  - The throw is for the one object the getter is computed on, and its
    message names that object's field, not "the store". A getter on a nested
    object that writes its parent or the root is not covered: the write goes
    through on both layers, and it is unspecified.
  - Allowed on both layers: a write to another store, and the construction
    of a store inside a getter. A write to a child object is allowed on the
    live store; on a snapshot it throws in strict code, because the child is
    frozen, and is ignored in code that is not strict.

**Why.**

- It removes findings 32, 36 (the getter that catches an error), 37, 38 and
  39, and the cost that doubles per level for getters arranged as a diamond.
- One kind of dependency is the smallest of the correct designs: 77 bytes
  smaller than three kinds with the fix added on.
- The stamp is safe for a subtree that has left the store. That was the open
  question, and it is now tested: a differential fuzz of 300 seeds compared
  180,112 getter reads with a plain mirror, 55,058 of them on a node outside
  the store, and it holds under decision 3.
- A snapshot is frozen, so a getter cannot write to it, and every adapter
  reads snapshots. Today that write is dropped without a word. An error
  there shows the mistake the first time a component reads the getter.
- The first draft left the live store as it is, and two objections showed
  what that leaves (C12 and C13). `this.cache ??= …` worked on the store and
  threw through every adapter. And the throw on a snapshot came from a trap
  that returned `false`, which only strict code turns into an error, so a
  getter in a plain script lost its write in silence. Both are closed. The
  throw on the live store is the narrow one, for the getter's own object, so
  the two reasons the first draft gave against a throw no longer apply: a
  store built inside a getter and a call into another store both work.
- The second review found the path the first fix left open (objection 3 of
  `adversarial-2-core.md`): a getter read on a snapshot that calls an
  arrow-function method of its own class, or writes through a reference to
  its store, wrote the live store and told its subscribers while a component
  was reading. With the base class of decision 11 that is an ordinary way to
  write a class, and every adapter reads snapshots.
- A throw that is added after 1.0 is a breaking change. Dropping one is not.

**What it costs a user.** A getter that fills a cache field on its own
store, or calls a method that writes its own store, throws where it worked
on the live store. It already failed in every component. A getter that
writes to a child object still differs between the layers, as described
above; covering that would mean walking the parents on each write made while
a getter runs. It is **unspecified**, and the docs say that a getter must
not write to the store it reads.

**Not taken.**

- Recording reads outside the getter's own node (another store, a static).
  It costs 124 bytes and 14 to 18% on a getter over 1,000 rows, and it cannot
  work on a snapshot. The docs state the limit and the pattern that works:
  hold the other store as a field.
- Caching a thrown error. 73 bytes and seven pinned behaviours for one gain.
  It can follow 1.0, and whether errors are cached is **unspecified**.
- Throwing for every write made while any getter runs. It would refuse a
  store that is constructed inside a getter, which the base class of
  decision 11 does by writing its own fields, and a getter that calls a
  method of another store.

**Evidence.** `spike-getters.md`. The combination: 182 lines added, 144
removed, 165 bytes. 16 tests change: 15 fixes and 1 incidental. On Node a
cached getter read is 26% faster and a recompute 6 to 9% slower; the four
cost ratios stay inside their limits on both engines. `spike-core-2.md`, F4,
on top of that combination: 9 lines in `snapshot.ts` and 16 in `core.ts`, 74
bytes with the two messages as written. Nine kinds of write were run on both
layers. 3 more tests change, all incidental: they pin today's behaviour of a
getter that writes a field of its own store. `spike-core-3.md`, G1, on top of
that: 18 lines in `core.ts` and 21 in `snapshot.ts`, 42 bytes, no test
changes. Three snapshot getters that wrote the live store and notified now
throw: one that calls a base-class arrow method, one that writes through a
reference to the store, and one that calls a method on the store. A write, a
cached snapshot getter and a recomputed one are inside the spread on both
engines; on Bun the recomputed one is a steady 4% higher. Not built: these
rows on top of decision 1, and on top of decision 43. The spike hands each
snapshot's live object to the getters it installs on that snapshot; decision
43 installs a class's getters once, on a shared prototype, so the live
object has to be found from `this` at each run. Stage 4 writes this part in
step 4 on today's snapshot layer and runs its rows again as tests after step
5.

**Label.** Before 1.0: a getter that writes becomes an error, and the
sentence about an absent field goes. **Stage 4:** yes.

### 11. Nested class instances stay opt-in, and a base class makes arrow-function methods work

**Decision.**

- **Nested class instances stay opaque unless the class says otherwise**
  (API question 6). `static [PROXYABLE] = true` stays, and
  `static [PROXYABLE] = false` is documented as "opaque on purpose"; it works
  today.
- **A base class, `ClassyStore`, is added to the main entry** (API question
  4). Its constructor returns the store, so a class that extends it is a
  store from its first line: arrow-function fields, methods bound in the
  constructor and whatever the constructor starts all write through the
  store. Such a class is reactive wherever it is placed, with no marker.
  `createClassyStore(new X())` stays, for a plain object and for a class
  that cannot extend it.
- **The base class has no rule of its own for functions.** Decision 1 covers
  it: an arrow-function field is a function in a field, so it is a method
  when it is read through the store, and so is a subclass's field that
  overrides the parent's. The first draft made these an exception that held
  only here.
- **A `#private` field is never state.** The docs say so. With the base
  class it can be used on the live store; a snapshot cannot carry it.
- **The base class ships in 1.0.** A second spike ran what the first only
  reasoned, and each point holds or has a fix that was run.

**Why.**

- An arrow-function method that writes to the raw instance and tells no one
  is the most prominent silent failure the library has, and the docs can
  only warn about it today. The base class removes it for 13 bytes.
- It answers question 6 for a class the user owns. What then stays opaque by
  default is what the user does not own, and for those objects opaque is
  right.
- Wrapping class instances by default was run and is not taken. Eight tests
  change, six of them the documented rule. A class with `#private` fields
  throws. An object that changes itself leaves a stale copy that no check
  can see. A graph of 5,461 objects placed in a store costs 20 milliseconds.

**What it costs a user.** A class has to extend `ClassyStore` for its
arrow-function fields to work, and the docs gain these sentences:

- A callback held in a field is compared on a snapshot, where it is the
  function that was stored (decision 1).
- An arrow method is called on the store. Taken from a snapshot it still
  writes the store, one write at a time and not as one transaction.
- Under React's `StrictMode`, `useLocalStore` makes two stores in
  development, so a constructor that starts a timer starts two.
- A class that has to extend another class uses `createClassyStore(new X())`
  and prototype methods.

**Not taken.** Detecting an arrow function by its source text: it finds 6 of
7 lost writes, reports 2 fields that lose nothing, and costs 256 to 342
bytes. An `opaque()` helper and a mixin form of the base class.

**Evidence.** `spike-classes.md`, `spike-classes-2.md` and
`spike-functions.md`. The base class is 4 lines and 13 bytes. One subclass
was compiled 17 ways (TypeScript with class fields as definitions and as
assignments, Bun, Oxc, esbuild, the SWC of Next.js with the example's
configuration, Babel in spec and loose mode), and in every output the first
snapshot is right, an arrow method notifies once, and a field write and a
timer's write are seen. Those 17 outputs were run on the first draft's rule.
Decision 1 as it now stands changes nothing when an object is created, so
what they showed still holds, and the override case was run again both ways
with Bun's transpiler. Seven throwaway tests pass
for Vue, Svelte, Solid, Angular, `createStoreHook` and `useLocalStore`. A
base-class store made inside a getter works on both layers.

**Label.** The default for nested instances: before 1.0, and no code. The
base class: an addition. **Stage 4:** yes, after decisions 1 and 2, and
after decision 30, which it needs. Stage 4 runs the 17 compilations again
on the real code.

**After 1.0** (decision 36): a warning for an unmarked class placed in a
store, once it can be silenced for a class that is opaque on purpose.

## Performance

### 12. A table per prototype answers "is this key a getter?"

**Decision.** The `get` and `set` traps stop walking the prototype chain with
`Object.getOwnPropertyDescriptor` on every access. An own key is decided with
`hasOwnProperty` and one flag per node. An inherited key is decided from a
table per prototype, filled on the first miss, that says for each key which
prototype object carries an accessor for it, or that none does. The table
holds no function. A read whose cached result is still valid returns it;
only a recompute asks that prototype for its getter, so the function that
runs is the one the class has now.

**The table cannot grow without bound.** A key the prototype chain has is
always recorded. A key that is absent everywhere is recorded only while the
table holds fewer than 256 keys; after that such a key is looked up at each
read, as today.

**Why.** A read is the hottest operation the library has, and this is the
largest gain any spike measured: a field read goes from 31.9 to 11.5
nanoseconds on Bun and from 47.5 to 38 on Node, a read three objects deep
from 108 to 48 and from 143 to 116, and a cached getter read from 58 to 35
and from 85 to 77. All 1,341 tests pass.

The first draft cached the whole descriptor, getter included, and objection
C6 showed what that does: a getter redefined on the class kept its old body
on the live store while snapshots ran the new one, a getter replaced by a
value still ran, and a deleted getter still answered. In the form decided
here a redefined getter runs its new body at its next recompute, as today.

**What it assumes.** A prototype is not changed after its first read through
a store. The library does not handle that fully today either (findings 44
and 47), and it is **unspecified**, with these answers for now, two of which differ from today's. A getter
added to a prototype for a key that was read as absent is seen, and it is
not memoized: its body runs at every read, where today it runs once. An
override nearer the instance is not seen. A getter removed or replaced by a
value is seen at its next recompute, where today it is seen at once.

The bound answers objection 5 of the second review. As first spiked, the
table kept an entry for every key that was ever looked up and not found, and
the table of `Object.prototype` is shared by every plain object of every
store. A dictionary read by keys it does not have yet grew it by 88 MB for a
million keys, with no key left in the store. With the bound the same run
grows the heap by 0.2 MB, as today.

**Not taken.** Never recording an absent key: a read of a key that a class
instance does not have is then slower than today on Node (107 to 116
nanoseconds against 97 to 100). No table for `Object.prototype` and
`Array.prototype`: the tables of class prototypes still grow, and
`Object.prototype` does carry an accessor, `__proto__`, which needs an
exception that is easy to miss. The table that caches the descriptor: 46 bytes smaller and
wrong as described. A table that names the prototype and reads the getter
at every read: 23 bytes smaller than the form taken, and a cached getter
read is then 19% slower on Node than today.

**Evidence.** `spike-core-2.md`, F2, the lazy form: 55 lines added and 12
removed in `core.ts`, 1 line in `ownership.ts`, 165 bytes, no test fails,
typecheck and lint pass. Timed in three rounds of five processes per engine,
back to back with the unmodified source and the other two forms. The
orchestrating agent's own run of the descriptor form agrees: a field read
19% faster on Node and 66% on Bun. `spike-core-3.md`, G2, form (c), on top
of it: 5 lines added and 2 removed, 15 bytes, no test fails, and every
timing of the lazy form kept, a read of an absent key included. Not
measured: a read of an absent key once the table holds 256; from the form
that never records one it is about today's cost on Node for a plain object
and up to 10% above today's for a class instance. Not built: this form on
top of the getter combination of decision 10, where the getter is read
after that combination's own validation.

**Label.** Can follow 1.0. **Stage 4:** yes, before decisions 1 and 2,
because the trap then already knows "own or inherited", which decision 1
asks.

## Subscriber delivery and transactions

### 13. One delivery queue, with a bound

**Decision.** A write made while synchronous subscribers are being called is
queued and delivered after the round that is running, and before the
outermost write returns. A subscriber removed during delivery is not called.
A subscriber added during delivery hears the next change, not the one in
flight. One queue serves all stores. On the batched path, one microtask
serves every round: a write made inside a batched subscriber is delivered to
batched subscribers in that same microtask, after the round that is running.

Delivery stops after 100 rounds. It then reports once, with the code
`delivery-loop`, the store keeps the writes, and subscribers that were
waiting are called at the next write.

Four choices inside it:

- **A subscriber hears of its own write**, once, as in MobX and Preact. A
  subscriber that corrects state has to stop writing once the state is right.
- **One microtask for every batched round**, the same rule as the
  synchronous path.
- **The report of the bound goes where a subscriber's error goes** (decision
  14).
- **The first round reads the owners directly.** This is the variant that
  costs 30 more bytes and keeps a direct write with a synchronous subscriber
  as fast as today. A direct write while a component is mounted is the most
  common write an application makes, so it is not the one to slow down.
  Stage 4 confirms on a quiet machine that `store.write.sync` stays inside
  the spread of today's on both engines; if the variant does not achieve
  that, the plain queue is taken and the slowdown stated in the reference.

**Why.** It removes findings 18 to 22, among them a stack overflow and an
event loop that never drains. MobX, Preact Signals, Vue and Svelte reach the
same design. It also makes an ordinary write faster, because every write now
takes one path: the write ratio goes from 2.69 to 2.21 on Bun and from 1.4 to
1.06 on Node.

**What it changes for a user.** A synchronous subscriber of store A that
writes store B makes B current at once, and B's subscribers hear a round
later. Another subscriber of A in that round therefore reads the new B
through the store and the old B through an adapter. Today it reads the new B
in both. The reference says that adapter values of another store may lag
inside one delivery round.

**Evidence.** `spike-delivery.md`, D1. 72 lines added, 36 removed. 16 tests
change: 13 fixes and 3 incidental. The queue costs 33 bytes; the bound and
its message 75 to 130 more as spiked, less with a code. Without the variant,
a direct write with a synchronous subscriber is about 85 nanoseconds slower
on Bun and 30 on Node.

**Label.** Before 1.0: the order of calls changes, and what a removed or a
late subscriber gets goes into the spec as guaranteed. **Stage 4:** yes.

### 14. A subscriber's error is caught and logged; the writer is never told

**Decision.** Keep today's rule and write it into the spec: a subscriber's
error is caught, the other subscribers run, and the code that wrote is not
told. The rejection of an `async` subscriber is caught and logged in the same
way. The report itself is guarded: if `console.error` throws, as it does in
test setups that fail on console output, the round goes on and the writer
still is not told.

**Why.** Every adapter is a synchronous subscriber, so the code that fails is
usually not the code that wrote. Throwing to the writer makes an unrelated
`store.count = 1` throw after the count has changed, hides a method's own
error and loses its return value. On the microtask path there is no writer
at all. The rejection handler makes the two ways a callback can fail land in
one place, for 25 bytes. Without the guard on the report, the rule is false
exactly where tests are strictest: a console that throws sends its error to
the writer and skips every later subscriber of the round, today and after
decision 13 alike.

**Not taken.** Throwing the first error to the writer (Preact, Legend-State
3). `reportError()`, which ends a Bun process and only logs on Node. A
reporter the application can replace is an addition and can follow 1.0.

**Evidence.** `spike-delivery.md`, D2: 1 test changes, a fix. The guard on
the report was reproduced as missing by `adversarial-edges.md`, objection 4,
and is not spiked; stage 4 writes its test first.

**Label.** Before 1.0, as a line in the spec. **Stage 4:** yes.

### 15. A setter is a transaction

**Decision.** A class setter that writes two fields notifies a synchronous
subscriber once (finding 43).

**Evidence.** `spike-delivery.md`, D3. 8 lines, 5 bytes. 2 tests change, both
fixes.

**Label.** Before 1.0: one sentence in the reference. **Stage 4:** yes.

### 16. `batch()` refuses a callback that returns a promise, by its type, and an `async` function when it runs

**Decision.**

- The parameter of `batch()` becomes a function whose result is not a
  promise, with a type whose error message says why.
- At run time, `batch()` throws a `TypeError` with the code `batch-async`
  when it is given a native `async` function, before the function is called,
  in every build.

**Why.** `batch(async () => …)` groups only the writes before the first
`await` and hands back the promise as if it had worked. The type stops that
where it is written, for no bytes, but it cannot see an `async` function held
under a `() => void` type, a JavaScript caller or an `any`. Those keep the
silent split unless the function is checked when it arrives. The check runs
before anything is written, so nothing is half applied and no promise is
lost. Both refusals have to be decided now: accepting promises again after
1.0 would be a compatible change, and starting to refuse them would be a
breaking one.

**What it costs a user.** `batch(() => { store.loading = true; return
save(); })` no longer compiles and is rewritten with the `save()` outside; at
run time it is accepted, because it is not an `async` function and it
batches everything it should. A wrapper generic over the result of `batch()`
needs a cast. An `async` function that a build step has turned into a
generator is not seen by the check.

**Evidence.** `spike-delivery.md`, D4: the type is 7 lines and 0 bytes, and 3
type assertions in 2 test files change; the check before the call is 10
lines and 50 to 83 bytes as spiked, less with a code, and 2 tests change, both
fixes. `adversarial-edges.md`, objection 5, shows the three callers the type
does not see.

**Label.** Before 1.0. **Stage 4:** yes. The reference also states the rule
for an `async` method: it is a transaction up to its first `await`.

### 17. `subscribe()` stays batched by default

**Decision.** No change (API question 1). The reference says at the top of
the `subscribe` section that the callback runs in a microtask and that
`{sync: true}` runs it before the write returns.

**Why.** A direct property write has no unit that groups two fields, so the
microtask is what gives `store.a = 1; store.b = 2` and `Object.assign` one
call. A synchronous default would hand every caller of `subscribe()` the cost
only the adapters carry today (one call, and often one snapshot, per direct
write), and would turn the option of `persist`, `withHistory` and `subscribeKey` around.

**Evidence.** `spike-delivery.md`, D5, with the counts per case.

### 18. Writes outside a method stay allowed, without a warning

**Decision.** No change (API question 2, M32). `batch()` stays in the API.
A warning when a synchronous subscriber is called many times in one task
follows in 1.x (decision 36).

## `persist`, `devtools` and `history`

### 19. When hydration happens

**Decision.** `persist()` restores before it returns when the storage is
synchronous. It awaits only a storage that returns a promise. There is no
option for it; `skipHydration` keeps its meaning. `hydrated` settles even
when the store cannot be snapshotted at the start of a read, and
`rehydrate()` keeps the `finally` that guarantees it.

**Why.** A store on `localStorage` renders its defaults first today, and the
saved state a microtask later. The change is 15 lines added and 18 removed,
and `./utils` gets 6 bytes smaller.

The handle exists before the first read starts, so a report made during it
can hand the handle to `onError` (decision 21). With `skipHydration` nothing
is read, and so nothing is saved, until `rehydrate()` is called (decision
21).

**Two things the guide has to say.**

- **Call `persist()` after the store is constructed, never inside a
  constructor.** With the base class of decision 11 a constructor is a
  natural place for it, and it is the wrong one: the field initialisers of a
  subclass run after the restore and overwrite it, and under decision 2 they
  count as edits, so the next save writes them over the stored record. Stage
  4 pins what happens with a test, so that the sentence stays true. The test
  needs the base class, so it is written in the base-class step, not here.
- **On the client, `prepareStoreForHydration(store)` is called before
  `persist(store)`** (decision 41).

**Evidence.** `persist-devtools.md`, P1. 1 test changes, incidental: it
relies on the old timing. The constructor case is `adversarial-edges.md`,
objection 2, reproduced with a stand-in for the base class. The `hydrated`
gap is the spike's own note.

**Label.** Before 1.0. **Stage 4:** yes.

### 20. Dead and redundant code goes, in the commit that makes it dead

**Decision.**

- **Code that is dead today is removed first**, before the other changes:
  the ten dead lines of the three core files in the form the type checker
  accepts, the dead blocks of `persist.ts` (M54, finding 54), and the
  redundant checks stage 1 listed in `equality.ts`, `history.ts` and
  `collections.ts` (finding 59), each after a benchmark where it sits in a
  loop.
- **Code that a later change makes dead is removed in that change's
  commit.** That holds for the per-field bookkeeping of a restore, which
  decisions 22 and 23 make unreachable, and for `resumeScope()` in
  `createClassyStore`, which decision 3 makes redundant. `CONSTRAINTS.md`
  allows no unexplained surviving mutant in a target file, so dead code
  cannot wait for a cleanup step.
- **The two traps of the React snapshot cache that proxy-compare cannot
  reach** (finding 4) are removed if deleting them fails no unit test and no
  React suite; otherwise each gets a test that reaches it.
- **The ternary in `activeTracker()` stays.** It looks dead and is on the
  path of every read.

**Evidence.** `own-code.md`, `r5`: 8 lines added, 17 removed, 32 bytes
smaller, no test fails, typecheck passes. `persist-devtools.md`, "Seen on the
way". The claim about `activeTracker()` rests on a patch that changed several
things at once and is timed alone before stage 4 relies on it.

**Label.** Can follow 1.0. **Stage 4:** yes.

### 21. Nothing `persist` cannot use is skipped in silence, and nothing it could not restore is written over

**Decision.**

**A handle writes only after it has read.** Until its first read has
settled, a handle saves nothing: with `skipHydration` that is until the
first `rehydrate()`, and with a storage that returns a promise it is while
the first read is in flight. An edit made before then is kept in the store.
When the read restores a record, the edit wins for the field it changed, and
the result is saved. `save()` rejects before the first read has settled.
`clear()` works at any time.

**A stored record that is read and not restored** is one of five kinds:

| Kind                          | What it is                                                                                                                                                                                                                                                                                     | What happens                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Nothing to keep               | Not JSON; an envelope that is not an object; a `state` that is not a plain object; a version that is not a finite number of zero or more; an `expiresAt` that is neither a number, `null` nor missing; a record the library itself cannot restore, because it is nested too deep (decision 23) | Reported as `'parse'`. The next save replaces it                                            |
| A lower version, no `migrate` | The documented way to drop an old format                                                                                                                                                                                                                                                       | Not used and not reported. The next save replaces it                                        |
| From a newer version          | Its version is above the configured one                                                                                                                                                                                                                                                        | Reported as `'parse'`. `migrate` is not called. The handle does not write while it is there |
| Not migrated or not merged    | `migrate`, `merge` or a `deserialize` threw, or `migrate` or `merge` returned a thenable or something that is not a plain object                                                                                                                                                               | Reported as `'parse'`. The handle does not write while it is there                          |
| Not read                      | The read itself failed                                                                                                                                                                                                                                                                         | Reported as `'read'`. It counts as no read, so the handle does not write                    |

- **A handle that does not write** saves nothing: on an edit, when the page
  is hidden, or on `save()`. An edit does not repeat the report. `save()`
  reports as `'write'` and rejects with the error. A `rehydrate()` that
  finds such a record again reports and rejects. The handle writes again
  after `clear()`, after a `rehydrate()` that restores a record, finds none
  or finds one with nothing to keep, and when such a record, or the removal
  of the record, arrives from another tab. `lastError` of the status holds
  the report for as long as the handle does not write.
- **`onError` receives the handle as its third argument**, so that it can
  call `clear()`. For a synchronous storage the first read runs inside
  `persist()` (decision 19), and the report comes before `persist()` has
  returned anything the callback could use. An error that `onError` throws
  is logged with `console.error`; today it is swallowed.
- **When no `onError` is given, the report goes to `console.error`** with
  its code, in every build. `onError` replaces that default.
- **The version rule is one rule, on both sides.** A version is a finite
  number, zero or above. A record with no `version` field counts as version
  0; any other value, `null` and `"2"` included, leaves nothing to keep. The
  `version` option is checked when `persist()` is called (decision 22).
- **`migrate` is called only for a lower version**, and never as an `async`
  function: a native `async` function is refused when `persist()` is called
  (decision 22). If a `migrate` returns a thenable when it runs, a handler is
  attached to it, so no rejection is left unhandled, and the record counts
  as not migrated.
- **Expiry comes first.** A record whose time has elapsed is treated as
  expired whatever its version, as the build that wrote it would treat it.

**Why.**

- One channel for every failure of a read, and a default for it. `onError`
  is optional, and without a default a refused record is as silent as today.
- A handle that writes before it has read writes over a record it never
  saw. That is what a handle with `skipHydration` does today on its first
  edit, and `skipHydration` is the pattern the server-rendering guides
  teach: a stored record is replaced by the defaults and one edit, and the
  `rehydrate()` that follows reads the damage back.
- A record of a newer version is the data of a newer build of the same
  application: another tab that has already updated, or a deployment that
  was rolled back. Today `migrate` is called with it, and the next edit
  writes the older build's state over it.
- A record that the application's own `migrate`, `merge` or `deserialize`
  failed on is valid data that a corrected release can still read. Replacing
  it at the next save turns a bug in one release into lost data for every
  user who makes an edit. Not saving is the failure that can be undone; it
  is reported, and the application can choose the other one with `clear()`.
- A record that is not a record, or that the library itself can never
  restore, holds nothing a later release could use, and keeping it would
  stop the store from ever saving again. A version raised with no `migrate`
  is the documented way to drop an old format, and it stays silent.
- Awaiting an `async` `migrate` would put a turn between the read and the
  apply, which is what decision 19 removes. Calling it and dropping its
  promise would turn a silent skip into an unhandled rejection, which ends a
  Node or Bun process.
- A version need not be an integer. The first draft demanded one, on the
  record only: an application configured with `version: 1.1` would have
  refused its own record after the upgrade.

**What it costs a user.**

- **With `skipHydration`, nothing is saved until `rehydrate()` has been
  called.** An application that never calls it saves nothing, and only
  `save()` says so, by rejecting. `isHydrated` shows the state. The guides
  say today that `skipHydration` "does not delay writes"; that sentence is
  reversed.
- **While a handle does not write, edits are not saved**, and if a later
  `rehydrate()` restores a record, they are restored over. After a release
  whose `migrate`, `merge` or `deserialize` fails for a stored record, that
  user's state is not saved until a later release reads the record or the
  application calls `clear()`.
- **After a rollback of a deployment**, a user whose record the newer build
  saved cannot save on the older build until the newer one is back.
- **Two losses stay**, and the guide names both. A tab that read before a
  newer build wrote, and does not sync, writes over the newer record at its
  next edit: it cannot know. A `migrate` that returns a wrong result without
  throwing is saved at the user's next edit.

**How this entry got here.** Each of the three reviews found a way to lose
stored data in it, and it was rewritten each time before anything was
built: a silent skip without `onError`; an older build that wrote over a
newer record; advice to call `clear()` from a callback that had no handle; a
handle with `skipHydration` that wrote before it read. After the third
review the whole rule set was built once and run through 33 paths on today's
source, on the first combination of the `persist` changes and on the new
build.

**Evidence.** `spike-persist-2.md`, on top of the combination of
`persist-devtools.md`: 98 lines added and 36 removed in `persist.ts` and
`persist.types.ts`. `./utils` adds 3,641 bytes, 245 more than that
combination. Of the 33 paths, the ones the reviewers raised now keep the
record: the rollback, `version: 1.1`, `skipHydration` over a newer record,
`clear()` from `onError` on both kinds of storage, a `merge` that throws,
and a `migrate` that returns `null` or a rejected promise. 48 tests change:
14 of that combination's 15; 24 that use `skipHydration` as a set-up and
save before any read, incidental; 2 that pin `save()` replacing a record it
never read, fixes; 3 that pin the read winning over an edit made before
`rehydrate()`, changed by decision; and 5 that check the arguments of
`onError`, incidental. The typecheck shows the type test of the two-argument
`onError`. Three parts are decided here and not in that build: a record
nested too deep has nothing to keep (the build keeps it, and the handle then
never saves again); the removal of the record in another tab lets a handle
write again; and the stamp of decision 24 only for a finite `expireIn`. Not
run: a real `pagehide`, a real second tab, the browser suites.

**Label.** Before 1.0. **Stage 4:** yes.

### 22. `persist()` validates its options when it is called

**Decision.** `persist()` throws a `TypeError` with a code, before it reads
or writes anything, for: a prototype key, a getter or a method named in
`properties`; a transform that is half written; a `version` that is not a
finite number of zero or more; and a `migrate` that is a native `async`
function.

**Why.** These are mistakes in the application's own code, at a boundary the
library owns. Today each is accepted and then does the wrong thing later.
Checking the version and `migrate` here, once, means neither is ever found
out record by record, where the cost would be a user's stored data.

**Evidence.** `persist-devtools.md`, P3: 82 bytes, 5 tests change, 4 fixes
and 1 incidental. The checks of `version` and `migrate` were built in
`spike-persist-2.md`: 56 bytes. A native `async` function is told by its
`Symbol.toStringTag`, named exactly, because a looser test refused the mock
functions of the test runner.

**Label.** Before 1.0. **Stage 4:** yes.

### 23. A restore is all or nothing

**Decision.** A restore copies every value first, writes them in one
transaction, checks that the result can be snapshotted, and rolls back if it
cannot. A nested `__proto__` key is dropped. A record whose restore was
rolled back, or that is nested too deep to copy, has nothing to keep
(decision 21): it is reported, and the next save replaces it.

**Why.** Today a deeply nested record restores and then makes every snapshot
and every save throw, so it is never replaced. No release can restore such a
record, so keeping it would only stop the store from saving for good.

**What it changes for a user.** A synchronous subscriber is told once, after
the whole record is in, where today it is told once per field and can edit
another field in between. The persist tutorial describes today's behaviour,
and that sentence changes in the same commit.

**Evidence.** `persist-devtools.md`, P4. 74 bytes. 1 test changes, a fix.

**Label.** Before 1.0, for the documented sentence. **Stage 4:** yes.

### 24. A pending save is written when the page is hidden, and nothing is written back at load but an expiry stamp

**Decision.**

- A debounced save that is still waiting is written when the page is hidden
  (`pagehide`).
- **A migrated record is not written back at load.** The first save writes
  it, as today.
- **One thing is written back at load:** a record of the configured version
  that has no `expiresAt`, or `null`, read by a handle whose `expireIn` is a
  finite number, is saved again with an `expiresAt`, through the ordinary
  save path and its debounce. Its state and its version are unchanged.
- A record that arrives from another tab is never written back.

**Why no write-back after a migration.** The first two drafts wrote a
migrated record back at once, so that the migration would not run again on
the next load. The third review showed what that opens (objection 4 of
`adversarial-3.md`). A `migrate` that is wrong and does not throw would
replace the source record for every user who opens the release, edit or no
edit, where without the write-back a user who only looks keeps the old
record. And after a rollback, every user who merely opened the newer build
would have a record the older build must not write over. Running a
`migrate` once more per load costs nothing next to either.

**Evidence.** `persist-devtools.md`, P5, for the `pagehide` flush: no test
changes; a real page unload was not tested, and stage 4 tests it in the
browser suite. `spike-persist-2.md` for the rest: a migrated record is kept
until the first edit (paths 2 and 4), and a record without `expiresAt` is
written once with one (path 10b). With `expireIn: Infinity` that build
writes the record again on every load, which is why the stamp is for a
finite `expireIn` only; that last part is not built. No test pins either
write-back today; stage 4 writes both.

**Label.** Before 1.0: the persist tutorial says that hydration does not
rewrite storage, and the stamp is an exception to that sentence. **Stage
4:** yes.

### 25. Cross-tab sync ignores an event from another storage area

**Decision.** The narrow form: an event whose `storageArea` is another area
is ignored when `storage` is a `Storage`. An event without `storageArea` is
still accepted, because only a script can make one, and a script on the page
can write to the storage directly.

**Evidence.** `persist-devtools.md`, P6. 24 bytes. No test changes.

**Label.** Can follow 1.0. **Stage 4:** yes.

### 26. `persist` options stay as they are

**Decision.** No option is renamed, removed or made optional. `storage`
stays required: making it optional later is an addition, and a default of
`localStorage` would add a new silence where it is missing. `clearOnExpire`
stays. One callback gains an argument: `onError` receives the handle as its
third (decision 21). A callback written for two arguments still fits.

**Why.** An earlier draft removed `clearOnExpire` and always cleared an
expired record. That was reasoned, not spiked, and it would delete data in
two cases nobody ran: a handle without `expireIn` reading a record another
handle stamped, and a device whose clock runs ahead on shared storage. A
tidier option list is not worth a deletion that was never tested.

**Label.** No change.

### 27. `devtools`

**Decision.**

- **Entries.** `devtools` subscribes on the synchronous channel. A store
  method sends one entry, named after the method, when the outermost call
  returns, with one snapshot. Direct writes outside a method send one
  `STORE_UPDATE` entry per task, from a microtask. So the synchronous
  channel costs one snapshot per outermost method and never one per direct
  write.
- **How the name reaches `devtools`.** The core holds one place for a
  function, empty unless `devtools` is connected, and nothing else.
  `devtools()` fills it while at least one connection is open and empties it
  when the last one is disposed. A method call tests it; when it is empty
  the call is today's code. The naming itself lives in `devtools.ts`. This
  is the "hook" form of the spike, not its "slot" form, which keeps a counter
  and the naming in the core.
- **The name is the key.** The key a method was first read under is handed
  to that function with the call, for a method of a class and for one held
  in a field alike. The function's own `name` is not used: it is empty for an
  arrow function assigned in a constructor. There is one method per object
  and function, so a function held under two keys has the name of the key
  that was read first: after `store.b = store.a`, a call of `store.b()` is
  named `a`.
- **Time travel.** A jump replaces the state exactly, in one transaction,
  without calling setters. A jump to an entry this session sent restores the
  snapshot that was sent, so a `Date` stays a `Date`; a jump the extension
  sends as JSON restores data.
- **Messages.** `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled.
- **`enabled` defaults to on only where `NODE_ENV` can be read and is not
  `production`.** It reads the environment the way decision 36 does. Where
  there is no `process` to read, the default is off: a bundle in which
  nothing replaced the expression must not hand every state to an extension
  because of it. `enabled: true` turns it on anywhere. The guide names the
  builds in which the default is off, and says that the extension receives
  every state, so a store with secrets passes `enabled: false`.
- **Computed values.** A snapshot no longer lists class getters (decision
  43), so `devtools` adds the values of the root store's class getters to
  what it sends, each read guarded. Decision 43 has the details, the cost
  and the limit: a getter of an object literal that throws still loses the
  entry, as today.

**Why.** Every entry is named `STORE_UPDATE` today, which makes the tool's
list useless, and a jump adds unknown fields, never deletes missing ones and
calls setter-only accessors. The default changes because DevTools on a
production page hands the whole state to any extension that asks, and a
default cannot be changed after 1.0.

The hook form answers objection W17. The first draft's hook ran on every method
call of every user, `devtools()` or not, and cost 5 to 6% of a method call
on Node. With it a method call without `devtools` is inside the spread
of today's on both engines, and the main entry carries 12 bytes for it, not
20.

**What it costs a user.** While `devtools` is connected, a method call
allocates one closure. An application that loads `./utils` twice, once as
ESM and once as CommonJS, and connects `devtools` from both has one copy's
names fall back to `STORE_UPDATE`; that was read from the code, not run.

**Evidence.** `persist-devtools.md`, P7: 403 bytes on `./utils`, and no test
changes, because stage 1 added none for `devtools`; stage 4 writes them
first. `spike-combos.md`, K2, the hook form (`k2-hook-on-p7.patch`): 12 bytes on
the main entry and 452 on `./utils` with P7, 1,341 tests pass,
`store.method` timed in five rounds on each engine against today's and
against P7. That patch reads the function's own `name`; passing the key was
not built, and stage 4 tests an entry for an arrow function written to a
new key and for one assigned in a constructor first. Not
verified: the entry ids the Redux DevTools extension sends back.

**Label.** Before 1.0. **Stage 4:** yes.

### 28. An edit made in the same tick as `undo()` is recorded

**Decision.** `withHistory` drops its `restoring` counter and runs undo and
redo as one transaction each. An edit made in the same tick as `undo()` or
`redo()` is then recorded like any other (findings 57 and 58).

**Evidence.** `persist-devtools.md`, P8. `./utils` 24 bytes smaller. 1 test
changes, a fix.

**Label.** Before 1.0: the history guide describes today's behaviour, and
that sentence goes. **Stage 4:** yes.

### 29. `withHistory` restores a function held in an own field, by reference

**Decision.** Undo removes a function that was added to a field and puts
back one that was replaced, by reference (finding 60, M59). Methods on the
prototype are untouched, as today.

**A restore from outside never touches a function field.** A DevTools jump
that the extension sends as JSON carries no functions. The shared restore
neither deletes nor writes a function field for such a state, so a jump
cannot remove the arrow methods or the callbacks of a store. Only a state the
library recorded itself restores function fields, by reference.

**Why.** It follows from decision 1. A snapshot holds each function as it
was written, so a recorded entry has the value to put back, and history
records the field, so it has to restore it. After the restore a read through
the store hands out the same method as before, because there is one method
per object and function.

**Evidence.** The write-back was run on the form of decision 1 that is now
taken (`spike-functions-2.md`, the rows of `restore-fn.ts`): a callback whose
key was deleted is written back by assignment and by a definition, and the
snapshot holds the callback itself both times. Under the second form of
decision 1 it came back wrapped, which was objection 6 of
`adversarial-2-core.md`. The change in `history.ts` itself was not built:
undo skips functions on every build today. Stage 4 writes the tests first
and stops if the change turns out larger than a few lines there. The tests
cover a callback that is replaced, a callback whose key was deleted, a
function field that held another function at the time of the undo, and a
jump by JSON on a store whose methods are own fields.

**Label.** Before 1.0. **Stage 4:** yes, after decision 1.

### 30. Undo and time travel change a nested object in place

**Decision.** A restore goes down while both sides are containers of the
same kind and writes only what differs. Where a restored value is the
snapshot of an object that is still live, the live object is put back. Undo,
redo and a DevTools jump share that one function (M60). The function enters
each live object at most once per restore, and treats the recorded root as
the store, so a store that refers to itself is restored like any other.

**A container that would refuse the restore is replaced, as today.** Before
an object is restored in place, one check asks whether every write the
restore would make there is allowed. A key to add to an object that is not
extensible, a read-only key whose value differs, and a key that cannot be
deleted each fail it. The check counts only the writes the restore will
make: a function field that a state from outside does not carry is not a
key to delete (decision 29), so a jump by JSON on a sealed store whose
methods are own fields does not fail it. The spike's check was written
before that rule and counts such a key; stage 4 tests the jump first. The object is then replaced at its parent by a copy.
The root cannot be replaced: when the root fails the check, the restore
throws a `TypeError` before it writes anything, and the history does not
move.

**Why.**

- Today a restore replaces a changed branch with a copy. After undoing an
  edit to one row, every row of the list is a new object, every row
  component renders again, and a row the caller held is detached.
- It is worse for a store that holds other stores, which decision 11 makes
  ordinary. After one undo every row is a frozen snapshot: a prototype
  method on it throws, and an arrow method writes the old store.
- It is faster. Undo of one row in 1,000 goes from 2,315 microseconds to
  273 on Bun, and 999 row snapshots are kept.
- Entering each object once answers objections W1, C1 and E9. With decision
  44 in the same build and no such mark, every restore that reached an
  object on a cycle overflowed the stack, left the store half restored and
  moved the history pointer all the same.

The check answers objection 4 of the second review. Decision 5 keeps the
children of a container that is frozen through the store, and decision 2
keeps that freeze silent, so no history entry records it. Without the check
an undo into such a container was refused part-way: the store was half
restored, its one notification carried the half state, and the history had
moved. Today the same undo works, because it replaces the branch.

**An object that has moved or is shared.** The restore follows the object,
not the place it was recorded in (objection E8). An object that was in the
store when the entry was recorded and is still live is put back and restored
in place, wherever else it now sits. If it is also part of another store, it
is one object there too: that store sees the restore, and its subscribers
are told once. So an undo in one store can take back an edit that was made
through another. The history guide says it: a history records one store, an
object two stores share is undone in both, and a move between two stores is
undone by a history on a store that holds both. Today an undo puts a copy in
place of a shared object, which ends the sharing without a word.

**What it costs a user.** A container that was locked after the entry comes
back as a new copy without the lock, child objects included, so a reference
to the old container no longer points into the store. That is today's
behaviour for every restored branch.

**What stays.** A DevTools jump that the extension sends as JSON restores
data, not class instances. The guide says so.

**Evidence.** `spike-classes-2.md`, V4: 80 lines added, 48 removed, 113 bytes
on `./utils`. `spike-combos.md`, K1, on a build with V4 and decision 44: 5
lines in `cloneSnapshot.ts`, 16 bytes on `./utils`, no test changes beyond
those of the two decisions. Six stores with a cycle were undone, redone and
jumped back: all return, each object is the one that was made, and each undo
notifies once. An undo of 1,000 plain rows is inside the spread with the mark
(264 microseconds against 263); 1,000 rows that point back to their store
take 1.9 milliseconds, which is decision 44's cost, not the restore's. The
addendum of that report ran four cases of an object that moved to another
store or is shared by two, on the same build and on the unmodified source.

`spike-core-3.md`, G3, on that same build: 44 lines in `cloneSnapshot.ts`
and 5 in `history.ts`, 211 bytes on `./utils`, no test changes. Seven kinds
of locked container that threw part-way now return with the recorded values
and one notification. A frozen root throws with nothing written and the
history unmoved, where today it throws with the history moved. The six rows
of K1 and the four of the addendum give the same output. The 1,000-row undo
is inside the spread, with medians 5 to 8% higher. Not timed on Node. Not
run: a DevTools jump on a frozen root.

**Label.** Before 1.0: the reference says "changed fields are replaced with
mutable copies". **Stage 4:** yes, on top of decision 27. Its tests are the
six rows of K1 for undo, redo and a jump, the four rows of the addendum and
the ten rows of G3.

### 31. `subscribeKey`

**Decision.**

- A selector form, an equality option and an immediate first call (M62) are
  additions and are not part of 1.0.
- It stops taking a snapshot of the whole store on every notification (M61).
  It reads the live value, and takes a snapshot of that one node only when
  the node or its version changed. The callbacks and their values are the
  same in every case that was run; a key beside 1,000 rows goes from 113
  microseconds to 0.45 on Bun and from 49 to 0.78 on Node. 21 lines, 62
  bytes on `./utils`, no test fails (`spike-snapshots.md`, N5). Can follow
  1.0. **Stage 4:** yes.

## Snapshots

### 43. A snapshot carries class getters on one derived prototype per class

**Decision.** A class getter is no longer an enumerable own accessor of
every snapshot (API question 3, M33). For each class that has getters, one
object that inherits from the class prototype is made once, with one
memoizing accessor per getter, and snapshots of that class are created from
it. Inside a snapshot getter `this` is the frozen snapshot behind a tracker,
so it has the store's keys, and the class as its constructor and for
`instanceof` (findings 31 and 41, M34). Its prototype is the derived object,
not `Class.prototype`. A getter on an object literal stays an own accessor,
listed where the store lists it (finding 70).

`devtools` adds the values of the root store's class getters to what it
sends, each read guarded, so a class getter of the root that throws shows
its error text and the entry is still sent. Nested objects are sent as they
are. The guard goes no further than that: a getter of an object literal is
an own accessor of the snapshot, the extension's serialiser runs it, and one
that throws still loses the entry, at the root or below it, as today.

**Why.**

- No compared library lists a class getter among the own enumerable keys of
  a copy. Today `Object.keys(store)` and `Object.keys(snapshot(store))`
  differ, and a spread or a `JSON.stringify` of a snapshot runs every getter
  and throws if one does. A DevTools entry is serialised the same way, so
  today one class getter that throws spoils the entry.
- It is the only form that also removes a cost on the path every write in
  every adapter takes: a snapshot of a class with eight getters is four
  times faster to make and holds sixteen times less memory.
- It lets the snapshot's `this` match the store with no filtering, and it
  drops the own key a class setter gets on a snapshot today.

**What it costs a user.**

- A spread or a serialised snapshot no longer carries computed values; they
  have to be named. Nothing reports it: `{...snap}.total` still type-checks
  and is `undefined`, as it is for any class instance in TypeScript. Every
  compared library behaves this way, and the cost is taken on purpose
  (objection C10). The tutorial documents today's behaviour, so the
  paragraph changes, and the changelog names it.
- `Object.getPrototypeOf(snapshot)` is no longer `Class.prototype` for a
  class with a getter. `instanceof` and `constructor` are unchanged. The
  reference's "keep the class prototype" becomes "are instances of the
  class".
- A snapshot of a reactive collection no longer lists `size` in
  `Object.keys` or JSON. `snap.size` reads as before.
- The DevTools panel no longer shows the getter values of a nested store or
  a nested class instance, only those of the store `devtools()` was given.
  Showing them needs a walk and a copy of every object on the way for every
  entry. It can be added in a 1.x release.

**Not taken.** Own accessors that are not enumerable: one line, the same
visible change for `Object.keys` and JSON, none of the gain in time and
memory, and `this` then needs a filter to match the store. Keeping today's
shape, which no report supports.

**Evidence.** `spike-snapshots.md`, N2, form A with S1 of the trap spikes.
122 lines added, 58 removed, in five files; 239 bytes. 14 tests change with
S1: fixes, except that the eight tests of today's shape change by decision.
`persist` saves the same fields as before. The base class of decision 11
gets a correct snapshot on top of it, in one build. `spike-combos.md`, K3,
for `devtools`, on a build with this decision, decision 44 and the entries
of decision 27: 29 lines in `devtools.ts`, 95 bytes on `./utils`, no test
changes. A jump that carries the added keys back restores the fields and
adds no key. Not run: the real Redux DevTools extension.

The 239 bytes and the 14 tests are those of the spike, which was built on
today's snapshot layer. Decision 10 changes that layer first, and the two
patches do not apply on each other, so both figures are a forecast and stage
4 takes its own from its own build.

**Label.** Before 1.0. **Stage 4:** yes. The React tracking path is where
the risk is: a tracked read and a plain read have to share one cached
result.

### 44. A snapshot keeps a cycle

**Decision.** `snapshot()` of a store that refers to itself returns a frozen
snapshot with the same cycle in it, where it throws today (finding 8, M36).
The React hook, `withHistory` and `cloneSnapshot` are made safe for it.

**Why.** Today the write that closes a cycle succeeds and the store can then
not be read by any adapter. Refusing that write would need a walk from the
new parent to the roots on every assignment of an object, and would also
have to reject a cycle already in the object given to `createClassyStore()`,
which works on the live side today.

**What it needs.** The restore of decision 30 walks into live objects, and
on a cycle it has to stop. The two were first spiked apart. Built together,
an undo overflowed the stack; with the mark decision 30 now carries, it
returns. The line this decision's spike added to `history.ts` moves into the
restore function that undo, redo and a DevTools jump share.

**What it costs a user.** Everything on a cycle gets a new snapshot on every
write to any of it, so a model with parent pointers loses structural sharing
for what the pointers connect. The docs say so and name the alternatives:
hold the parent's id, or hold the parent in an object the store does not
proxy. `JSON.stringify` of such a snapshot throws, as for any cycle, and
`persist` reports it through `onError`. In the DevTools panel, a class store
with a getter and a cycle shows its root once more under the field that
points back, because what `devtools` sends for such a store is a copy
(decision 43).

**Evidence.** `spike-snapshots.md`, N3. The main entry is 9 bytes smaller,
`./utils` 21 larger, `./react` 30 larger. 7 tests change, all of them
asserting the throw. The guard costs a tracked comparison 14 to 29
nanoseconds on data without a cycle. Not checked: what the Redux DevTools
extension does with a cyclic state.

**Label.** Before 1.0: it reverses a documented sentence. **Stage 4:** yes.

### 45. Snapshot types: tuples stay tuples, and a collection snapshot has no mutators

**Decision.**

- `Snapshot<[string, number]>` is `readonly [string, number]` (finding 14,
  M41).
- `Snapshot<ReactiveMap<K, V>>` and `Snapshot<ReactiveSet<T>>` are two
  exported types with the queries and the iterators and without `set`,
  `add`, `delete` and `clear`. Calling a mutator on a snapshot, through a
  tracking proxy, or on a collection its owner froze throws a `TypeError`
  with the code of decision 35 (finding 16, M42).
- The backing arrays `_entries` and `_items` stay public, read-only in the
  snapshot types (finding 15, M43). The docs say that writing to them
  directly, on a live collection, is unspecified: use the methods.

**Why.** A snapshot is frozen, so a mutator in its type promises something
that throws. One case is worse than a throw today: `add()` on a set that its
owner froze and placed in a store pushes to the raw array and tells no one.
The backing arrays stay because the repository's own Next.js example reads
them from snapshots in four components, and hiding them is a migration with
nothing behind it.

**A subclass of a reactive collection** works at run time, and its own
members are not in its snapshot type in 1.0: `Snapshot<Tags>` is the snapshot
type of the collection it extends. A way for a class to name its snapshot
type is an addition and can follow.

**Evidence.** `spike-snapshots.md`, N4. No unit test changes. Type tests in 3
files change, all fixes. `./collections` grows by 55 bytes with a short
message.

**Label.** Before 1.0: public types. **Stage 4:** yes.

### 46. A snapshot after one row changes still rebuilds the list

**Decision.** Not changed in 1.0 (finding 2, M35). Recording which keys
changed and rebuilding only those is correct and can follow in a 1.x
release.

**Why.** On Node it makes a snapshot after one of 1,000 rows changes three
times faster. On Bun, and so most likely in Safari, it gains nothing at that
size, because freezing a new 1,000-element array costs about 80 microseconds
there by itself. It costs 270 bytes, for arrays only. Decision 37 already
removes the worst case for three of the five adapters without it.

**Evidence.** `spike-snapshots.md`, N1: no difference in 120,000 compared
snapshots; 8 tests and 9 type errors, all of which read an internal map.

**Label.** Can follow 1.0. **Stage 4:** no.

## Adapters and collections

### 37. The Vue, Angular and Solid adapters build the snapshot when it is read

**Decision.** In these three adapters the listener only marks the value as
changed, and the snapshot is taken at the next read (M63).

**Why.** Every adapter takes a snapshot inside its listener today, so a loop
of direct writes takes one snapshot per write. With the change, 2,000 direct
row writes followed by one read go from about 650 milliseconds to 2.4 in each
of the three. React and Svelte cannot defer in this way, because their
contracts hand the value to the framework at once; for them the answer is
`batch()`, which the guides name.

**Evidence.** `adapters-collections.md`, A1. 34 to 44 bytes per entry. 1 test
changes, incidental: `isShallow` on the Vue ref.

**Label.** Before 1.0 for Vue: the reference says the adapter returns a ref
"backed by `shallowRef`", and it becomes a custom ref that `isShallow()` can
tell apart. The sentence changes in the same commit. Can follow 1.0 for
Angular and Solid. **Stage 4:** yes. Each adapter change runs its
framework's packed-app and browser suite, which the spike did not.

### 38. Vue: no listener is left by a server render, and the ref is read-only

**Decision.** On the server the Vue adapter subscribes to nothing and reads
the store at every read. The returned ref is typed
`Readonly<Ref<Snapshot<T>>>`, and a write to it throws a `TypeError` with a
code.

**Why.** Vue does not dispose component scopes during a server render, so a
store that outlives the request gains one listener per render (M64). The fix
stage 2 proposed, subscribing in `onMounted`, removes the leak and breaks
something else: a store written in `onServerPrefetch`, Vue's own way to load
data on the server, then renders its old value. Reading at the read removes
the leak and keeps that write. A snapshot is frozen, so a writable ref
promises something the value cannot do (finding 17, M65). The spike made the
setter do nothing, which is a silent failure for a template or a JavaScript
caller; a throw is the loud form.

**Evidence.** `adapters-collections.md`, A2: 0 listeners after three server
renders against 1, 2, 3, and the `onServerPrefetch` write still renders. The
type was not compiled against Vue 3.2.0, the floor of the peer range; stage 4
does that first. The throwing setter is not spiked.

**Label.** Before 1.0, for the documented return type. **Stage 4:** yes, in
one change with decision 37 for Vue.

### 39. Angular: a store write inside a `computed` is not lost, and `injectClassyStore` takes an injector

**Decision.** The adapter updates its signal inside `untracked()`.
`injectClassyStore(store, {injector})` works outside an injection context.
The adapter checks for an injection context itself and throws its own error,
with the prefix and a code, in every Angular build.

**Why.** Today a store write made while a `computed` runs makes Angular
throw inside the listener; the core logs it and the signal stays stale until
the next write (M66). The option is an addition, and is cheapest to add
while the signature is being written down for 1.0 (M67). The spike called
Angular's own assertion, whose message names the function only in Angular's
development mode; in a production build it is a bare `NG0203`.

**Evidence.** `adapters-collections.md`, A3. 19 bytes for the fix, 51 more
for the option and the message. The library's own check is not spiked.

**Label.** The fix: can follow 1.0. The option: an addition. **Stage 4:**
both.

### 40. The adapter names stay

**Decision.** No adapter is renamed (API question 7, M68). The Solid adapter
keeps `useClassyStore`.

**Why.** Two reports lean towards `fromClassyStore` for Solid, because the
adapter behaves like Solid's `from()` and `use*` there usually means a
context lookup. The Solid report disagrees: the function has to be called
under an owner and returns an accessor, which is what a Solid user expects
of it. Where the precedent is split, a rename is a cost with no behaviour
behind it: eleven files and every Solid import. The name is also the one a
user of the React or the Vue adapter already knows. The same reasoning keeps
`isEqual` (decision 41).

**Also.** The Svelte guide gets a section on runes (M69) and names its
example value `snap`, not `state`.

### 41. React: `prepareStoreForHydration` stays an explicit call

**Decision.** The server snapshot is not captured automatically (M70). The
equality option keeps the name `isEqual` (M71). The guide says that on the
client `prepareStoreForHydration(store)` is called before `persist(store)`.

**Why.**

- Both automatic forms were built, and both break the pattern the guide
  teaches: create the store, load the request's data, then render. The
  capture fires on the first load write, so the server renders the empty
  store, and a later explicit call cannot undo it. A store that refers to
  itself throws on its first write or cannot be created. Memory grows by 19
  megabytes per 100,000 rows. 12 and 20 tests fail, all regressions.
- With decision 19, a store restored by `persist()` holds its saved state
  when `persist()` returns. Prepared afterwards, it would capture that state
  and not the one the server rendered. Hence the sentence in the guide.
- React's own `useSyncExternalStoreWithSelector` calls the parameter
  `isEqual`. Zustand and Jotai say `equalityFn`. A breaking rename for a
  split precedent is not worth it.

**Evidence.** `adapters-collections.md`, A5.

### 42. Reactive collections: one membership rule now, an index for snapshots, native `Map` and `Set` stay opaque

**Decision.**

- **One membership rule** (findings 33 and 34, M39). `-0` and `+0` are one
  key, as in a native `Map`, and a collection constructed from a raw object
  and its proxy holds it once.
- **Membership is by identity for every member**, as today: a raw object,
  its proxy and each of its snapshots are one member. That is what keeps a
  selection that was made with one snapshot of a row true for the next. The
  price is that a collection cannot hold two snapshots of one object as two
  members: the second `add()` changes nothing, and the guide says so. A list
  in a store does not work this way (decision 6).
- **A snapshot of a collection answers `has()` and `get()` from an index**
  (M40), built on the second lookup. A read through the tracking proxy of
  the React hook without a selector still scans, because the tracker has to
  see what was read.
- **No index beside the live array in 1.0.** It is 100 times faster on a hit
  and costs 339 bytes, and it answers wrong after a write to the raw backing
  array, which today's scan gets right. Decision 45 keeps the backing arrays
  public and says that writing to them directly is unspecified, which leaves
  room for it later.
- **Native `Map` and `Set` stay opaque** (API question 5, M38), and
  `reactiveMap` and `reactiveSet` stay separate classes. No library has a
  frozen native `Map`: one can still be written through `Map.prototype.set`.
- **Three adapters drop their `active` flags** once decision 13 is in,
  because the core then skips a removed subscriber: Vue, Angular and Svelte.
  Solid keeps its flag, which under decision 37 decides what the accessor
  returns after disposal, and Angular keeps its `destroyed` check.

**Evidence.** `adapters-collections.md`, A6 and A7. The membership rule: 13
bytes, and the 2 tests that pin findings 33 and 34 change. The snapshot
index: plain lookups among 10,000 members go from 160 to 525 microseconds to
under 0.1, and `./collections` grows from 727 to about 843 bytes. A tracked
lookup was not timed.

**Label.** The membership rule: before 1.0, because the collections guide
documents today's `-0`. The index: can follow 1.0. **Stage 4:** both, and
the flags in the adapter commits that follow decision 13.

## Diagnostics

### 35. Every error carries a stable code, and throws the same in every build

**Decision.** An error or a logged report from the library reads
`@codebelt/classy-store [code]: facts`, where the code is a short string such
as `getter-cycle` and the facts are the names the user wrote. The advice
that goes with each code is on one page of the documentation. Codes are
stable from 1.0: renaming one is a breaking change, adding one is not. No
error subclass and no `code` property are added. No check throws in one
build and not in another.

**Why.**

- Message text is where the bytes are. Of the 625 bytes the first-wave
  changes add to the main entry with their messages as written, 271 are
  text. About 100 of those belong to messages this document keeps, and a
  code with the names saves them with no build split at all; the rest
  belonged to refusals that are not taken. A split saves no more on
  messages.
- A program that fails in production and not in development, or the other
  way round, is worse than either. So the bound on delivery rounds and the
  cycle check on snapshots stay in every build.
- The three messages the library has today get codes at the same time,
  because tests and users match on that text and it should change once.

**Evidence.** `devbuild.md`, B1 and B2. 29 assertions in 15 test files match
today's text and are rewritten to match the code; that count is from a
search, not from a run.

**Label.** Before 1.0. **Stage 4:** yes, with each change that adds a
message, and once for the existing three.

### 36. One build, and one development-only check in 1.0

**Decision.** 1.0 ships one build. It has one check that runs in
development only: the report of a lost write. When a snapshot is asked for
and a field of the raw object has changed without a write through the store,
the library logs it once, with the code `lost-write` and the name of the
field. The comparison runs at most once per task for a store, however often
its snapshot is asked for in that task. Other warnings follow in a 1.x
release. Export conditions are not used.

**The cost limits come first.** The core benchmark loads the built file as
it is, with `NODE_ENV` not set, so it measures the development path, and it
keeps doing so. The limits of `CONSTRAINTS.md` have to hold there with the
check in. As it was spiked, the check compares the fields every time a
cached snapshot is handed out, which is eleven to thirteen times dearer and
would put the cached-snapshot ratio far above its limit on both engines
(objection 3 of the second review). Once per task, a loop of reads pays for
one comparison. That form was not built.

**The benchmark has to be able to see it.** Each sample of the benchmark is
one loop in one task, so a check that runs once per task costs a sample one
comparison, and the limits hold whatever that comparison costs (objection 10
of the third review). An application takes about one snapshot per store per
task and pays for the comparison each time. So stage 4 first adds a row to
the benchmark that takes one cached snapshot per task of the 1,000-row
store, and records it without the check. The check lands only if that row
with the check in stays below the benchmark's `snapshot.afterWrite` for the
same store, on both engines: a render in development then never costs more
for the check than it costs after a write. The figure goes into the decision
record as the stated cost of the development path. If the check cannot meet
that, it does not ship in 1.0; it is a report and can arrive in any release.

A development-only check is guarded by an inline read of
`process.env.NODE_ENV` at its call site, after a test that is cheap and
almost always false, and behind `typeof process`. That form becomes a floor
rule of `CONSTRAINTS.md`, held by a test that bundles the built file for
production and asserts that no development text and no `console.warn` is
left in it.

**Why.**

- An arrow-function method that writes to the raw instance is the first
  silent failure the plan names. The base class of decision 11 removes it
  only for a class that is changed to extend it;
  `createClassyStore(new X())` stays documented, and a class that extends
  something else has no other way. The lost-write report covers those, and a
  constructor that starts a timer, and a write through the raw object.
- It is precise. In its spike it found six of seven lost writes and reported
  nothing that was not one.
- It cannot be always on, and it cannot run on every read: it makes a
  cached snapshot eleven to thirteen times dearer, and it is 168 to 309
  bytes. Behind the guard it costs production a few bytes, and "this store
  was already checked in this task" is the cheap test the guard form asks
  for in front of the read of the environment.
- The other candidates are not ready. A warning that fires for correct code
  and cannot be silenced is worse than none: the one for an unmarked class
  instance fires for seven kinds of object that are no mistake, and one for a
  write after an `await` would fire for the ordinary `async` method. A
  warning changes no behaviour, so those can arrive in any release.

**What 1.0 still does not catch.** The docs page of decision 35 lists these
beside the codes, so that they are written down in one place: a native `Map`
or `Set` in a store, an unmarked nested class instance, a `Date` changed in
place, a getter that reads another store or a static, a result of a getter
that is mutated, a named property on an array, an own-property check inside
a getter, and a prototype changed after its first read through a store.

**What follows for other entries.** The default of `devtools({enabled})`
reads the same environment (decision 27). `batch()` gets a check that needs
no build split (decision 16).

**Not taken.** Export conditions (`development` and `production`): plain
Node, `bun test` and an unminified bundle would load the production build in
silence, the published files double, and `check:package` does not check the
second branch. Shipping the five warnings the development-build report
spiked, for the reason above.

**Evidence.** `devbuild.md` for the guard and its traps: a module-level
constant leaked 218 bytes into production where an inline read cost 6, and an
inline read on the path of a write cost 184 nanoseconds on unbundled Node.
`spike-classes.md`, C4 (b), for the check. The check was measured always on,
not behind the guard; stage 4 measures it there first.

**Label.** The guard's rule and the default of `devtools`: before 1.0. The
check: can follow 1.0. **Stage 4:** yes.

## The release workflow, dependencies and documentation

### 32. The workflows are hardened now; the release job is split after 1.0

**Decision.**

- **In stage 4:** every third-party action in every workflow is pinned to
  the commit its tag points to today, with a Dependabot configuration that
  keeps the pins current. The three workflows that declare no permissions
  get `contents: read`. Neither changes what a run does.
- **After 1.0:** `release.yml` is split into a job that installs, builds,
  runs Changesets and packs the tarball, and a job that holds
  `id-token: write`, installs nothing and publishes that tarball. The plan
  for it names where each step goes, the tag step and the "already
  published" check included, and sets `persist-credentials: false` on the
  release checkout with the token passed to the push. The owner tries it
  with a manual run before a release depends on it.

**Why.**

- Today one job holds the publishing identity and also runs `bun install`,
  the build and Changesets. A compromised development dependency or a moved
  action tag could take the token and publish a version of its own. The
  split closes that route. It does not close the other one: the same code
  could rewrite `dist` before it is packed, and the second job would publish
  that. Pinning closes the moved-tag half of both.
- A release workflow cannot be tried without releasing, and no agent runs
  it. If the split landed in stage 4, its first run would be the publish of
  1.0. Nothing about the split has to ship with 1.0, so it does not.

**Only the owner can do** two steps of the later split: a GitHub environment
for the publish job with a required reviewer, and the npm settings that
accept only that environment and refuse publishing with a token.

**Evidence.** `review/stage-2/security.md`, finding 12 (M74);
`adversarial-whole.md`, objection 6. That code in the job can take the token
comes from how GitHub and npm document the mechanism; nobody tried it.

**Label.** Can follow 1.0. **Stage 4:** the pins and the permissions only.

### 33. Dependencies

**Decision.** `proxy-compare` stays pinned to an exact version, and
`CONTRIBUTING.md` says why. CI gets a `bun audit` step that reports and does
not fail. The published tarball is accepted as it is (M75).

**Stage 4:** yes.

### 34. Documentation

**Decision.** The documentation changes listed under M76 are made in stage
4, each with the code change it belongs to, or in stage 5 where no code
changes. The limits listed under M77 stay as they are and go into the
unspecified list or stay documented where they are documented.

Two more sentences go into the reference:

- **An array in a store carries its indices and `length` only** (M37). A
  named property written to one stays on the live array and is left out of
  every snapshot. A check that reports it can follow in 1.x.
- **A spread or a serialised snapshot carries data, not computed values**
  (decision 43), with the same sentence in the changelog entry for 1.0,
  because code that spreads a snapshot today changes without an error.

## What 1.0 guarantees, and what it leaves unspecified

Stage 1 added 547 tests that pin what the library does today.
`review/stage-3/pinned.md` sorts the behaviours behind them into 250 rows: 56
the docs already promise, 47 that are defects, and 147 that needed a label.
Its table is the evidence. This section is the decision.

A guarantee is written as a rule, not as a row. A rule is documented, and
changing it is a breaking change. Everything not covered by a rule here or
by a sentence in the reference is unspecified, and may change in a minor
release. The stage 1 tests stay; a test of unspecified behaviour is a change
detector, and its file says so.

### Guaranteed

1. **Subscribers.** The subscribers of one node are called in the order they
   subscribed. A subscriber hears only writes made after `subscribe()`
   returned, and none after its unsubscribe function returned. A subscriber
   that throws leaves the write applied, the other subscribers called and
   itself subscribed; the code that wrote is never told, whatever the console
   does.
2. **Transactions.** A method, a setter, an array method and `batch()` each
   notify synchronous subscribers once, when the outermost call returns, and
   that covers every store written inside it. An `async` method is a
   transaction up to its first `await`; each write after it is a write of
   its own. A write that changes nothing notifies no one. Decision 1 says
   which functions are methods.
3. **Delivery.** A write made while synchronous subscribers are being called
   is delivered to them after the round that is running, and before the
   outermost write returns, for up to 100 rounds. A write made inside a
   batched subscriber is delivered to batched subscribers in the same
   microtask, after the round that is running.
4. **Getters.** A getter is lazy. It returns the same result while nothing it
   read through `this` changed, and a correct one after anything it read
   changed. An own-property check (`Object.hasOwn`, `hasOwnProperty`) is not
   a read in that sense. A cycle of getters throws, and the other getters
   keep working. A getter that writes to the object it is computed on
   throws a `TypeError`, on the store and on a snapshot, whichever way the
   write gets there.
5. **Snapshots.** The root of a snapshot, and every plain object, array and
   reactive collection in it, is frozen. A value the store does not proxy (a
   class instance without the marker, a native `Map`, `Set` or `Date`, a
   function) is shared with the snapshot by reference, and an object a getter
   returns is not frozen. A subtree that did not change and is not on a
   cycle keeps its snapshot object. Taking a snapshot runs no getter.
6. **Identity.** One object has one proxy, however it is reached through the
   store's proxies and in however many stores it sits. Two ways of reaching
   an object hand it out as it is, with no proxy: through an object that was
   frozen before it reached the store, and through a read-only property that
   was defined with the object as its value. `createClassyStore()` on a
   proxy, or on the raw object behind one, returns that proxy. A value the
   store does not proxy reads back as itself. A function that decision 1
   makes a method reads back through the store as one function for that
   object, the same on every read; the object and its snapshots hold the
   function that was written.
7. **An object that has left the store** stays a working store of its own:
   reads, writes, subscriptions and snapshots work, and the store it left is
   no longer told. Put back, it is the same proxy.
8. **The native rules of an object hold through a store**: key order, holes,
   `TypeError` on a refused write, `false` from `Reflect`, and the meaning of
   sealed and frozen.
9. **Memory.** The library keeps no strong reference to a store that nothing
   else references, or to a subscriber after its unsubscribe function was
   called, in a runtime that has `WeakRef`.
10. **`persist`.** A handle writes only after it has read. A stored record
    is removed or replaced only in these cases: its time has elapsed;
    `clear()` is called; a save follows a restore of that record; a save
    follows no record, a record with nothing to keep, or a record of a lower
    version when no `migrate` is given (decision 21 says which). A record of
    a newer version, one that the application's `migrate`, `merge` or
    `deserialize` failed on, and one whose read failed, is reported and is
    not written over by the handle that read it. Two cases are outside this
    rule, and the guide names them: a tab that read before a newer build
    wrote, and does not sync, writes over the newer record; and a `migrate`
    that returns a wrong result without throwing is saved at the next edit.
    An edit made before or during the first read is kept in the store, and
    saved unless the record is one the handle does not write over. The
    first `save()` or `clear()` of a task reaches a synchronous storage
    before it returns. After `dispose()` nothing is read, written or
    scheduled.
11. **Exports.** Every export the reference lists exists with its documented
    signature. The list may grow in a minor release.
12. **Error codes.** The code in an error or a logged report is stable.

### Unspecified

- The order in which different nodes, owners and stores are notified
  (findings 24 and 69).
- How calls nest when a subscriber writes, which microtask a batched round
  runs in, and what an adapter of another store shows inside one delivery
  round.
- Where a subscriber's error is reported, and the text of an error message
  after its code.
- Whether a getter re-runs more often than rule 4 requires, and whether a
  thrown error is cached.
- What a getter does that writes to another object of the same store: a
  child, a parent or the root. Today's answer is that it works on the store;
  on a snapshot a write to a child throws in strict code, and a write to a
  parent reaches the live store.
- What a prototype that is changed after its first read through a store
  does (findings 44 and 47). Decision 12 gives the answers of the form
  taken, which differ from today's in two places.
- What a function does when it is read from a snapshot and called. Today's
  answers: a method of the class or of an object literal that writes `this`
  throws, and an arrow-function field of a `ClassyStore` subclass writes the
  live store without a transaction (decision 1).
- What reflection hands out: `Object.getOwnPropertyDescriptor(store, key)`
  and `structuredClone(store)` (findings 50 and 51).
- Anything reached through the raw object behind a store (finding 11), and
  a write to the backing array of a reactive collection. One case of it is
  named in decision 1: a property made read-only on the raw object after
  the store has handed out its method throws on the next read.
- A store made from a function or from a typed array (findings 62 and 63).
- Behaviour in a runtime without `WeakRef` or `FinalizationRegistry`, beyond
  "it works" (finding 68).

### Where this differs from `pinned.md`

- **Functions.** `pinned.md` recommends wrapping every function a store
  holds, on every read. Decision 1 does that for every function held in a
  field but a class, as that report asks. The rows that pin a new wrapper
  for an element of a list and for a class held as a value change.
- **The shape of a snapshot.** The rows that pin a class getter as an own key
  of a snapshot, and `Class.prototype` as its prototype, change with decision
  43. The rows that pin the throw on a cycle change with decision 44.
- **Accessors of an object literal and of a class** are labelled the same
  and guaranteed there. On the store they still are. On a snapshot they
  differ after decision 43: a getter of an object literal is an own key,
  carried by a spread and by JSON, and a class getter is neither. The
  tutorial says where the two differ.
- **The ownership rows** are folded into rule 7. The order in which removed
  containers hear of a write stays unspecified.
- **The type tests fail when an export is added.** They stay as change
  detectors, and rule 11 says what is promised.

## Proposed in a report and not taken

Each is named in the entry it belongs to. In one list, with **(final)** on
the ones that 1.0 settles for good, because taking them later would break a
consumer:

- Four other rules for a function held in a field (M1): "strict", under
  which only a function on the prototype chain is a method; "lenient" as
  first spiked, which wraps every function on every read and keeps a copied
  wrapper and a stale getter; "born with", which writes the store's wrapper
  into the object; and every function with a `prototype` of its own as
  data. Decision 1 keeps the object as it is, hands out the method on a read
  through the store, and treats only a class as data. **(final)**
- The rule for functions without its short path, which asks for a
  descriptor at every read of a function (decision 1).
- Refusing accessor and read-only definitions, `setPrototypeOf`, or
  `Object.freeze(store)` (M2, M8). **(final)**
- A Proxy target of the library's own (M7): both reports that describe it
  call it too large for 1.0, and it reopens decisions 2 and 7.
- A guard for a raw object frozen behind the store (M7).
- Array methods run on the raw array (M10): unmeasured on this library, and
  decisions 10 and 12 attack the same cost.
- Wrapping nested class instances by default (M11). **(final)**
- Detecting an arrow function by its source text, an `opaque()` helper and
  a mixin form of the base class (M12).
- Removing suspension as a whole (M14), and holding a subscribed node
  strongly (M15).
- Recording reads outside a getter's own node (M21), and caching a thrown
  error (M22).
- Throwing a subscriber's error to the writer (M28). **(final)**
- `reportError()` as the place a subscriber's error is reported (M28).
  Where the report goes is unspecified, so this can still change.
- A subscriber that does not hear of its own write, and a microtask of its
  own for each batched round (decision 13). **(final)**: guarantee 3 states
  the other choice.
- Dropping a write that is undone inside a batch (M30): one notification for
  a batch that wrote is the simpler rule.
- A synchronous default for `subscribe()` (M31). **(final)**
- A warning for a write outside a method (M32).
- Own accessors that are not enumerable, as the form for snapshot getters
  (M33).
- Rebuilding only the changed keys of a snapshot (M35), in 1.0.
- Refusing the write that closes a cycle (M36). **(final)**
- Reactive native `Map` and `Set` (M38), and an index beside the live array
  of a collection (M40), in 1.0.
- Hiding the backing arrays `_entries` and `_items` (M43). **(final)**
- A `'migrate'` value for the public `PersistOperation` type (M45).
  **(final)**: a new member of that union would break a consumer's
  exhaustive `switch`.
- Awaiting an `async` `migrate` (M45). Accepting later what is refused now
  is a compatible change, so this is not final.
- Writing over a record of a newer version, or over one that could not be
  migrated or merged, at the next save (decision 21). **(final)**
- Writing a migrated record back at load (M47), and a handle that saves
  before it has read (decisions 21 and 24). **(final)**
- A handle with `skipHydration` that only looks at the stored version before
  its first save: it would still write the defaults over a record it could
  have restored.
- An optional `storage`, removing `clearOnExpire`, a pause switch and an
  in-flight flag for `persist` (M46, M49, M55).
- Refusing a cross-tab event that has no `storageArea` (M53).
- One snapshot per direct write on the synchronous channel of `devtools`
  (M57), a naming hook that runs on every method call, and the getter values
  of nested objects in what `devtools` sends, in 1.0.
- `devtools` on by default in every environment (decision 27). **(final)**,
  as every default is.
- A table per prototype that caches the whole descriptor of a getter (M9),
  one that never records an absent key, and one that leaves out
  `Object.prototype` and `Array.prototype` (decision 12).
- A selector form of `subscribeKey` (M62), in 1.0.
- Renaming the Solid adapter (M68) or `isEqual` (M71), and capturing the
  hydration snapshot automatically (M70). **(final)** for the two names.
- Export conditions for a development build, and four of the five warnings
  the development-build report spiked (M72, M73).
- Splitting the release job before 1.0 (M74).

## Every merged issue, and where it is decided

| Issues     | Decision | Issues     | Decision | Issues   | Decision |
| ---------- | -------: | ---------- | -------: | -------- | -------: |
| M1         |        1 | M28        |   13, 14 | M56, M57 |   27, 30 |
| M2, M8     |        2 | M29        |       15 | M58      |       28 |
| M3         |        7 | M30        |       16 | M59      |       29 |
| M4         |        8 | M31        |       17 | M60      |       30 |
| M5         |        6 | M32        |       18 | M61, M62 |       31 |
| M6         |        5 | M33, M34   |       43 | M63      |       37 |
| M7, M13    |        9 | M35        |       46 | M64, M65 |       38 |
| M9         |       12 | M36        |       44 | M66, M67 |       39 |
| M10        |     None | M37        |       34 | M68, M69 |       40 |
| M11, M12   |       11 | M38 to M40 |       42 | M70, M71 |       41 |
| M14 to M17 |        3 | M41 to M43 |       45 | M72, M73 |   35, 36 |
| M18 to M22 |       10 | M44        |       22 | M74      |       32 |
| M23        |        7 | M45, M46   |   21, 26 | M75      |       33 |
| M54        |       20 | M47, M50   |       24 | M76, M77 |       34 |
| M55        |     None | M48, M49   |   19, 26 | M51, M52 |       23 |
| M24 to M27 |       10 | M53        |       25 |          |          |

"None" means the proposal is in the list of what is not taken.

**Stage 1 findings that no merged issue covers.** Finding 4 (two traps of
the React snapshot cache that cannot be reached) is in decision 20. Findings
13, 35 and 40 are behaviour that stays: a getter on a store that refers to
itself recomputes on every write, a snapshot used as a key of a collection
answers for the live row, and an object a getter returns is not protected.
Finding 59 is in decision 20.

## The order for stage 4

One change per commit, test first, each measured against the stage 1
baselines. Stage 4 writes each change again from its decision; it applies no
spike patch. The order follows what each change touches and what it needs.
The task list that follows refines it.

1. **Tooling.** The ceilings in `budgets.json`, the size script and the
   floor guard with their tests (decision 4), with the decision record. The
   guard form for a development-only check as a floor rule, with the test
   that bundles the built file for production (36): decision 27 uses that
   form long before the check of decision 36 itself.
2. **Codes, and code that is dead today.** The three messages the library
   has today get codes, and the page of codes is created (35). From here on
   every commit that adds a message adds its code and its line on that page.
   Then the dead lines (20).
3. **The core, reads and writes.** The walk (3). The table per prototype
   (12), which tells the trap "own or inherited" before decision 1 asks. The
   delete (8). `defineProperty` as a write (2). Then, as its own commit, raw
   values on write with the child kept through a freeze (5). The rule for
   functions (1). The searches (6). The realm guard (9).
4. **Getters.** One kind of dependency and the rest of decision 10, which is
   the first change built on the table of decision 12 that no spike ran
   together with it. Then the `has` and `ownKeys` traps (7), which add two
   records in that one shape.
5. **Snapshots.** Class getters on a derived prototype, with `this` (43).
   Cycles (44). The types (45).
6. **Delivery.** The queue (13), the report that cannot throw and the
   rejection handler (14), the setter (15), `batch()` (16).
7. **Collections.** The membership rule and the snapshot index (42).
8. **Utilities.** `persist` (19, 21 to 25). `devtools` (27), with the hook
   in the core and the getter values it sends (43). Restore in place (30),
   which takes over the line decision 44 added to `history.ts`. `history`
   (28, 29). `subscribeKey` (31).
9. **The base class** (11), which needs 1, 2 and 30, and with it the tests
   that need it: the rows of decision 1 for an arrow-function field (one
   transaction, the overriding field under both ways of compiling, its
   name, and a call taken from a snapshot), `persist()` called in a
   constructor (19), and a getter read on a snapshot that calls an
   arrow-function method (10).
10. **Adapters.** Vue (37, 38). Angular (37, 39). Solid (37). The `active`
    flags of Vue, Angular and Svelte (42).
11. **The lost-write check** (36), measured against the cost limits before
    it lands.
12. **The repository.** The audit step and `CONTRIBUTING.md` (33). The pins
    and permissions of the workflows (32).

A change that makes other code dead removes it in the same commit (20).
Documentation changes go with the change they describe (34).

## Objections and answers

Agents that took no part in the spikes or in writing this document reviewed
it as adversaries, in rounds. Every objection was checked against the text
and its evidence. None was dismissed as noise.

### The first round

Three reviewers read the first complete draft:
`review/stage-3/adversarial-whole.md` (W), `adversarial-core.md` (C) and
`adversarial-edges.md` (E). They raised 58 objections; 28 were rated
"wrong", 4 "mislabelled", 13 "unsupported" and 13 "unclear".

"Changed" means the entry was rewritten to answer it. "Changed after a
spike" means the objection could not be settled by reading, a spike was run
for it, and the entry was decided again from the result. "Accepted" means
the objection is right, the cost is taken on purpose, and the entry now says
so. The number in brackets is the decision that carries the change.

| No. | Against        | Objection                                                                                  | Answer                                                                                                                                     |
| --- | -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | 30, 44         | Undo on a store with a cycle never returns                                                 | Changed after a spike: the restore enters each object once (30); six stores with a cycle undo, redo and jump                               |
| W2  | 27             | Named entries need the synchronous channel the entry ruled out                             | Changed: 27 says what the spike did; 17 no longer lists `devtools` as batched                                                              |
| W3  | 11, 30         | The base class is ordered before the restore it needs                                      | Changed: the base class follows the utilities in the order                                                                                 |
| W4  | 4              | Nothing enforces the ceilings, and one record switches the guard off                       | Changed: stage 4 starts with the tooling; the guard works per commit                                                                       |
| W5  | 4, 45          | The collections ceiling rests on 32 bytes where the report says 55                         | Changed: 55, and a ceiling of 950                                                                                                          |
| W6  | 32             | The split does not stop a rewritten `dist`, and its first run would be the 1.0 publish     | Changed: pins and permissions now, the split after 1.0, and the "why" corrected                                                            |
| W7  | 20             | Dead code removed last breaks the mutation rule in between                                 | Changed: dead code goes in the commit that makes it dead                                                                                   |
| W8  | 1              | An object-literal method stops being a transaction, in silence                             | Changed after two spikes: a method in an object literal is a transaction again under decision 1 as it now stands                           |
| W9  | 36, 11         | Thirteen silent failures remain in 1.0, and the base class covers only classes that change | Changed: one development-only check is decided for 1.0, on a stated condition (36); the rest are listed in the docs. Accepted for the rest |
| W10 | 27, 36         | `enabled: true` is locked in for all of 1.x                                                | Changed: on, except where `NODE_ENV` is `production`                                                                                       |
| W11 | 42, 37         | Solid's flag cannot go, and the change sits in two steps                                   | Changed: Vue, Angular and Svelte drop theirs; one place in the order                                                                       |
| W12 | 8, 9, 28, 37   | Four labels contradict the definition                                                      | Changed: 8, 9, 28 and the Vue half of 37 are "before 1.0"; 9 ships in 1.0                                                                  |
| W13 | Guarantees     | Rules 2, 3 and 5 are false as written; "error text" contradicts the stable codes           | Changed: the rules are rewritten, and rule 12 added                                                                                        |
| W14 | 20, 24, 28, 34 | Finding 4 and M37 are decided nowhere; 24 and 28 have no decision text                     | Changed: finding 4 in 20, M37 in 34, both texts written                                                                                    |
| W15 | Not taken      | The list misses choices that 1.0 makes final                                               | Changed: completed, with the final ones marked                                                                                             |
| W16 | 4, 35          | The figures disagree, and the set was never built or timed                                 | Changed: one sum, 5,255 and 44% after the second set of spikes; the entry says the ceilings are estimates                                  |
| W17 | 4, 27, 9, 7    | Four items buy little for their bytes, and the hook costs every method call                | Changed: 4 weighs each. The hook is replaced by a slot that costs a method call nothing measurable (27)                                    |
| W18 | 43             | What `devtools` sends for computed values was never built                                  | Changed after a spike: built and counted, 95 bytes on `./utils` (43, 27)                                                                   |
| C1  | 30, 44         | The same as W1, reproduced on the library                                                  | Changed, as W1                                                                                                                             |
| C2  | 5              | After a freeze through the store a child reads back raw and its writes are lost            | Changed after a spike: the trap puts the proxy in the raw slot before the property locks (5). Two cases stay raw and are stated            |
| C3  | 11             | One function in two stores writes the first store                                          | Changed after a spike: one method per object and function (1)                                                                              |
| C4  | 11             | A subclass that overrides an arrow method loses the transaction                            | Changed after two spikes: an arrow field is a method when it is read through the store, whichever way it was written (1)                   |
| C5  | 11             | The same as W3                                                                             | Changed                                                                                                                                    |
| C6  | 12             | A getter redefined on the class keeps its old body on the live store                       | Changed after a spike: the table holds no function (12)                                                                                    |
| C7  | 6              | A list of saved snapshots gets wrong answers from the searches                             | Changed after a spike: a value is found by reference, an object in a store by any form (6)                                                 |
| C8  | 7              | `Object.hasOwn(this, …)` in a getter stays stale, against rule 4                           | Changed: 7 and rule 4 name it as not tracked. Accepted: a trap for it can follow                                                           |
| C9  | 43             | The same as W18                                                                            | Changed, as W18                                                                                                                            |
| C10 | 43             | A spread loses computed values with no error                                               | Accepted: every compared library does this; 34 adds the sentence and the changelog note                                                    |
| C11 | 43             | `this` does not have the store's prototype                                                 | Changed: the sentence says keys, constructor and `instanceof`                                                                              |
| C12 | 10             | The throw on a snapshot holds in strict code only                                          | Changed after a spike: the traps throw themselves (10)                                                                                     |
| C13 | 10             | The own-node form of the live-store throw was never weighed                                | Changed after a spike: taken, for the getter's own object (10). Accepted: a write to a child still differs between the layers              |
| C14 | 1              | The tie-breaker is false: the strict rule's cost is silent too                             | Changed, as W8                                                                                                                             |
| C15 | 7, 10, 43      | The three were never run together, and 7's figures are for a design nobody will build      | Changed: 7 and 4 say so; stage 4 takes its figures from its own build                                                                      |
| C16 | 29, 30, 11     | A jump by JSON could delete every arrow method                                             | Changed: 29 says a restore from outside never touches a function field                                                                     |
| C17 | 11, 27         | An arrow method gets no name for `devtools`                                                | Changed after a spike: a method takes the name of the key it was read under (1, 27)                                                        |
| C18 | 45             | A subclass of a collection loses its members in the snapshot type                          | Changed: 45 says so, and that a hook for it can follow                                                                                     |
| E1  | 21, rule 10    | Without `onError` a refused record is still silent, and the next save replaces it          | Changed: a default report to `console.error`; rule 10 says what happens to it                                                              |
| E2  | 19, 11         | A restore inside a constructor is lost to a subclass's initialisers                        | Accepted: nothing can detect it; 19 names it, the guide forbids it, and a test pins it                                                     |
| E3  | 27             | The same as W2                                                                             | Changed                                                                                                                                    |
| E4  | 14, rule 1     | A console that throws sends its error to the writer and stops the round                    | Changed: the report is guarded                                                                                                             |
| E5  | 16             | The type cannot see most callers, and a runtime refusal can only come before 1.0           | Changed: an `async` function is refused when it arrives, in every build                                                                    |
| E6  | 21             | An `async` `migrate` is called and its rejection left unhandled                            | Changed: refused before the call, and a handler on a returned thenable                                                                     |
| E7  | 26             | Removing `clearOnExpire` deletes data, and was never spiked                                | Changed: it stays                                                                                                                          |
| E8  | 30             | An undo writes into an object that now lives in another store                              | Accepted: the restore follows the object, and 30 says so. Run: four cases, and today ends a sharing in silence                             |
| E9  | 30             | The same as W1                                                                             | Changed, as W1                                                                                                                             |
| E10 | 11, 30         | The same as W3                                                                             | Changed                                                                                                                                    |
| E11 | Rule 3         | False for a write made inside a batched subscriber                                         | Changed: one sentence per path                                                                                                             |
| E12 | Rule 5         | Contradicts decision 44                                                                    | Changed: "and is not on a cycle"                                                                                                           |
| E13 | Rule 10        | A second `save()` in one task reaches storage a microtask later                            | Changed: "the first of a task"                                                                                                             |
| E14 | Rule 6         | An object reached through a frozen container reads back raw                                | Changed: rule 6 names the two ways an object is handed out raw. The behaviour is changed after a spike (5)                                 |
| E15 | Rule 2         | Leaves out arrow methods and the `async` method rule                                       | Changed                                                                                                                                    |
| E16 | 38             | A write to the Vue ref is ignored in silence                                               | Changed: it throws                                                                                                                         |
| E17 | 37             | The Vue half changes a documented shape                                                    | Changed: "before 1.0" for Vue                                                                                                              |
| E18 | 42             | The index is skipped for tracked React reads; Solid's flag stays                           | Changed: both stated                                                                                                                       |
| E19 | 39             | The Angular message names the function in development mode only                            | Changed: the adapter throws its own coded error                                                                                            |
| E20 | 21             | The version rule is stated three ways                                                      | Changed: one rule, with `null` refused                                                                                                     |
| E21 | 19             | The spike's gap, a `hydrated` that never settles, was dropped                              | Changed: 19 carries it                                                                                                                     |
| E22 | 13             | What an adapter of another store shows inside a round, and no criterion for the variant    | Changed: stated, and the variant is taken on a stated condition                                                                            |

Of the 58, 55 are answered by a change to the document, 17 of those after
a spike, and 3 are accepted as costs. Four of the changes leave a part that
is accepted as a cost. Each accepted cost is stated in its entry.

### The second round

Two reviewers read the document as revised after the first round:
`adversarial-2-whole.md` (2W) and `adversarial-2-core.md` (2C). They raised
30 objections; 11 were rated "wrong", 1 "mislabelled", 5 "unsupported" and
13 "unclear". Two more spikes were run for the ones that needed a build:
`spike-functions-2.md` and `spike-core-3.md`.

| No.  | Against         | Objection                                                                          | Answer                                                                                                                              |
| ---- | --------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2W1  | 24, 21, rule 10 | An older build writes over a newer record when it loads                            | Changed: a newer record is never used or written over, and a record is written back only after an upgrade (21, 24). Not built       |
| 2W2  | 21, 22          | The integer rule refuses a record the application saved itself                     | Changed: a version is a finite number on both sides; the option and an `async` `migrate` are checked when `persist()` is called     |
| 2W3  | 36, 4           | The lost-write check breaks the cost limits as the benchmark runs today            | Changed: once per task for a store, and the limits come first: the check gives way if it cannot hold them (36). Not built           |
| 2W4  | 4               | Nothing stops a ceiling from rising                                                | Changed: a ceiling moves only in a commit of its own; the guard covers itself and every commit, and has tests (4)                   |
| 2W5  | 4               | The React ceiling is below its own estimate plus 2%                                | Changed: every ceiling follows one stated rule (4)                                                                                  |
| 2W6  | 24, 23          | Both change a documented sentence and are labelled "can follow 1.0"                | Changed: both are "before 1.0"                                                                                                      |
| 2W7  | 27              | The naming reads a name that is empty; the evidence names the wrong build          | Changed: the key is handed over with the call, and the hook form is named (27). Passing the key was not built                       |
| 2W8  | 27              | The default of `devtools` where there is no `process`                              | Changed: off (27)                                                                                                                   |
| 2W9  | 27, 43          | A getter of an object literal that throws still loses the entry                    | Accepted: the guard covers the root's class getters only, and both entries say so                                                   |
| 2W10 | Pinned          | A guaranteed row that decision 43 breaks is missing                                | Changed: the line is added                                                                                                          |
| 2W11 | 21              | An unusable `expiresAt`: restored, or refused                                      | Changed: missing or `null` is restored; any other value that is not a number leaves nothing to keep (21)                            |
| 2W12 | 4, 35           | 100 against 271 bytes for the codes; rows that are not measured alone              | Changed: 35 gives both figures, and 4 says which rows are measured on top of another                                                |
| 2W13 | Order           | Four steps need something a later step brings                                      | Changed: the guard rule and the codes page come first, the constructor test moves, and 2 and 5 are two commits                      |
| 2W14 | Not taken       | Two wrong "(final)" marks, three final choices missing, M23 listed twice           | Changed                                                                                                                             |
| 2C1  | 1, rule 6       | A store made from a copy of an object or a snapshot runs the old store's methods   | Changed after a spike: the object is never changed, so a copy holds plain functions (1). A copy made through the store is stated    |
| 2C2  | 1               | A function on a snapshot or on the object ignores the `this` its caller passes     | Changed after a spike: both hold the function as written (1). Accepted for a read through the store, as today                       |
| 2C3  | 10, 1, rule 4   | A snapshot getter that calls an own method writes the live store                   | Changed after two spikes: a method of an object literal throws there (1), and any path to the live object throws (10)               |
| 2C4  | 30, 5, 2        | An undo into a container frozen through the store fails part-way                   | Changed after a spike: a container that would refuse a write is replaced, and a root that would throws before anything is written   |
| 2C5  | 12              | The table grows with every absent key, for good                                    | Changed after a spike: an absent key is recorded only while the table is small (12)                                                 |
| 2C6  | 29, 1           | A callback that is restored comes back wrapped                                     | Changed after a spike: a restore writes the function back as it was written (1, 29). The change to `history.ts` itself is not built |
| 2C7  | 1               | The rule's text and the spike's code differ for a prototype method                 | Changed: case 1 is any function on the prototype chain, in the text and in the code                                                 |
| 2C8  | 1, 2            | A read-only function definition throws after it is made                            | Changed after a spike: nothing is wrapped at a definition, and such a property hands out its function as it is                      |
| 2C9  | 43, 27          | The same as 2W9                                                                    | Accepted, as 2W9                                                                                                                    |
| 2C10 | 6, 42           | A list and a reactive collection answer differently for a snapshot kept as a value | Accepted: on purpose. Both entries say why, and a test pins both answers                                                            |
| 2C11 | 1, 12           | The timing condition names a baseline that decision 12 has moved                   | Changed: the baseline is the commit before the change (1)                                                                           |
| 2C12 | 27              | "The slot form" is cited with the hook form's figures                              | Changed, as 2W7                                                                                                                     |
| 2C13 | 5, 4            | 56 bytes where the report gives 68                                                 | Changed: 68, and the sum with it                                                                                                    |
| 2C14 | 10              | "A write to a child throws" is false outside strict code                           | Changed: the entry says what happens in each kind of code, and that it is unspecified                                               |
| 2C15 | 43              | Its figures come from a layer that decision 10 changes first                       | Changed: 43 says its figures are a forecast                                                                                         |
| 2C16 | Rule 6          | Rule 6 and the unspecified list disagree with decision 1 on prototype methods      | Changed: rule 6 speaks of a read through the store only, and a call on a snapshot is in the unspecified list                        |

Of the 30, 27 are answered by a change, 7 of those after a spike, and 3 are
accepted as costs. Three decisions changed in substance: the rule for
functions (1), what `persist` does with a record it could not use (21), and
what an undo does with a container it cannot write (30).

### The third round

One reviewer read what had changed since the second round:
`adversarial-3.md` (3). It raised 17 objections; 4 were rated "wrong", 1
"mislabelled", 3 "unsupported" and 9 "unclear". Two last spikes were run:
`spike-functions-3.md` and `spike-persist-2.md`.

| No.  | Against     | Objection                                                                               | Answer                                                                                                                               |
| ---- | ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 3-1  | 1, rule 2   | A method written with `function` loses its binding and its transaction, in silence      | Changed after a spike: only a class is handed out as data (1). Accepted: a constructor written as a `function` is as today           |
| 3-2  | 21, 19      | `clear()` from `onError` cannot work on a synchronous storage                           | Changed after a spike: `onError` receives the handle, and an error it throws is logged (21)                                          |
| 3-3  | Rule 10, 21 | Rule 10 is false for `skipHydration` and for an edit made during a read                 | Changed after a spike: a handle writes only after it has read, and rule 10 says what happens to such an edit                         |
| 3-4  | 24, 21      | Writing a migrated record back at load opens two losses                                 | Changed: it is not written back (24). Accepted: a wrong `migrate` is still saved at the next edit                                    |
| 3-5  | 1           | Slower than today for a method held in a field, and the condition measures another path | Changed after a spike: the short path is taken, the cost against today is stated, and the condition names two new benchmark rows (1) |
| 3-6  | 1           | The fast path that "can follow" changes documented behaviour                            | Changed after a spike: the gap for a frozen function is closed; the one left is stated and is in the unspecified list (1)            |
| 3-7  | 21          | What `save()` and `rehydrate()` do on a handle that does not write                      | Changed after a spike: both report and reject (21)                                                                                   |
| 3-8  | 21, 24      | The two entries disagree on what is written back, and when                              | Changed: one list, in 24                                                                                                             |
| 3-9  | 21          | No row for a `merge` that fails                                                         | Changed after a spike: it is in the row of `migrate` (21)                                                                            |
| 3-10 | 36          | The benchmark cannot see a check that runs once per task                                | Changed: a row that takes one snapshot per task, and a condition stated in figures of the benchmark (36)                             |
| 3-11 | 10, rule 4  | A getter on a nested object that writes the root goes through                           | Accepted: the throw is for the getter's own object, and a write to a parent is in the unspecified list                               |
| 3-12 | 10, 43      | The fix for a snapshot getter rests on a closure that decision 43 removes               | Changed: 10 says so, and its rows are run again as tests after 43                                                                    |
| 3-13 | 1, 27       | One function under two keys has one name                                                | Accepted: the name is the key that was read first, and both entries say so                                                           |
| 3-14 | 12          | Its "answers for now" do not match its own spike                                        | Changed                                                                                                                              |
| 3-15 | 4           | The guard would flag its own text, and the first commit breaks the rule for ceilings    | Changed: both have a rule                                                                                                            |
| 3-16 | 30, 29      | The restore's check counts a function field as a key to delete on a jump by JSON        | Changed: the check counts only the writes the restore makes. Not built; stage 4 tests the jump first                                 |
| 3-17 | Lists       | Loose ends in the lists, an answer of the first round, and the order                    | Changed                                                                                                                              |

Of the 17, 15 are answered by a change, 7 of those after a spike, and 2 are
accepted as costs.

**There is no fourth round.** The plan allows three. Two things were decided
after the third round and have not been read by a reviewer: the fourth form
of the rule for functions (decision 1) and the `persist` rules as built
(decisions 19 and 21 to 24). Both were built and run, each against the
scripts of the reviews that came before. They are the first things the
independent review of stage 4 reads.
