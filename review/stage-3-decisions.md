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
getter) is decided with how a snapshot carries class getters. **Open**, with
the snapshot report.

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
- A getter that writes to the store throws, on a snapshot and on the live
  store.

**Why.**

- It removes findings 32, 36 (the getter that catches an error), 37, 38 and
  39, and the cost that doubles per level for getters arranged as a diamond.
- One kind of dependency is the smallest of the correct designs: 77 bytes
  smaller than three kinds with the fix added on.
- The stamp is safe for a subtree that has left the store. That was the open
  question, and it is now tested: a differential fuzz of 300 seeds compared
  180,112 getter reads with a plain mirror, 55,058 of them on a node outside
  the store, and it holds under decision 3.
- **A getter that writes throws on both layers**, not only on a snapshot. A
  snapshot is frozen, so the write cannot happen there, and every adapter
  reads snapshots. A getter that writes is therefore broken for every
  component already, in silence. Throwing on the live store too makes the
  same getter behave the same way wherever it runs, and shows the mistake in
  the first test that touches it. No getter in the examples, the docs or the
  library source writes to a store.

**Not taken.**

- Recording reads outside the getter's own node (another store, a static).
  It costs 124 bytes and 14 to 18% on a getter over 1,000 rows, and it cannot
  work on a snapshot. The docs state the limit and the pattern that works:
  hold the other store as a field.
- Caching a thrown error. 73 bytes and seven pinned behaviours for one gain.
  It can follow 1.0, and whether errors are cached is **unspecified**.

**Evidence.** `spike-getters.md`. The combination: 182 lines added, 144
removed, 165 bytes. 16 tests change: 15 fixes and 1 incidental. With the
throw on the live store: 51 bytes more, and 4 more incidental tests. On Node
a cached getter read is 26% faster and a recompute 6 to 9% slower; the four
cost ratios stay inside their limits on both engines.

**Label.** Before 1.0: a getter that writes becomes an error, and the
sentence about an absent field goes. **Stage 4:** yes.

### 11. A nested class instance without `PROXYABLE`, arrow-function methods and `#private` fields

**Open**, with the class report (M11, M12).

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
Whether a development build warns when a synchronous subscriber is called
many times in one task is decided with the development build. **Open** for
that part.

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
