# Stage 3 decisions

Stage 3 of the pre-1.0 review. No library source has been changed. Stage 4
implements what is decided here, one change per commit, test first.

**Status: under revision after the adversarial review.** Three fresh agents
reviewed the first complete draft and raised 58 objections, 28 of them
"wrong". "Objections and answers" at the end says what became of each.
Nine entries are marked "under revision" and wait for three follow-up
spikes; the rest stand as rewritten.

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
diagnostics, performance; "repository" is for what is not library code.
"Stage 4" says whether the change is scheduled now.

| No. | Decision                                                                 | Kind                    | Label          | Stage 4          |
| --: | ------------------------------------------------------------------------ | ----------------------- | -------------- | ---------------- |
|   1 | A method is a function on the prototype chain; a stored function is data | Public API, bug         | Before 1.0     | Yes              |
|   2 | `Object.defineProperty` through a store is a write                       | Bug                     | Before 1.0     | Yes              |
|   3 | Suspension stays; the walk to a detached parent goes                     | Bug, simplification     | Can follow 1.0 | Yes              |
|   4 | Size ceilings for every entry                                            | Constraint              | Before 1.0     | Yes              |
|   5 | Raw values on write, one node per raw object                             | Bug                     | Before 1.0     | Yes              |
|   6 | `includes`, `indexOf`, `lastIndexOf` find an object in any form          | Bug                     | Before 1.0     | Yes              |
|   7 | `has` and `ownKeys` traps; a missing property is a value                 | Bug                     | Before 1.0     | Yes              |
|   8 | A delete that removes nothing is not a change                            | Bug                     | Can follow 1.0 | Yes              |
|   9 | A plain object from another realm is state; no guard for a frozen raw    | Bug                     | Can follow 1.0 | On one condition |
|  10 | Getters: one kind of dependency; errors; the snapshot layer              | Bug, simplification     | Before 1.0     | Yes              |
|  11 | Nested instances stay opt-in; the base class `ClassyStore`               | Public API              | Before 1.0     | Yes              |
|  12 | A table per prototype in place of a descriptor lookup                    | Performance             | Can follow 1.0 | Yes              |
|  13 | One delivery queue, with a bound                                         | Bug                     | Before 1.0     | Yes              |
|  14 | A subscriber's error is caught and logged, a rejection too               | Public API, bug         | Before 1.0     | Yes              |
|  15 | A setter is a transaction                                                | Bug                     | Before 1.0     | Yes              |
|  16 | `batch()` refuses, by type, a callback that returns a promise            | Public API              | Before 1.0     | Yes              |
|  17 | `subscribe()` stays batched by default                                   | Public API              | No change      | Docs             |
|  18 | Writes outside a method stay allowed                                     | Public API              | No change      | No               |
|  19 | `persist()` restores before it returns when the storage is synchronous   | Public API              | Before 1.0     | Yes              |
|  20 | Dead and redundant code goes                                             | Simplification          | Can follow 1.0 | Yes              |
|  21 | Nothing `persist` cannot use is skipped in silence                       | Bug, diagnostics        | Before 1.0     | Yes              |
|  22 | `persist()` validates its options                                        | Bug                     | Before 1.0     | Yes              |
|  23 | A restore is all or nothing                                              | Bug                     | Can follow 1.0 | Yes              |
|  24 | A migrated record is written back; a pending save is flushed             | Bug                     | Can follow 1.0 | Yes              |
|  25 | Cross-tab sync ignores an event from another storage area                | Bug                     | Can follow 1.0 | Yes              |
|  26 | `persist` options: `clearOnExpire` goes, `storage` stays required        | Public API              | Before 1.0     | Yes              |
|  27 | `devtools`: named entries, exact time travel                             | Public API, bug         | Before 1.0     | Yes              |
|  28 | An edit made in the same tick as `undo()` is recorded                    | Bug                     | Can follow 1.0 | Yes              |
|  29 | To `withHistory`, a function in an own field is data                     | Public API              | Before 1.0     | Yes              |
|  30 | Undo and time travel change a nested object in place                     | Bug, performance        | Before 1.0     | Yes              |
|  31 | `subscribeKey` without a snapshot of the whole store; no selector form   | Performance             | Can follow 1.0 | Yes              |
|  32 | The publish step gets a job of its own                                   | Repository              | Can follow 1.0 | Yes              |
|  33 | Dependencies: exact pin, an audit step                                   | Repository              | Can follow 1.0 | Yes              |
|  34 | Documentation                                                            | Docs                    | With each      | Yes              |
|  35 | Every error carries a stable code                                        | Diagnostics             | Before 1.0     | Yes              |
|  36 | No development build in 1.0                                              | Diagnostics             | Can follow 1.0 | No               |
|  37 | Vue, Angular and Solid build the snapshot when it is read                | Performance             | Can follow 1.0 | Yes              |
|  38 | Vue: no listener left by a server render; a read-only ref                | Bug, public API         | Before 1.0     | Yes              |
|  39 | Angular: `untracked()`, an injector option                               | Bug, public API         | Can follow 1.0 | Yes              |
|  40 | The adapter names stay                                                   | Public API              | No change      | Docs             |
|  41 | `prepareStoreForHydration` stays explicit; `isEqual` stays               | Public API              | No change      | Docs             |
|  42 | Collections: one membership rule, a snapshot index                       | Bug, performance        | Before 1.0     | Yes              |
|  43 | Class getters on one derived prototype per class                         | Public API, performance | Before 1.0     | Yes              |
|  44 | A snapshot keeps a cycle                                                 | Bug, public API         | Before 1.0     | Yes              |
|  45 | Snapshot types: tuples, collection snapshots without mutators            | Public API              | Before 1.0     | Yes              |
|  46 | A snapshot after one row changes still rebuilds the list                 | Performance             | Can follow 1.0 | No               |

## The four decisions the rest hangs on

### 1. A method is a function on the prototype chain; a function held in a field or a list is data

**Under revision**, with `spike-functions.md`. Two reviewers showed that the
rule below adds a silent failure: a method written in an object literal
stops being a transaction, so a synchronous subscriber sees each of its
writes. The spike tests one rule for every store in place of this rule and
the exception of decision 11: a function an object is born with is a method,
a function written later to a field that exists is data.

**Decision.** Only a function found on the prototype chain is bound to the
store and run as a transaction. A function the object holds itself (a field,
an element of a list, a class held as a value, `constructor`) is returned as
it is. This is the "strict" variant of the trap spikes.

**Why.**

- It is one rule that fits in a sentence, and it is what the reference
  already says: "Prototype methods are automatically bound", and functions
  are listed among the opaque leaves of a snapshot.
- It removes findings 5, 6 and 42 and three defects the other variant keeps:
  a wrapper that gets stored when a function is copied from one field to
  another, a getter that calls a function held in a field and goes stale, and
  a bound or frozen function that comes back as a different function.
- It costs no bytes and removes code. The other variant costs 22 bytes.
- No compared library wraps a function on every read. Valtio, Vue, Solid and
  Svelte return it as it is.

**What it costs a user.** A method written in an object literal,
`createClassyStore({count: 0, inc() {…}})`, is no longer bound and no longer
a transaction. `store.inc()` still works and still notifies. A synchronous
subscriber is then called once per write inside it, and a detached call
(`const {inc} = store`, `onClick={store.inc}`) throws a `TypeError`. It fails
loudly, as it does on any plain object. Object-literal methods appear in ten
test files and nowhere in the docs, the examples or the website.

**Not taken.** The "lenient" variant, which keeps wrapping every function
except an array element, a class and `constructor`.
`review/stage-3/pinned.md` recommends it, on the ground that a plain object
is a documented input and its methods should stay transactions. A plain
object stays a documented input, as a container of data. Bound, transactional
methods are what a class is for in this library, and a function in a field
cannot be told apart from a callback the user stored there. Wrapping it
breaks the callback's identity; not wrapping it leaves the method unbound.
Identity wins, because the failure of the other choice is silent.

**Evidence.** `spike-traps.md`, T1. 15 lines added, 17 removed. 10 tests
change: 9 fixes and 1 incidental (the object-literal method). Timings inside
the spread, except store creation on Bun, 4% slower, which the report says
making the cache on first use takes back.

**Label.** Before 1.0. **Stage 4:** yes.

**Docs.** The tutorial and the reference state the rule. The architecture
page describes the wrapper cache keyed by function.

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

| Entry                 | Today | Budget today | Ceiling | What moves it                                                    |
| --------------------- | ----: | -----------: | ------: | ---------------------------------------------------------------- |
| `.` (the main entry)  | 3,661 |        3,750 |   5,000 | The table below                                                  |
| `./utils` adds        | 2,686 |        2,750 |   3,700 | `persist`, `devtools`, restore in place, `subscribeKey`          |
| `./collections` adds  |   727 |          750 |     950 | The snapshot index, the membership rule, the mutator check       |
| `./react` adds        | 1,662 |        1,700 |   1,725 | The guard for a cyclic snapshot                                  |
| `./vue` adds          |   280 |          300 |     390 | The read-time ref, the server path, the setter that throws       |
| `./angular` adds      |   271 |          300 |     400 | The read-time signal, `untracked()`, the injector, its own check |
| `./solid` adds        |   312 |          335 |     360 | The read-time accessor                                           |
| `./svelte` adds       |   182 |          200 |     200 | Nothing                                                          |
| `./react/server` adds |   153 |          175 |     175 | Nothing                                                          |

**A ceiling is an estimate and a tripwire, not a measurement.** The decided
set was never built as one. Each figure below is one change measured alone
against today's source, and two combinations that were built came out above
the sum of their parts (the trap spikes 650 against 617, the snapshot spikes
243 against 230). So the ceilings sit a little above the sums, and what they
are for is to stop the work: a change that would pass one is not committed,
and the question goes back to a decision.

**How a budget moves in stage 4, and what enforces it.**

- Stage 4's first commit is tooling only. `budgets.json` gets a `ceiling`
  beside each budget, and the size script fails when a budget is above its
  ceiling. The floor guard reads `budgets.json` and `limits.json` as well as
  `CONSTRAINTS.md`, compares each commit with the one before it, and blocks a
  number that rises unless the decision record changes in the same commit.
  Today it reads `CONSTRAINTS.md` only, and one record anywhere on the branch
  would switch it off for every later change.
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
| Stored functions                                                      |    1, 11 |   open |
| `defineProperty` as a write                                           |        2 |    +49 |
| The walk to a detached parent removed                                 |        3 |    −36 |
| Raw values on write                                                   |        5 |    +36 |
| Searches that find an object in any form                              |        6 |   +100 |
| `has` and `ownKeys` traps, a missing property as a value              |        7 |   +156 |
| A delete that removes nothing                                         |        8 |    +11 |
| A plain object from another realm                                     |        9 |    +81 |
| Getters: one kind of dependency, errors, the snapshot layer           |       10 |   +165 |
| The base class                                                        |       11 |    +13 |
| A table per prototype in place of a descriptor lookup                 |       12 |   +119 |
| The delivery queue with its bound, setters, the rejection handler     | 13 to 15 |   +219 |
| The check for an `async` function in `batch()`                        |       16 |    +50 |
| Dead lines removed                                                    |       20 |    −32 |
| The method name for `devtools`                                        |       27 |   open |
| Class getters on a derived prototype, and `this` in a snapshot getter |       43 |   +239 |
| A snapshot keeps a cycle                                              |       44 |     −9 |
| Sum of what is measured                                               |          | +1,161 |

The sum puts the main entry near 4,820 bytes, 32% above today's, before the
two open rows, which the spikes measured at 90 and 20 bytes. The messages
were measured as their spikes wrote them; the codes of decision 35 shorten
the ones in this set by about 100 bytes (the 271 that report measured
includes messages of refusals this document does not take).

**What each of the larger items buys, so that it can be weighed.**

- 239 bytes (decision 43): a snapshot lists the store's keys, a snapshot of
  a class with getters is four times faster to make, and `this` inside a
  snapshot getter is right.
- 219 bytes (decisions 13 to 15): no stack overflow and no hung event loop
  when a subscriber writes, and faster ordinary writes.
- 165 bytes (decision 10): five getter defects, and a cached getter read a
  quarter faster.
- 156 bytes (decision 7): getters that use `in` or `Object.keys(this)` stop
  returning stale answers. It serves fewer users than the others.
- 119 bytes (decision 12): a field read about 2.5 times faster on
  JavaScriptCore.
- 100 bytes (decision 6): `includes()` and `indexOf()` find the object the
  caller holds.
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

**Under revision**, with `spike-core-2.md`, F1. After `Object.freeze(outer)`
through the store, a read-only property has to hand out what the raw object
holds. Under this decision that is the raw child, so `outer.inner` reads
back raw and a write through it notifies no one, where today a child that
was assigned as a proxy stays reactive.

**Decision.** The `set` trap stores the raw object behind a store proxy, and
`linkChild` finds an existing node by the raw object as well as by the proxy.

**Why.** It removes findings 9 and 10: a class instance that is already a
store stays connected when it is placed in another store by its raw object,
and the raw object behind a store no longer fills up with proxies. Decision 2
needs it for one line: a definition must store the raw value too.

**Evidence.** `spike-traps.md`, T2, first part. 12 lines added, 8 removed, 36
bytes. 3 tests change, all fixes. One open measurement: creating a store came
out about 20% slower on Node in one run, and the second run was never made.
Stage 4 measures it first and looks for the cause before the change lands.

**Label.** Before 1.0, because `outer.inner === inner` changes its answer.
**Stage 4:** yes.

**Not covered, on purpose.** A list built from proxies and then assigned
(`this.items = this.items.filter(…)`) still holds proxies in its raw array.
Replacing them would change an array the caller may still hold.

### 6. `includes`, `indexOf` and `lastIndexOf` find an object in any of its forms

**Under revision**, with `spike-core-2.md`, F3. Every snapshot of one object
has the same identity, so on a list of saved snapshots the rule below gives
wrong answers: `indexOf(v2)` is 0, and `includes` of a snapshot that was
never pushed is true. The fix under test compares an element the store keeps
as a value by reference, and only an element that is a node by identity.

**Decision.** On a list in a store, the three searches compare by
`identityOf`, as the reactive collections do. A primitive is searched for
with the native method.

**Why.** `const row = {…}; store.rows.push(row); store.rows.includes(row)` is
`false` today (finding 7). That is a wrong answer from a documented array
method, in the most ordinary way of using it.

**Evidence.** `spike-traps.md`, T2, searches. 25 lines added, 1 removed, 100
bytes. 4 tests change, all fixes. The spike maps the list on each search; the
real version loops once without allocating.

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

**Under revision** for one part, with `spike-core-2.md`, F4: a getter that
writes. As decided below, `this.cache ??= …` works on the live store and
throws through every adapter, and the throw on a snapshot holds in strict
code only. The spike tests a throw for a write to the getter's own node on
both layers, raised by the traps themselves.

**Decision.** Take the combination of the getter spikes:

- One kind of getter dependency, `{value, version}` by property. It contains
  the version stamp that makes a clean read constant, records each property
  once per run, and treats a missing property as a value.
- A getter that reads a getter which threw records that dependency, on both
  layers, inside a frame that also covers validation.
- The snapshot layer keeps the memo map that nested getters filled (finding
  37) and reports a cycle with the live layer's error where it overflows the
  stack today (finding 38).
- A snapshot getter that writes to `this` throws, where the write is dropped
  in silence today. On the live store nothing changes.

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

**Not taken.**

- Recording reads outside the getter's own node (another store, a static).
  It costs 124 bytes and 14 to 18% on a getter over 1,000 rows, and it cannot
  work on a snapshot. The docs state the limit and the pattern that works:
  hold the other store as a field.
- Caching a thrown error. 73 bytes and seven pinned behaviours for one gain.
  It can follow 1.0, and whether errors are cached is **unspecified**.
- Throwing for every write made while any getter runs, on the live store as
  well. An earlier draft of this entry took it, for the sake of one rule on
  both layers. It is dropped for three reasons. It would refuse a store that
  is constructed inside a getter, which the base class of decision 11 does
  by writing its own fields. It would refuse a getter that calls a method of
  another store. And it is stricter than three of the four compared
  libraries, for 51 bytes. The docs say that a getter must not write to the
  store it reads; a warning can follow in 1.x (decision 36).

**Evidence.** `spike-getters.md`. The combination: 182 lines added, 144
removed, 165 bytes. 16 tests change: 15 fixes and 1 incidental. On Node a
cached getter read is 26% faster and a recompute 6 to 9% slower; the four
cost ratios stay inside their limits on both engines.

**Label.** Before 1.0: a snapshot getter that writes becomes an error, and
the sentence about an absent field goes. **Stage 4:** yes.

### 11. Nested class instances stay opt-in, and a base class makes arrow-function methods work

**Under revision** for the rule about functions in fields, with
`spike-functions.md`. Three defects were reproduced in the spiked form: one
function installed in two stores writes the first one, a subclass that
overrides an arrow method loses the transaction, and such a method has no
name for `devtools`. The base class itself, and the opt-in default, stand.

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
- **In such a class an arrow function that creates a field is a method**:
  bound to the store and run as one transaction. This is the one exception
  to decision 1. A function written to a field that already exists is data
  and is kept as it is, as on every other store.
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
- Without the exception for arrow functions, an arrow method works and
  notifies a synchronous subscriber once per write: a loop of 1,000 writes
  took 150 milliseconds on Bun against 1 in a prototype method, and nothing
  says so.

**What it costs a user.** Two rules for a function in a field, and nine
sentences in the docs. The ones that matter most:

- A callback field is declared with an initialiser, such as
  `onSave: (() => void) | null = null`. A function assigned to it later is
  then data and keeps its identity. Without the initialiser, whether the
  field exists at that point depends on the compiler.
- Code compiled to ES5 turns an arrow function into an ordinary function, and
  an arrow method then notifies once per write.
- Under React's `StrictMode`, `useLocalStore` makes two stores in
  development, so a constructor that starts a timer starts two.
- A class that has to extend another class uses `createClassyStore(new X())`.

**Not taken.** Detecting an arrow function by its source text: it finds 6 of
7 lost writes, reports 2 fields that lose nothing, and costs 256 to 342
bytes. An `opaque()` helper and a mixin form of the base class.

**Evidence.** `spike-classes.md` and `spike-classes-2.md`. The base class is
4 lines and 13 bytes; the rule for arrow functions 90 more. One subclass was
compiled 17 ways (TypeScript with class fields as definitions and as
assignments, Bun, Oxc, esbuild, the SWC of Next.js with the example's
configuration, Babel in spec and loose mode), and in every output the first
snapshot is right, an arrow method notifies once, and a field write and a
timer's write are seen. Seven throwaway tests pass for Vue, Svelte, Solid,
Angular, `createStoreHook` and `useLocalStore`. A base-class store made
inside a getter works on both layers. With decisions 1 and 2 in one build,
28 tests change: 27 are the trap patches' and 1 is the export list.

**Label.** The default for nested instances: before 1.0, and no code. The
base class: an addition. **Stage 4:** yes, after decisions 1 and 2, and
together with decision 30, which it needs.

**After 1.0** (decision 36): a report of a write that was lost because it
went to the raw object, which is precise, and a warning for an unmarked class
placed in a store once it can be silenced for a class that is opaque on
purpose.

## Performance

### 12. A table per prototype answers "is this key a getter?"

**Under revision**, with `spike-core-2.md`, F2. The spiked table caches the
whole inherited descriptor, so a getter redefined on the class keeps its old
body on the live store while snapshots run the new one. The form under test
caches which prototype holds the key and whether it is an accessor, and
reads the function at the read.

**Decision.** The `get` and `set` traps stop walking the prototype chain with
`Object.getOwnPropertyDescriptor` on every access. An own key is decided with
`hasOwnProperty` and one flag per node; an inherited key from a table per
prototype, filled on the first miss.

**Why.** A read is the hottest operation the library has, and this is the
largest gain any spike measured: a field read goes from 32.8 to 12.8
nanoseconds on Bun and from 47.8 to 37.4 on Node, and a read three objects
deep from 111 to 49.5 and from 142 to 117. All 1,341 tests pass.

**What it assumes.** A prototype gains no getter after its first read through
a store. The library does not handle that today either (findings 44 and 47),
and it is marked **unspecified**.

**Evidence.** `spike-traps.md`, the table under T6, and the Solid report's
spike. Applied twice by different hands: 38 lines added, 2 removed, 119
bytes, no test fails, typecheck passes.

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

**Two things the guide has to say.**

- **Call `persist()` after the store is constructed, never inside a
  constructor.** With the base class of decision 11 a constructor is a
  natural place for it, and it is the wrong one: the field initialisers of a
  subclass run after the restore and overwrite it, and under decision 2 they
  count as edits, so the next save writes them over the stored record. Stage
  4 pins what happens with a test, so that the sentence stays true.
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

### 21. Nothing `persist` cannot use is skipped in silence

**Decision.**

- Every stored record `persist` cannot use is reported as `'parse'`, with
  the reason in the message: an envelope that is not an object, a `state`
  that is not a plain object, a version that is not an integer, a version
  that differs with no `migrate`, and a `migrate` that returns something
  other than a plain object. No new operation name is added.
- **When no `onError` is given, the report goes to `console.error`** with
  its code, in every build. `onError` replaces that default.
- **The version rule is one rule.** A version is an integer. A record with
  no `version` field counts as version 0. Any other value, `null` and `"2"`
  included, is refused.
- **An `async` `migrate` is refused before it is called.** If a `migrate`
  that is not an `async` function returns a thenable, a handler is attached
  to it and the record is refused, so no rejection is left unhandled.
- A record without a usable `expiresAt` is restored and written back with
  one.
- A record that was refused is replaced by the next save.

**Why.**

- One channel for every failure of a read, and a default for it. `onError`
  is optional, and without a default a refused record is as silent as today.
- Awaiting an `async` `migrate` would put a turn between the read and the
  apply, which is what decision 19 removes. Calling it and dropping its
  promise would turn a silent skip into an unhandled rejection, which ends a
  Node or Bun process.
- Counting a record without `expiresAt` as expired would wipe every user's
  saved state on the release that adds `expireIn` to an application.
- Keeping a refused record for good would stop the store from ever saving
  again. It is replaced, after it has been reported.

**Evidence.** `persist-devtools.md`, P2. 144 bytes on `./utils`. 8 tests
change, all pins of the silence. The default report, the `null` version and
the handler on a thenable are `adversarial-edges.md`, objections 1, 6 and
20, each reproduced on the spike; none is in the spike, so stage 4 writes
their tests first.

**Label.** Before 1.0. **Stage 4:** yes.

### 22. `persist()` validates its options when it is called

**Decision.** `persist()` throws a `TypeError` for a prototype key, a getter
or a method named in `properties`, and for a transform that is half written.

**Why.** These are mistakes in the application's own code, at a boundary the
library owns. Today each is accepted and then does the wrong thing later.

**Evidence.** `persist-devtools.md`, P3. 82 bytes. 5 tests change: 4 fixes
and 1 incidental.

**Label.** Before 1.0. **Stage 4:** yes.

### 23. A restore is all or nothing

**Decision.** A restore copies every value first, writes them in one
transaction, checks that the result can be snapshotted, and rolls back if it
cannot. A nested `__proto__` key is dropped.

**Why.** Today a deeply nested record restores and then makes every snapshot
and every save throw, so it is never replaced.

**Evidence.** `persist-devtools.md`, P4. 74 bytes. 1 test changes, a fix.

**Label.** Can follow 1.0. **Stage 4:** yes.

### 24. A migrated record is written back, and a pending save is written when the page is hidden

**Decision.** After a restore that ran `migrate`, the migrated record is
saved at once, so the migration does not run again on the next load. A
debounced save that is still waiting is written when the page is hidden
(`pagehide`).

**Evidence.** `persist-devtools.md`, P5. 102 bytes. No test changes. A real
page unload was not tested; stage 4 tests it in the browser suite.

**Label.** Can follow 1.0. **Stage 4:** yes.

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
stays.

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
- **Time travel.** A jump replaces the state exactly, in one transaction,
  without calling setters. A jump to an entry this session sent restores the
  snapshot that was sent, so a `Date` stays a `Date`; a jump the extension
  sends as JSON restores data.
- **Messages.** `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled.
- **`enabled` defaults to on, except where `NODE_ENV` is `production`.** It
  reads the environment the way decision 36 does. The guide says that the
  extension receives every state, so a store with secrets passes
  `enabled: false`.

**Under revision** for two parts, with `spike-combos.md`: how the method's
name reaches `devtools` without a cost on every method call for every user
(the spike's hook costs 20 bytes in the main entry and 3 to 7% of a method
call on Node, whether `devtools()` is called or not), and what `devtools`
sends for computed values once snapshots carry none (decision 43).

**Why.** Every entry is named `STORE_UPDATE` today, which makes the tool's
list useless, and a jump adds unknown fields, never deletes missing ones and
calls setter-only accessors. The default changes because DevTools on a
production page hands the whole state to any extension that asks, and a
default cannot be changed after 1.0.

**Evidence.** `persist-devtools.md`, P7. 403 bytes on `./utils`. No test
changes, because stage 1 added none for `devtools`; stage 4 writes them
first. Not verified: the entry ids the Redux DevTools extension sends back.

**Label.** Before 1.0. **Stage 4:** yes.

### 28. An edit made in the same tick as `undo()` is recorded

**Decision.** `withHistory` drops its `restoring` counter and runs undo and
redo as one transaction each. An edit made in the same tick as `undo()` or
`redo()` is then recorded like any other (findings 57 and 58).

**Evidence.** `persist-devtools.md`, P8. `./utils` 24 bytes smaller. 1 test
changes, a fix.

**Label.** Before 1.0: the history guide describes today's behaviour, and
that sentence goes. **Stage 4:** yes.

### 29. To `withHistory`, a function in an own field is data

**Decision.** Undo removes a function that was added to a field and puts
back one that was replaced, by reference (finding 60, M59). Methods on the
prototype are untouched, as today.

**A restore from outside never touches a function field.** A DevTools jump
that the extension sends as JSON carries no functions. The shared restore
neither deletes nor writes a function field for such a state, so a jump
cannot remove the arrow methods or the callbacks of a store. Only a state the
library recorded itself restores function fields, by reference.

**Why.** It follows from decision 1. Once a function in a field is data to
the store, history cannot be the one place that treats it as behaviour.

**Evidence.** None beyond the stage 1 test that pins today's behaviour. It
was reasoned, not spiked, so stage 4 writes the test first and stops if the
change turns out larger than a few lines in `history.ts`.

**Label.** Before 1.0. **Stage 4:** yes, after decision 1.

### 30. Undo and time travel change a nested object in place

**Under revision**, with `spike-combos.md`, K1. With decision 44 in the same
build, an undo on a store that refers to itself overflows the stack: the
restore walks into live objects and nothing stops it on a cycle. Reproduced
on the library with both patches applied.

**Decision.** A restore goes down while both sides are containers of the
same kind and writes only what differs. Where a restored value is the
snapshot of an object that is still live, the live object is put back. Undo,
redo and a DevTools jump share that one function (M60).

**Why.**

- Today a restore replaces a changed branch with a copy. After undoing an
  edit to one row, every row of the list is a new object, every row
  component renders again, and a row the caller held is detached.
- It is worse for a store that holds other stores, which decision 11 makes
  ordinary. After one undo every row is a frozen snapshot: a prototype
  method on it throws, and an arrow method writes the old store.
- It is faster. Undo of one row in 1,000 goes from 2,315 microseconds to
  273 on Bun, and 999 row snapshots are kept.

**What stays.** A DevTools jump that the extension sends as JSON restores
data, not class instances. The guide says so.

**Evidence.** `spike-classes-2.md`, V4. 80 lines added, 48 removed, 113
bytes on `./utils`. Not timed on Node.

**Label.** Before 1.0: the reference says "changed fields are replaced with
mutable copies". **Stage 4:** yes, on top of decision 27.

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

**Under revision** for one part, with `spike-combos.md`, K3: what `devtools`
sends for computed values. The sentence below that `devtools` adds them was
never built.

**Decision.** A class getter is no longer an enumerable own accessor of
every snapshot (API question 3, M33). For each class that has getters, one
object that inherits from the class prototype is made once, with one
memoizing accessor per getter, and snapshots of that class are created from
it. Inside a snapshot getter `this` is the frozen snapshot behind a tracker, so it has the store's keys, and the class as its constructor and for `instanceof` (findings 31 and 41, M34). Its prototype is the derived object, not `Class.prototype`. A getter
on an object literal stays an own accessor, listed where the store lists it
(finding 70). `devtools` keeps showing computed values: it adds the getters'
values to what it sends.

**Why.**

- No compared library lists a class getter among the own enumerable keys of
  a copy. Today `Object.keys(store)` and `Object.keys(snapshot(store))`
  differ, and a spread or a `JSON.stringify` of a snapshot runs every getter
  and throws if one does.
- It is the only form that also removes a cost on the path every write in
  every adapter takes: a snapshot of a class with eight getters is four
  times faster to make and holds sixteen times less memory.
- It lets the snapshot's `this` match the store with no filtering, and it
  drops the own key a class setter gets on a snapshot today.

**What it costs a user.**

- A spread or a serialised snapshot no longer carries computed values; they
  have to be named. `{...snap}.total` still type-checks and is `undefined`,
  as it is for any class instance in TypeScript. The tutorial documents
  today's behaviour, so the paragraph changes.
- `Object.getPrototypeOf(snapshot)` is no longer `Class.prototype` for a
  class with a getter. `instanceof` and `constructor` are unchanged. The
  reference's "keep the class prototype" becomes "are instances of the
  class".
- A snapshot of a reactive collection no longer lists `size` in
  `Object.keys` or JSON. `snap.size` reads as before.

**Not taken.** Own accessors that are not enumerable: one line, the same
visible change for `Object.keys` and JSON, none of the gain in time and
memory, and `this` then needs a filter to match the store. Keeping today's
shape, which no report supports.

**Evidence.** `spike-snapshots.md`, N2, form A with S1 of the trap spikes.
122 lines added, 58 removed, in five files; 239 bytes. 14 tests change with
S1: fixes, except that the eight tests of today's shape change by decision.
`persist` saves the same fields as before. The base class of decision 11
gets a correct snapshot on top of it, in one build.

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
on a cycle it has to stop. The two were spiked apart, and together an undo
overflows the stack. Decision 30 carries the fix.

**What it costs a user.** Everything on a cycle gets a new snapshot on every
write to any of it, so a model with parent pointers loses structural sharing
for what the pointers connect. The docs say so and name the alternatives:
hold the parent's id, or hold the parent in an object the store does not
proxy. `JSON.stringify` of such a snapshot throws, as for any cycle, and
`persist` reports it through `onError`.

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
  text. A code with the names saves those 271 bytes with no build split at
  all, and a split saves no more on messages.
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
field. Other warnings follow in a 1.x release. Export conditions are not
used.

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
- It cannot be always on: it makes a cached snapshot eleven to thirteen
  times dearer, and it is 168 to 309 bytes. Behind the guard it costs
  production a few bytes.
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
   its own. A write that changes nothing notifies no one. Decisions 1 and 11
   say which functions are methods.
3. **Delivery.** A write made while synchronous subscribers are being called
   is delivered to them after the round that is running, and before the
   outermost write returns, for up to 100 rounds. A write made inside a
   batched subscriber is delivered to batched subscribers in the same
   microtask, after the round that is running.
4. **Getters.** A getter is lazy. It returns the same result while nothing it
   read through `this` changed, and a correct one after anything it read
   changed. An own-property check (`Object.hasOwn`, `hasOwnProperty`) is not
   a read in that sense. A cycle of getters throws, and the other getters
   keep working.
5. **Snapshots.** The root of a snapshot, and every plain object, array and
   reactive collection in it, is frozen. A value the store does not proxy (a
   class instance without the marker, a native `Map`, `Set` or `Date`, a
   function) is shared with the snapshot by reference, and an object a getter
   returns is not frozen. A subtree that did not change and is not on a
   cycle keeps its snapshot object. Taking a snapshot runs no getter.
6. **Identity.** One object has one proxy, however it is reached through the
   store's proxies and in however many stores it sits. `createClassyStore()`
   on a proxy, or on the raw object behind one, returns that proxy. A value
   the store does not proxy reads back as itself.
7. **An object that has left the store** stays a working store of its own:
   reads, writes, subscriptions and snapshots work, and the store it left is
   no longer told. Put back, it is the same proxy.
8. **The native rules of an object hold through a store**: key order, holes,
   `TypeError` on a refused write, `false` from `Reflect`, and the meaning of
   sealed and frozen.
9. **Memory.** The library keeps no strong reference to a store that nothing
   else references, or to a subscriber after its unsubscribe function was
   called, in a runtime that has `WeakRef`.
10. **`persist`.** Only an elapsed time deletes a stored record that
    `persist` can read. A record it cannot use is reported, and then replaced
    by the next save. An edit made while a read is in flight is not lost. The
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
- What a prototype that is changed after its first read through a store
  does (findings 44 and 47).
- What reflection hands out: `Object.getOwnPropertyDescriptor(store, key)`
  and `structuredClone(store)` (findings 50 and 51).
- Anything reached through the raw object behind a store (finding 11), and
  a write to the backing array of a reactive collection.
- A store made from a function or from a typed array (findings 62 and 63).
- Behaviour in a runtime without `WeakRef` or `FinalizationRegistry`, beyond
  "it works" (finding 68).

### Where this differs from `pinned.md`

- **A method of an object literal** is labelled guaranteed there. Under
  decision 1 it is not a method at all.
- **Rows about the shape of a snapshot** (which keys it lists, where a getter
  lives on it) wait for the snapshot decisions.
- **The ownership rows** are folded into rule 7. The order in which removed
  containers hear of a write stays unspecified.
- **The type tests fail when an export is added.** They stay as change
  detectors, and rule 11 says what is promised.

## Proposed in a report and not taken

Each is named in the entry it belongs to. In one list, with **(final)** on
the ones that 1.0 settles for good, because taking them later would break a
consumer:

- A "lenient" rule that wraps every stored function but list elements,
  classes and `constructor`, and MobX's way of wrapping at the write (M1).
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
- Throwing a subscriber's error to the writer, and `reportError()` (M28).
  **(final)**
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
- A `'migrate'` value for the public `PersistOperation` type, and awaiting
  an `async` `migrate` (M45). **(final)**: a new member of that union would
  break a consumer's exhaustive `switch`.
- An optional `storage`, removing `clearOnExpire`, a pause switch and an
  in-flight flag for `persist` (M46, M49, M55).
- Refusing a cross-tab event that has no `storageArea` (M53).
- One snapshot per direct write on the synchronous channel of `devtools`
  (M57).
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
| M18 to M27 |       10 | M44        |       22 | M74      |       32 |
| M23        |        7 | M45, M46   |   21, 26 | M75      |       33 |
| M54        |       20 | M47, M50   |       24 | M76, M77 |       34 |
| M55        |     None | M48, M49   |   19, 26 | M51, M52 |       23 |
|            |          | M53        |       25 |          |          |

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
   floor guard (decision 4), with the decision record.
2. **Code that is dead today** (20).
3. **The core, reads and writes.** The walk (3). The table per prototype
   (12), which tells the trap "own or inherited" before decision 1 asks. The
   delete (8). `defineProperty` as a write (2). Raw values on write (5).
   Stored functions (1). The searches (6). The realm guard (9).
4. **Getters.** One kind of dependency and the rest of decision 10. Then the
   `has` and `ownKeys` traps (7), which add two records in that one shape.
5. **Snapshots.** Class getters on a derived prototype, with `this` (43).
   Cycles (44). The types (45).
6. **Delivery.** The queue (13), the report that cannot throw and the
   rejection handler (14), the setter (15), `batch()` (16).
7. **Collections.** The membership rule and the snapshot index (42).
8. **Utilities.** `persist` (19, 21 to 25). `devtools` (27). Restore in
   place (30). `history` (28, 29). `subscribeKey` (31).
9. **The base class** (11), which needs 1, 2 and 30.
10. **Adapters.** Vue (37, 38). Angular (37, 39). Solid (37). The `active`
    flags of Vue, Angular and Svelte (42).
11. **Codes** for the messages the library has today (35); every new message
    carries its code from the commit that adds it. The lost-write check and
    its guard (36).
12. **The repository.** The audit step and `CONTRIBUTING.md` (33). The pins
    and permissions of the workflows (32).

A change that makes other code dead removes it in the same commit (20).
Documentation changes go with the change they describe (34).

## Objections and answers

Three agents that took no part in the spikes or in writing this document
reviewed its first complete draft as adversaries:
`review/stage-3/adversarial-whole.md` (W), `adversarial-core.md` (C) and
`adversarial-edges.md` (E). They raised 58 objections; 28 were rated
"wrong", 4 "mislabelled", 13 "unsupported" and 13 "unclear". Every one was
checked against the text and its evidence. None was dismissed as noise.

"Changed" means the entry was rewritten to answer it. "Accepted" means the
objection is right, the cost is taken on purpose, and the entry now says so.
"Open" means a follow-up spike is running and the entry is marked under
revision.

| No. | Against        | Objection                                                                                  | Answer                                                                                             |
| --- | -------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| W1  | 30, 44         | Undo on a store with a cycle never returns                                                 | Open: `spike-combos.md`, K1                                                                        |
| W2  | 27             | Named entries need the synchronous channel the entry ruled out                             | Changed: 27 says what the spike did; 17 no longer lists `devtools` as batched                      |
| W3  | 11, 30         | The base class is ordered before the restore it needs                                      | Changed: the base class follows the utilities in the order                                         |
| W4  | 4              | Nothing enforces the ceilings, and one record switches the guard off                       | Changed: stage 4 starts with the tooling; the guard works per commit                               |
| W5  | 4, 45          | The collections ceiling rests on 32 bytes where the report says 55                         | Changed: 55, and a ceiling of 950                                                                  |
| W6  | 32             | The split does not stop a rewritten `dist`, and its first run would be the 1.0 publish     | Changed: pins and permissions now, the split after 1.0, and the "why" corrected                    |
| W7  | 20             | Dead code removed last breaks the mutation rule in between                                 | Changed: dead code goes in the commit that makes it dead                                           |
| W8  | 1              | An object-literal method stops being a transaction, in silence                             | Open: `spike-functions.md`                                                                         |
| W9  | 36, 11         | Thirteen silent failures remain in 1.0, and the base class covers only classes that change | Changed: the lost-write check ships in 1.0; the rest are listed in the docs. Accepted for the rest |
| W10 | 27, 36         | `enabled: true` is locked in for all of 1.x                                                | Changed: on, except where `NODE_ENV` is `production`                                               |
| W11 | 42, 37         | Solid's flag cannot go, and the change sits in two steps                                   | Changed: Vue, Angular and Svelte drop theirs; one place in the order                               |
| W12 | 8, 9, 28, 37   | Four labels contradict the definition                                                      | Changed: 8, 9, 28 and the Vue half of 37 are "before 1.0"; 9 ships in 1.0                          |
| W13 | Guarantees     | Rules 2, 3 and 5 are false as written; "error text" contradicts the stable codes           | Changed: the rules are rewritten, and rule 12 added                                                |
| W14 | 20, 24, 28, 34 | Finding 4 and M37 are decided nowhere; 24 and 28 have no decision text                     | Changed: finding 4 in 20, M37 in 34, both texts written                                            |
| W15 | Not taken      | The list misses choices that 1.0 makes final                                               | Changed: completed, with the final ones marked                                                     |
| W16 | 4, 35          | The figures disagree, and the set was never built or timed                                 | Changed: one sum, 4,820 and 32%; the entry says the ceilings are estimates                         |
| W17 | 4, 27, 9, 7    | Four items buy little for their bytes, and the hook costs every method call                | Changed: 4 weighs each. Open for the hook: `spike-combos.md`, K2                                   |
| W18 | 43             | What `devtools` sends for computed values was never built                                  | Open: `spike-combos.md`, K3                                                                        |
| C1  | 30, 44         | The same as W1, reproduced on the library                                                  | Open: K1                                                                                           |
| C2  | 5              | After a freeze through the store a child reads back raw and its writes are lost            | Open: `spike-core-2.md`, F1                                                                        |
| C3  | 11             | One function in two stores writes the first store                                          | Open: `spike-functions.md`                                                                         |
| C4  | 11             | A subclass that overrides an arrow method loses the transaction                            | Open: `spike-functions.md`                                                                         |
| C5  | 11             | The same as W3                                                                             | Changed                                                                                            |
| C6  | 12             | A getter redefined on the class keeps its old body on the live store                       | Open: `spike-core-2.md`, F2                                                                        |
| C7  | 6              | A list of saved snapshots gets wrong answers from the searches                             | Open: `spike-core-2.md`, F3                                                                        |
| C8  | 7              | `Object.hasOwn(this, …)` in a getter stays stale, against rule 4                           | Changed: 7 and rule 4 name it as not tracked. Accepted: a trap for it can follow                   |
| C9  | 43             | The same as W18                                                                            | Open: K3                                                                                           |
| C10 | 43             | A spread loses computed values with no error                                               | Accepted: every compared library does this; 34 adds the sentence and the changelog note            |
| C11 | 43             | `this` does not have the store's prototype                                                 | Changed: the sentence says keys, constructor and `instanceof`                                      |
| C12 | 10             | The throw on a snapshot holds in strict code only                                          | Open: `spike-core-2.md`, F4                                                                        |
| C13 | 10             | The own-node form of the live-store throw was never weighed                                | Open: F4                                                                                           |
| C14 | 1              | The tie-breaker is false: the strict rule's cost is silent too                             | Open: `spike-functions.md`                                                                         |
| C15 | 7, 10, 43      | The three were never run together, and 7's figures are for a design nobody will build      | Changed: 7 and 4 say so; stage 4 takes its figures from its own build                              |
| C16 | 29, 30, 11     | A jump by JSON could delete every arrow method                                             | Changed: 29 says a restore from outside never touches a function field                             |
| C17 | 11, 27         | An arrow method gets no name for `devtools`                                                | Open: `spike-functions.md`                                                                         |
| C18 | 45             | A subclass of a collection loses its members in the snapshot type                          | Changed: 45 says so, and that a hook for it can follow                                             |
| E1  | 21, rule 10    | Without `onError` a refused record is still silent, and the next save replaces it          | Changed: a default report to `console.error`; rule 10 says what happens to it                      |
| E2  | 19, 11         | A restore inside a constructor is lost to a subclass's initialisers                        | Accepted: nothing can detect it; 19 names it, the guide forbids it, and a test pins it             |
| E3  | 27             | The same as W2                                                                             | Changed                                                                                            |
| E4  | 14, rule 1     | A console that throws sends its error to the writer and stops the round                    | Changed: the report is guarded                                                                     |
| E5  | 16             | The type cannot see most callers, and a runtime refusal can only come before 1.0           | Changed: an `async` function is refused when it arrives, in every build                            |
| E6  | 21             | An `async` `migrate` is called and its rejection left unhandled                            | Changed: refused before the call, and a handler on a returned thenable                             |
| E7  | 26             | Removing `clearOnExpire` deletes data, and was never spiked                                | Changed: it stays                                                                                  |
| E8  | 30             | An undo writes into an object that now lives in another store                              | Open with K1: 30 will state the rule and carry the test                                            |
| E9  | 30             | The same as W1                                                                             | Open: K1                                                                                           |
| E10 | 11, 30         | The same as W3                                                                             | Changed                                                                                            |
| E11 | Rule 3         | False for a write made inside a batched subscriber                                         | Changed: one sentence per path                                                                     |
| E12 | Rule 5         | Contradicts decision 44                                                                    | Changed: "and is not on a cycle"                                                                   |
| E13 | Rule 10        | A second `save()` in one task reaches storage a microtask later                            | Changed: "the first of a task"                                                                     |
| E14 | Rule 6         | An object reached through a frozen container reads back raw                                | Changed: "through the store's proxies". Open for the behaviour: F1                                 |
| E15 | Rule 2         | Leaves out arrow methods and the `async` method rule                                       | Changed                                                                                            |
| E16 | 38             | A write to the Vue ref is ignored in silence                                               | Changed: it throws                                                                                 |
| E17 | 37             | The Vue half changes a documented shape                                                    | Changed: "before 1.0" for Vue                                                                      |
| E18 | 42             | The index is skipped for tracked React reads; Solid's flag stays                           | Changed: both stated                                                                               |
| E19 | 39             | The Angular message names the function in development mode only                            | Changed: the adapter throws its own coded error                                                    |
| E20 | 21             | The version rule is stated three ways                                                      | Changed: one rule, with `null` refused                                                             |
| E21 | 19             | The spike's gap, a `hydrated` that never settles, was dropped                              | Changed: 19 carries it                                                                             |
| E22 | 13             | What an adapter of another store shows inside a round, and no criterion for the variant    | Changed: stated, and the variant is taken on a stated condition                                    |

A second round of review follows once the three spikes have reported and the
nine entries are rewritten.
