# Stage 3 decisions

Stage 3 of the pre-1.0 review. No library source has been changed. Stage 4
implements what is decided here, one change per commit, test first.

**Status: draft.** Sections marked "open" wait for a report that is still
being written. No decision here stands until a fresh agent has reviewed the
finished document as an adversary and its objections are answered in
"Objections and answers".

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

## The four decisions the rest hangs on

### 1. A method is a function on the prototype chain; a function held in a field or a list is data

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
`Object.freeze(store)` keeps working and stays silent. No `setPrototypeOf`
trap is added.

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

### 4. The size budget moves once, for the whole set

**Open.** It waits for the development-build report, which measures how many
bytes of message text can leave the production build, and for the snapshot
and class spikes.

What is known:

| Change                                            | Main entry, bytes |
| ------------------------------------------------- | ----------------: |
| Today                                             |             3,661 |
| Proxy traps as decided (decisions 1, 2, 5 to 9)   |    about 550 more |
| Getters (decision 10)                             |          165 more |
| Subscriber delivery (decisions 13 to 16)          |          189 more |
| The descriptor cache (decision 12)                |          119 more |
| Dead lines and the walk (decisions 3 and 20)      |          68 fewer |
| The action-name hook for `devtools` (decision 27) |           20 more |

Parts measured alone do not add up exactly, because of how gzip shares
strings. The sum is near 4,650, before snapshots and classes.

## Bugs

### 5. Raw values on write, and one node per raw object

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

**Label.** Can follow 1.0. **Stage 4:** yes.

### 9. Two guards, one taken in part and one not taken

**Decision.**

- **A plain object from another realm is state** (M13). Taken, on one
  condition: stage 4 first builds it without the per-prototype cache. If
  that costs no more than about 40 bytes and store creation stays inside the
  spread, it lands. If not, it waits for a 1.x release.
- **A read of a property frozen behind the store's back** (finding 46, M7).
  Not taken. The docs say instead that the raw object must not be frozen once
  a store holds it.

**Why.** The first failure is silent: writes to such an object notify no one
and its snapshot is not frozen. It is also rare, and 81 bytes as spiked is
more than its share. The second failure is loud, a `TypeError` on the read,
and its guard stops being cheap once the descriptor cache is in (decision
12): it would take back most of what the cache gains on a nested read.

**Evidence.** `spike-traps.md`, T6, with the table that times the guard on
top of the cache.

**Label.** Can follow 1.0, both. **Stage 4:** the first, under its condition.

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
- **In such a class an arrow function in a field is a method**: bound to the
  store and run as one transaction. This is the one exception to decision 1.
- **A `#private` field is never state.** The docs say so. With the base
  class it can be used on the live store; a snapshot cannot carry it.
- **Whether the base class ships in 1.0 or in a 1.x release is open.** It
  ships in 1.0 only if a second spike confirms what the first only reasoned:
  real compilers, the four other adapters, undo and time travel of a nested
  base-class store, and getters that construct one. Adding it later breaks
  nothing, so nothing forces it.

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

**What it costs a user.** A callback assigned to a field of a base-class
store reads back as its wrapper, not as the function that was assigned. In a
store made with `createClassyStore()` it reads back as itself. Two rules for
a function in a field is the price, and the second spike is asked whether
the exception can be limited to what the constructor installs.

**Not taken.** Detecting an arrow function by its source text: it finds 6 of
7 lost writes, reports 2 fields that lose nothing, and costs 256 to 342
bytes. An `opaque()` helper and a mixin form of the base class.

**Evidence.** `spike-classes.md`. The base class: 4 lines, 13 bytes. The
exception for arrow functions: 83 bytes. With decisions 1 and 2 in one
build: 28 tests change, 27 of them the trap patches' and 1 the export list.
Run with React only; the other points are what `spike-classes-2.md` is for.

**Label.** The default for nested instances: before 1.0, and no code. The
base class: can follow 1.0. **Stage 4:** open, see above.

**After 1.0** (decision 36): a report of a write that was lost because it
went to the raw object, which is precise, and a warning for an unmarked class
placed in a store once it can be silenced for a class that is opaque on
purpose.

## Performance

### 12. A table per prototype answers "is this key a getter?"

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

**Decision.** A write made while subscribers are being called is queued and
delivered after the round that is running, and before the outermost write
returns. A subscriber removed during delivery is not called. A subscriber
added during delivery hears the next change, not the one in flight. Delivery
stops after 100 rounds and reports it. One queue serves all stores, and one
microtask serves every batched round.

Three choices inside it:

- **A subscriber hears of its own write**, once, as in MobX and Preact. A
  subscriber that corrects state has to stop writing once the state is right.
- **One microtask for every batched round**, the same rule as the
  synchronous path.
- **The report of the bound goes where a subscriber's error goes** (decision
  14).

**Why.** It removes findings 18 to 22, among them a stack overflow and an
event loop that never drains. MobX, Preact Signals, Vue and Svelte reach the
same design. It also makes an ordinary write faster, because every write now
takes one path: the write ratio goes from 2.69 to 2.21 on Bun and from 1.4 to
1.06 on Node.

**What it costs.** A direct write with a synchronous subscriber attached is
about 85 nanoseconds slower on Bun and 30 on Node. A variant that avoids it
costs 30 more bytes; stage 4 measures both on a quiet machine and keeps the
one inside the limits.

**Evidence.** `spike-delivery.md`, D1. 72 lines added, 36 removed. 16 tests
change: 13 fixes and 3 incidental. The queue costs 33 bytes; the bound and
its message 75 to 130 more, depending on the text.

**Label.** Before 1.0: the order of calls changes, and what a removed or a
late subscriber gets goes into the spec as guaranteed. **Stage 4:** yes.

### 14. A subscriber's error is caught and logged; the writer is never told

**Decision.** Keep today's rule and write it into the spec: a subscriber's
error is caught, the other subscribers run, and the code that wrote is not
told. The rejection of an `async` subscriber is caught and logged in the same
way.

**Why.** Every adapter is a synchronous subscriber, so the code that fails is
usually not the code that wrote. Throwing to the writer makes an unrelated
`store.count = 1` throw after the count has changed, hides a method's own
error and loses its return value. On the microtask path there is no writer at
all. The rejection handler makes the two ways a callback can fail land in one
place, for 25 bytes.

**Not taken.** Throwing the first error to the writer (Preact, Legend-State
3). `reportError()`, which ends a Bun process and only logs on Node. A
reporter the application can replace is an addition and can follow 1.0.

**Evidence.** `spike-delivery.md`, D2. 1 test changes, a fix.

**Label.** The rule: before 1.0, as a line in the spec. The handler: can
follow 1.0. **Stage 4:** both.

### 15. A setter is a transaction

**Decision.** A class setter that writes two fields notifies a synchronous
subscriber once (finding 43).

**Evidence.** `spike-delivery.md`, D3. 8 lines, 5 bytes. 2 tests change, both
fixes.

**Label.** Before 1.0: one sentence in the reference. **Stage 4:** yes.

### 16. `batch()` refuses, by its type, a callback that returns a promise

**Decision.** The parameter of `batch()` becomes a function whose result is
not a promise, with a type whose error message says why. No runtime check in
production.

**Why.** `batch(async () => …)` groups only the writes before the first
`await` and hands back the promise as if it had worked. The type stops that
where it is written, for no bytes. It also refuses a callback that writes and
then returns a promise, which batches everything it should. That is
accepted, because the choice is not symmetric: accepting promises again
after 1.0 is a compatible change, and refusing them after 1.0 would be a
breaking one.

**What it costs a user.** `batch(() => { store.loading = true; return
save(); })` is rewritten with the `save()` outside. A wrapper generic over
the result of `batch()` needs a cast.

**Evidence.** `spike-delivery.md`, D4. 7 lines, 0 bytes. 3 type assertions in
2 test files change, all fixes.

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
write), and would turn the option of `persist`, `withHistory`, `devtools` and
`subscribeKey` around.

**Evidence.** `spike-delivery.md`, D5, with the counts per case.

### 18. Writes outside a method stay allowed, without a warning

**Decision.** No change (API question 2, M32). `batch()` stays in the API.
A warning when a synchronous subscriber is called many times in one task
follows in 1.x (decision 36).

## `persist`, `devtools` and `history`

### 19. When hydration happens

**Decision.** `persist()` restores before it returns when the storage is
synchronous. It awaits only a storage that returns a promise. There is no
option for it; `skipHydration` keeps its meaning.

**Why.** A store on `localStorage` renders its defaults first today, and the
saved state a microtask later. The change is 15 lines added and 18 removed,
and `./utils` gets 6 bytes smaller.

**What it needs.** With it, a store prepared for hydration after a
module-level `persist()` would capture the restored state. How the React
server snapshot is captured is decided with the adapters. **Open** for that
part (M70).

**Evidence.** `persist-devtools.md`, P1. 1 test changes, incidental: it
relies on the old timing.

**Label.** Before 1.0. **Stage 4:** yes.

### 20. Dead and redundant code goes

**Decision.** Remove the ten dead lines of the three core files in the form
the type checker accepts, and the dead blocks of `persist.ts` (M54, finding
54), including the per-field bookkeeping of a restore that decisions 22 and
23 make unreachable. The ternary in `activeTracker()` stays: it looks dead
and is on the path of every read.

**Evidence.** `own-code.md`, `r5`: 8 lines added, 17 removed, 32 bytes
smaller, no test fails, typecheck passes. `persist-devtools.md`, "Seen on the
way". The claim about `activeTracker()` rests on a patch that changed several
things at once and is timed alone before stage 4 relies on it.

**Label.** Can follow 1.0. **Stage 4:** yes, last among the core changes, or
the patches of decisions 1 and 2 will not apply.

### 21. Nothing `persist` cannot use is skipped in silence

**Decision.** Every stored record `persist` cannot use reaches `onError` as
`'parse'`, with the reason in the message: an envelope that is not an object,
a `state` that is not a plain object, a version that is not a number, a
version that differs with no `migrate`, and a `migrate` that returns
something other than a plain object, a promise included. No new operation
name is added. A record without a usable `expiresAt` is restored and written
back with one.

**Why.**

- One channel for every failure of a read (the reference's `onError`), not a
  second one.
- An `async` `migrate` is refused and not awaited. Awaiting it would put a
  turn between the read and the apply, which is what decision 19 removes.
- Counting a record without `expiresAt` as expired would wipe every user's
  saved state on the release that adds `expireIn` to an application. The
  rule that stands is the tested one: only an elapsed time may delete stored
  data.

**Evidence.** `persist-devtools.md`, P2. 144 bytes on `./utils`. 8 tests
change, all pins of the silence.

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

### 26. `persist` options

**Decision.**

- `storage` stays required. Making it optional later is an addition. A
  default of `localStorage` would add a new silence where it is missing.
- `clearOnExpire` is removed: an expired record is always cleared.
- The other names stay.

**Label.** Before 1.0, for `clearOnExpire`. **Stage 4:** yes. Removing the
option was reasoned, not spiked.

### 27. `devtools`

**Decision.** One entry per outermost method, named after it. A jump replaces
the state exactly, in one transaction, without calling setters, so a `Date`
stays a `Date`. `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled.
`enabled` stays `true` by default. Entries are not sent on the synchronous
channel.

**Why.** Every entry is named `STORE_UPDATE` today, which makes the tool's
list useless, and a jump adds unknown fields, never deletes missing ones and
calls setter-only accessors. The name of the method costs 20 bytes in the
main entry, for a hook in `transactional()`; that is the price of knowing
which method wrote.

**Evidence.** `persist-devtools.md`, P7. 403 bytes on `./utils`. No test
changes, because stage 1 added none for `devtools`; stage 4 writes them
first. Not verified: the entry ids the Redux DevTools extension sends back.

**Label.** Before 1.0. **Stage 4:** yes.

### 28. An edit made in the same tick as `undo()` is recorded

**Evidence.** `persist-devtools.md`, P8. `./utils` 24 bytes smaller. 1 test
changes, a fix (finding 57).

**Label.** Can follow 1.0, though the history guide describes the old
behaviour and that sentence goes. **Stage 4:** yes.

### 29. To `withHistory`, a function in an own field is data

**Decision.** Undo removes a function that was added to a field and puts
back one that was replaced, by reference (finding 60, M59). Methods on the
prototype are untouched, as today.

**Why.** It follows from decision 1. Once a function in a field is data to
the store, history cannot be the one place that treats it as behaviour.

**Evidence.** None beyond the stage 1 test that pins today's behaviour. It
was reasoned, not spiked, so stage 4 writes the test first and stops if the
change turns out larger than a few lines in `history.ts`.

**Label.** Before 1.0. **Stage 4:** yes, after decision 1.

### 30. Undo and time travel change a nested object in place where they can

**Open**, with `spike-classes-2.md` (M60). Today a restore replaces a changed
branch with a deep copy: every row of a changed list is a new object, and a
base-class store inside another store comes back as a frozen copy.

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
so it has the store's keys and prototype (findings 31 and 41, M34). A getter
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

**Evidence.** `spike-snapshots.md`, N4. No unit test changes. Type tests in 3
files change, all fixes. `./collections` grows by 32 bytes with a short
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
contracts hand the value to the framework at once; for them the answer is the
cost of a snapshot itself (the snapshot decisions) and `batch()`, which the
guides name.

**Evidence.** `adapters-collections.md`, A1. 34 to 44 bytes per entry. 1 test
changes, incidental: `isShallow` on the Vue ref, which is no longer a shallow
ref.

**Label.** Can follow 1.0. **Stage 4:** yes. Each adapter change runs its
framework's packed-app and browser suite, which the spike did not.

### 38. Vue: no listener is left by a server render, and the ref is read-only

**Decision.** On the server the Vue adapter subscribes to nothing and reads
the store at every read. The returned ref is typed
`Readonly<Ref<Snapshot<T>>>`, and a write to it is ignored.

**Why.** Vue does not dispose component scopes during a server render, so a
store that outlives the request gains one listener per render (M64). The fix
stage 2 proposed, subscribing in `onMounted`, removes the leak and breaks
something else: a store written in `onServerPrefetch`, Vue's own way to load
data on the server, then renders its old value. Reading at the read removes
the leak and keeps that write. A snapshot is frozen, so a writable ref
promises something the value cannot do (finding 17, M65).

**Evidence.** `adapters-collections.md`, A2: 0 listeners after three server
renders against 1, 2, 3, and the `onServerPrefetch` write still renders. The
type was not compiled against Vue 3.2.0, the floor of the peer range; stage 4
does that first.

**Label.** Before 1.0, for the documented return type. **Stage 4:** yes, in
one change with decision 37 for Vue.

### 39. Angular: a store write inside a `computed` is not lost, and `injectClassyStore` takes an injector

**Decision.** The adapter updates its signal inside `untracked()`.
`injectClassyStore(store, {injector})` works outside an injection context,
and the error for a missing context names `injectClassyStore()`.

**Why.** Today a store write made while a `computed` runs makes Angular
throw inside the listener; the core logs it and the signal stays stale until
the next write (M66). The option is an addition, and is cheapest to add
while the signature is being written down for 1.0 (M67).

**Evidence.** `adapters-collections.md`, A3. 19 bytes for the fix, 51 more
for the option and the message.

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
  (M40), built on the second lookup.
- **No index beside the live array in 1.0.** It is 100 times faster on a hit
  and costs 339 bytes, and it answers wrong after a write to the raw backing
  array, which today's scan gets right. Decision 45 keeps the backing arrays
  public and says that writing to them directly is unspecified, which leaves
  room for it later.
- **Native `Map` and `Set` stay opaque** (API question 5, M38), and
  `reactiveMap` and `reactiveSet` stay separate classes. No library has a
  frozen native `Map`: one can still be written through `Map.prototype.set`.
- **The adapters drop their `active` flags** once decision 13 is in, because
  the core then skips a removed subscriber. Angular's `destroyed` check
  stays.

**Evidence.** `adapters-collections.md`, A6 and A7. The membership rule: 13
bytes, and the 2 tests that pin findings 33 and 34 change. The snapshot
index: lookups among 10,000 members go from 160 to 525 microseconds to under
0.1, and `./collections` grows from 727 to about 843 bytes.

**Label.** The membership rule: before 1.0, because the collections guide
documents today's `-0`. The index: can follow 1.0. **Stage 4:** both, and the
flags in the same change as decision 13.

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

### 36. No development build in 1.0; warnings follow in 1.x

**Decision.** 1.0 ships one build with no development-only code. Warnings
for the silent failures come in a 1.x release, guarded by an inline read of
`process.env.NODE_ENV` at each call site, after a test that is cheap and
almost always false. Export conditions are not used.

**Why.**

- A warning changes no behaviour, so it can arrive in any release. Nothing
  about it has to be settled before the API is frozen, except the rule of
  decision 35, which is.
- A warning that fires for correct code and cannot be silenced is worse than
  none. Of the candidates, two are precise: a write that was lost because it
  went to the raw object, and a synchronous subscriber called many times in
  one task. The others are not yet: a warning for an unmarked class instance
  fires for seven kinds of object that are no mistake, and one for a write
  after an `await` would fire for the ordinary `async` method. They need a
  design pass that 1.0 does not have to wait for.
- The guard has traps of its own. A module-level constant leaked 218 bytes
  into production where an inline read cost 6, and an inline read on the
  path of a write cost 184 nanoseconds on unbundled Node. That is a rule for
  every guard and a test on the built file, and it is better added with the
  first warning than before it.

**What follows for other entries.**

- `batch()` gets its type and no runtime check (decision 16).
- `devtools` keeps `enabled: true` as its default, and the guide says that
  the extension receives every state (decision 27). The library reads no
  environment in 1.0, so it cannot tell a production page.
- The unmarked-class and lost-write warnings of decision 11, and the warning
  for many synchronous calls of decision 18, are the first for 1.x.

**Not taken.** Export conditions (`development` and `production`): plain
Node, `bun test` and an unminified bundle would load the production build in
silence, the published files double, and `check:package` does not check the
second branch.

**Evidence.** `devbuild.md`. The five spiked warnings fail no test and cost
31 bytes in production together.

**Label.** Can follow 1.0. **Stage 4:** no.

## The release workflow, dependencies and documentation

### 32. The publish step gets a job of its own

**Decision.** `release.yml` is split in two. The first job installs, builds,
runs Changesets and, on a commit that is to be published, packs the tarball
and uploads it. The second holds `id-token: write`, installs nothing,
downloads the tarball and publishes it. Every third-party action is pinned to
a commit. Checkouts that do not push set `persist-credentials: false`. The
three workflows that declare no permissions get `contents: read`.

**Why.** Today one job holds the publishing identity and also runs
`bun install`, the build and Changesets, so a compromised development
dependency or a moved action tag could publish a version with valid
provenance. The change costs no library code.

**What it risks.** A release workflow cannot be tried without releasing, and
no agent runs it. The change is therefore one small commit, read line by line
against the workflow that published 0.11.0, and the stage 5 report lists it
as something the owner should watch on the first release.

**Only the owner can do** two steps, and the workflow works without them: a
GitHub environment for the publish job with a required reviewer, and the npm
settings that accept only that environment and refuse publishing with a
token.

**Evidence.** `review/stage-2/security.md`, finding 12 (M74). That code in
the job can take the token comes from how GitHub and npm document the
mechanism; nobody tried it.

**Label.** Can follow 1.0. **Stage 4:** yes, as its last commit.

### 33. Dependencies

**Decision.** `proxy-compare` stays pinned to an exact version, and
`CONTRIBUTING.md` says why. CI gets a `bun audit` step that reports and does
not fail. The published tarball is accepted as it is (M75).

**Stage 4:** yes.

### 34. Documentation

**Decision.** The documentation changes listed under M76 are made in stage
4, each with the code change it belongs to, or in stage 5 where no code
changes. The limits listed under M77 stay as they are and go into the
unspecified list below or stay documented where they are documented.

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
   itself subscribed; the code that wrote is never told.
2. **Transactions.** A prototype method, a setter, an array method and
   `batch()` each notify synchronous subscribers once, when the outermost
   call returns, and that covers every store written inside it. A write that
   changes nothing notifies no one.
3. **Delivery.** A write made while subscribers are being called is delivered
   after the round that is running, and before the outermost write returns.
4. **Getters.** A getter is lazy. It returns the same result while nothing it
   read through `this` changed, and a correct one after anything it read
   changed. A cycle of getters throws, and the other getters keep working.
5. **Snapshots.** A snapshot is frozen. An unchanged subtree keeps its
   snapshot object across snapshots. Taking a snapshot runs no getter.
6. **Identity.** One object has one proxy, however it is reached and in
   however many stores it sits. `createClassyStore()` on a proxy, or on the
   raw object behind one, returns that proxy. A function, a class and any
   other opaque value held in a store read back as themselves.
7. **An object that has left the store** stays a working store of its own:
   reads, writes, subscriptions and snapshots work, and the store it left is
   no longer told. Put back, it is the same proxy.
8. **The native rules of an object hold through a store**: key order, holes,
   `TypeError` on a refused write, `false` from `Reflect`, and the meaning of
   sealed and frozen.
9. **Memory.** The library keeps no strong reference to a store that nothing
   else references, or to a subscriber after its unsubscribe function was
   called, in a runtime that has `WeakRef`.
10. **`persist`.** Only an elapsed time deletes stored data. An edit made
    while a read is in flight is not lost. `save()` and `clear()` reach a
    synchronous storage before they return. After `dispose()` nothing is
    read, written or scheduled.
11. **Exports.** Every export the reference lists exists with its documented
    signature. The list may grow in a minor release.

### Unspecified

- The order in which different nodes, owners and stores are notified
  (findings 24 and 69).
- How calls nest when a subscriber writes, and which microtask a batched
  round runs in.
- Where a subscriber's error is reported, and the text of every error
  message.
- Whether a getter re-runs more often than rule 4 requires, and whether a
  thrown error is cached.
- What a prototype that gains a getter after its first read through a store
  does (findings 44 and 47).
- What reflection hands out: `Object.getOwnPropertyDescriptor(store, key)`
  and `structuredClone(store)` (findings 50 and 51).
- Anything reached through the raw object behind a store (finding 11).
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
