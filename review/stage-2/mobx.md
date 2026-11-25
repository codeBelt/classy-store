# Stage 2: MobX

Read-only comparison of `@codebelt/classy-store` with MobX, for stage 3 of the
pre-1.0 review. Nothing in the repository was changed apart from this file.

## The library and what was read

- **Library:** MobX 7.1.7, the `latest` tag on npm on 2026-11-18.
- **Source:** `github.com/mobxjs/mobx` at tag `mobx@7.1.7`, commit
  `f8cf51330d278ad45a3c0c70e35a79f420555044` (2026-11-13).
- **What ran:** the published `mobx@7.1.7` package in a scratch folder, on Bun
  1.4.4. With `NODE_ENV` unset Bun loads `dist/mobx.cjs.development.js`, so
  the development checks are on unless a block says otherwise.
- **Our side:** `release/1.0` at `825ba2d`. The library source is unchanged
  since `9ab9744`. Scripts import `packages/classy-store/src/index.ts`
  directly.

Files read in full, all under `packages/mobx/src/`:

- `core/`: `atom.ts`, `derivation.ts`, `computedvalue.ts`, `observable.ts`,
  `action.ts`, `reaction.ts`, `globalstate.ts`. There is no
  `core/transaction.ts`: batching is `startBatch` and `endBatch` in
  `core/observable.ts`, and the public wrapper is `api/transaction.ts`.
- `types/`: `observableobject.ts`, `observablearray.ts`, `dynamicobject.ts`,
  `modifiers.ts`, `observablevalue.ts`, `autoannotation.ts`,
  `actionannotation.ts`, `computedannotation.ts`, `observableannotation.ts`,
  `overrideannotation.ts`.
- `api/`: `makeObservable.ts`, `action.ts`, `transaction.ts`, `autorun.ts`,
  `observable.ts`, `configure.ts`, `tojs.ts`.
- `errors.ts`.

Read in part: `api/extendobservable.ts`, `api/flow.ts`, `api/decorators.ts`
(one function), `scripts/create-rollup-config.mjs` (the development flag), and
the 7.0.0 entry of `packages/mobx/CHANGELOG.md`.

Not read: `observablemap.ts` and `observableset.ts` beyond their class
declarations, `spy.ts`, the intercept and observe utilities, and the React
binding packages.

## How MobX differs, in short

Three facts bound what can be taken from it.

1. **Every observable property is its own node.** A read reports to one global
   "derivation that is running now". A write marks that property's observers
   stale. Computed values recompute when read; reactions run when the
   outermost batch ends.
2. **A class instance is not wrapped.** `makeObservable(this)` in the
   constructor replaces each field with an accessor pair on the instance
   itself. Only plain objects and arrays get a Proxy, and those are copies of
   what the caller passed in.
3. **There are no snapshots, versions or parent links.** `toJS` copies the
   whole tree on every call.

So MobX has nothing to say about structural sharing or `ownership.ts`. It has
a great deal to say about getters, transactions, subscriber delivery,
diagnostics and `this`.

## Findings

Each reproduction is an excerpt from the output of a script in "Ported tests"
at the end, where every script and its whole output are given. Where an
excerpt is abridged or relabelled, it says so.

### 1. A getter records only what it reads on its own node

**What they do.** There is one slot, `globalState.trackingDerivation`
(`core/globalstate.ts:43`). Every observable read calls `reportObserved`
(`core/observable.ts:177-205`), which appends the property's node to the
running derivation, whichever object the property belongs to.
`bindDependencies` (`core/derivation.ts:226-286`) then subscribes the
derivation to each one. A getter on one object that reads a field of another
object depends on it like on anything else.

**What we do.** `recordDep` returns early unless the read happened on the node
that owns the getter (`core.ts:88-91`). Reads below an own child are covered,
because reading the child records a dependency on the version of its whole
subtree (`core.ts:93-101`). A read on any other node records nothing: another
store, or a child reached through a reference that was not read from `this`
during this run.

**Difference in behaviour.** Script 03:

```text
MobX observed   [20,30] runs: 2
Ours live       [20,20] runs: 1 | first snapshot after: 30
```

Our live getter keeps 20 for good, and the first snapshot disagrees with the
live store. This is the first two cases of stage 1 finding 36 and the note
under finding 28.

**Proposal: adapt.** We cannot take per-property subscriptions, but we can
meet the rule "every reactive read during a getter is a dependency" with what
we have. When a read happens on a node other than the getter's own, record a
dependency on that node's version, once per node per run. Skip it when the
node was handed out, during this run, by a node that is already covered: that
is the case of `this.rows[0].price`, which the dependency on `this.rows`
covers today. A read into another store starts at that store's root, and
versions bubble up to the root, so one dependency on the foreign root covers
everything read below it. This is coarser than MobX (any write in the other
store invalidates the getter), and it is the granularity our child
dependencies have already.

**Kind.** Bug.

**Cost.** `core.ts` (`recordDep`, the `get` trap, `areDepsValid`) and
`core.types.ts`. Not breaking. The snapshot layer has the same gap and is
harder: `computeWithTracking` sees only reads on `this` (`snapshot.ts:80-91`),
and a snapshot getter that reads another store reads that store live. Risk:
one set lookup more per object a getter walks through, to be measured against
the "getter that sums 1,000 rows" baseline; and a reference to a detached,
suspended container needs `resumeScope()` before its version is compared
(`ownership.ts:147-156`). This needs a stage 3 spike.

### 2. An inner getter that throws leaves no trace

**What they do.** `trackDerivedFunction` runs the getter inside `try`, keeps
a thrown error as the result, and still binds the dependencies read before
the throw (`core/derivation.ts:181-192`). `ComputedValue.get` keeps that
result as its cached value and rethrows the cause on every read
(`core/computedvalue.ts:237-242`). The outer getter registers its dependency
on the inner one before the inner one computes: `reportObserved(this)` comes
before the computation in `get` (`computedvalue.ts:218`). When a dependency
throws while it is being re-checked, that counts as a change
(`derivation.ts:96-105`).

**What we do.** `evaluateComputed` caches on normal return only
(`core.ts:189-195`), so a getter that throws keeps neither a result nor a
dependency list. The `get` trap records the dependency on a getter after
`evaluateComputed` has returned (`core.ts:467-476`), so when the inner getter
throws, the outer getter records nothing either. The snapshot layer has the
same order: `computeWithTracking` adds the dependency after `Reflect.get`
returns (`snapshot.ts:84-88`).

**Difference in behaviour.** Script 02. A getter `safe` catches the error of
a getter `strict`, which throws until `ready` is set:

```text
MobX observed   ["fallback","ready"] runs of safe: 2
Ours live       ["fallback","fallback"] runs of safe: 1 | strict now: ready | fresh snapshot: ready
```

And for the getter that throws, read twice with nothing changed:

```text
MobX observed: read again          threw RangeError: not ready (run 1) {"strict":1,"outer":1}
Ours live: read again              threw RangeError: not ready (run 2) {"strict":2,"outer":2}
```

MobX hands out the same error object until a dependency changes. We re-run
the body on every read. This is the last case of stage 1 finding 36.

**Proposal: adopt the dependency, and treat caching the error as optional.**
The smallest fix is to record the dependency on the inner getter in a
`finally`, in the `get` trap and in `computeWithTracking`. `areDepsValid`
then finds no cache entry for the inner getter and answers "invalid" at
`core.ts:140`. Stage 1 finding 64 lists that line as unreachable; with this
fix it is reached and needed. The outer getter re-runs while the inner one
throws, and settles once it returns. Caching the error together with its
dependencies, as MobX does, also stops the body from re-running on each read.
If that is taken, an error that recorded no dependency must not be cached, or
it would stay for good. A dependency that throws while it is validated should
count as changed, as in MobX.

**Kind.** Bug.

**Cost.** `core.ts` (the `get` trap; `evaluateComputed` and `ComputedEntry`
if errors are cached) and `snapshot.ts` (`computeWithTracking`,
`areMemoizedDepsValid`). Not breaking. It changes the two pinned tests under
"a getter that catches the error of another getter"
(`core.characterisation.getters.test.ts:1270-1300`), and, with error caching,
"runs its body and throws a new error on every read" (`:1161`). Risk low.

### 3. Every read walks the dependency lists again, and a stale read re-runs every level

**What they do.** Each derivation holds a state: up to date, possibly stale,
or stale (`core/derivation.ts:11-29`). A write pushes "stale" to the direct
observers and "possibly stale" on through computed values
(`core/observable.ts:230-282`). Reading an up-to-date computed costs one
comparison (`shouldCompute`, `derivation.ts:78-80`). A possibly stale one
reads its computed dependencies again, in the order they were first read.
Each of those validates itself, and the outer one recomputes only if one of
them produced a different value (`derivation.ts:84-125`,
`computedvalue.ts:261-290`).

**What we do.** No state is kept. Every read of a getter runs `areDepsValid`
over its whole list (`core.ts:166-169`). For a dependency on another getter it
runs `areDepsValid` on that getter's list, recursively (`core.ts:137-142`).
Two things follow.

- Nothing remembers that a list was validated a moment ago. A getter reached
  by two paths is validated twice, its dependencies four times, and so on.
- If the nested list is invalid, the outer getter is declared invalid at once
  (`core.ts:141`), without asking whether the nested getter's value changed.
  The snapshot layer already does this the MobX way: `areMemoizedDepsValid`
  reads the getter and compares the value (`snapshot.ts:104-110`).

**Difference in behaviour.** For the second point, script 01, with `c`
reading `b` reading `a`, where `a` returns `true` for every positive count.
The counts are how often each body has run. Three lines of the output,
relabelled:

```text
MobX            count 1 -> 2, read from the top by the autorun     {"a":2,"b":1,"c":1}
Ours, live      count 1 -> 2, then c read from the top             {"a":2,"b":2,"c":2}
Ours, snapshot  count 1 -> 2, then c read on the next snapshot     {"a":2,"b":2,"c":1}
```

The live result is pinned as a `FINDING` at
`core.characterisation.getters.test.ts:133`.

For the first point, script 07 builds a ladder: two getters per level, each
reading both getters of the level below. A "clean read" is a read of the top
getter when nothing has changed, so no getter body runs. The figures are from
that script's output, put side by side:

```text
depth | ours: first read | ours: clean read | MobX observed: clean read
    8 |      0.09 ms     |      0.03 ms     |      0.00 ms
   12 |      0.42 ms     |      0.30 ms     |      0.00 ms
   16 |      2.27 ms     |      1.57 ms     |      0.01 ms
   18 |      6.51 ms     |      4.12 ms     |      0.00 ms
  200 |      not run     |      not run     |      0.00 ms
```

Our cost doubles with each level. Real getter graphs are shallow, so this is
the shape of the cost and not something a user is known to have hit. The
"read a cached getter" figure in the stage 1 baseline (57 ns against 32 ns for
a field) is the case with one dependency.

**Proposal: adapt, in two steps.**

1. In `areDepsValid`, validate a dependency on a getter by reading that
   getter through its own memoization and comparing the value, in recorded
   order, stopping at the first difference. That is `shouldCompute`, and it is
   what `snapshot.ts` does. The recursive branch goes, and both layers give
   the same run counts.
2. Keep one module-level write counter, bumped in `notifyMutation`, and stamp
   each cache entry with the counter value at which it was last found valid.
   A read at the same counter value returns at once. This is the counterpart
   of MobX's "up to date" state without observer lists, and it limits
   validation to once per getter per write.

**Kind.** Performance, simplification.

**Cost.** `core.ts` and `core.types.ts`. Not breaking. Step 1 changes the
pinned run counts at `core.characterisation.getters.test.ts:133`, and the
tracker stack must be set aside during validation, as MobX does
(`derivation.ts:87`). Step 2 changes one edge: today a live getter notices a
primitive written through the raw object, because a value dependency re-reads
the target (`core.ts:147-149`). With the counter it would notice only after
the next write through a proxy, which is how snapshots behave already (stage
1 finding 11). Risk medium. Measure with `bun run benchmark:core`.

### 4. A setter is not a transaction

**What they do.** A setter is wrapped in an action. For a getter and setter
pair, the `ComputedValue` constructor wraps the setter with `createAction`
(`core/computedvalue.ts:125-130`). For a setter on its own, the default
annotation does it (`types/autoannotation.ts:55-75`). An action opens a batch
(`core/action.ts:111`, `:150`), so reactions run once, after the setter
returns.

**What we do.** The `set` trap passes an accessor on to `Reflect.set` with
the proxy as receiver and opens no transaction (`core.ts:413-418`). Methods
and array operations do open one (`core.ts:263-277`).

**Difference in behaviour.** Script 05, a `full` setter that writes `first`
and `last`:

```text
MobX reaction saw ["Grace Hopper"] | warnings: 0
Ours sync subscriber saw ["Grace Lovelace","Grace Hopper"]
```

Every framework adapter subscribes synchronously, so a component can render
the half-applied name. Stage 1 finding 43.

**Proposal: adopt.** Wrap the accessor branch of the `set` trap in the same
`transactionDepth++` and `settleTransaction()` pair that `transactional` uses.

**Kind.** Bug.

**Cost.** Three lines in `core.ts`. Not breaking. Changes the pinned tests at
`core.characterisation.getters.test.ts:1838` and `:1850`. Risk low.

### 5. Delivery to subscribers: re-entrant writes, removed subscribers, runaway loops

**What they do.** A reaction is queued, not called from the write.
`schedule_` pushes it onto `globalState.pendingReactions` and calls
`runReactions`, which returns at once if a batch is open or the queue is
already being drained (`core/reaction.ts:117-123`, `:275-281`).
`runReactionsHelper` drains the queue in a loop and stops after 100 rounds
with an error that names the reaction (`reaction.ts:271`, `:283-307`).
`runReaction_` checks `isDisposed` at the moment of the call (`:128-129`), and
runs the reaction only if it is stale (`:134`), so one that has already seen
the latest state is not run again. An error is caught per reaction, logged
with the reaction's name and handed to `onReactionError` handlers
(`:192-220`). If the action that caused the run threw as well, the reaction's
error is reduced to a warning, so the developer sees the first error first
(`core/action.ts:143-145`, `reaction.ts:205-208`).

**What we do.** `notifyMutation` calls `deliver` from inside the write
(`core.ts:232`), so a subscriber that writes enters `deliver` again,
recursively. `deliver` copies the listeners first (`core.ts:318-320`) and
calls each copy without checking that it is still registered. Nothing bounds
the recursion or the chain of microtasks. A subscription has no record of what
it has already seen.

**Difference in behaviour.** Scripts 05 and 11:

```text
MobX the same autorun after an outside write: runs 99 | count 109 | errors: ["Reaction doesn't converge to a stable state after 100 iterations. Probably there is a cycle in the reactive function: Reaction[Autorun@4]"] | warnings: 1 distinct
Ours sync subscriber that always writes: calls 2993 | count 2993 | errors: ["RangeError: Maximum call stack size exceeded."]

MobX re-entrant write, two reactions: ["first:1","second:2","first:2"]
Ours re-entrant write, two sync subscribers: ["first:1","first:2","second:2","second:2"]

── a subscriber removed during delivery ──
MobX: ["first"]
Ours: ["first","second"]

── a subscriber added after a write ──
MobX: early autorun saw [0,1] | autorun added after the write saw [1] | reaction() added after the write fired []
Ours, sync, inside batch(): early subscriber calls 1 | subscriber added after the write, calls 1
```

Stage 1 findings 18, 19, 20, 21 and 22.

**Proposal: adapt.** Three parts, each with a MobX line behind it.

1. **One loop.** While a delivery is running, a write adds its owners to the
   pending set and returns; the running loop picks them up. Bound the loop
   (MobX uses 100 rounds) and report through `console.error`, naming the
   store.
2. **Check at the call.** Skip a listener that is no longer in its set.
3. **Give a subscription the version it last saw.** Record the node's version
   when `subscribe()` is called and at each call of the listener, and skip a
   call when the version has not moved. That removes the second delivery of
   the same snapshot (finding 22) and the late subscriber that hears an
   earlier write (finding 21). It is the counterpart of a reaction being up to
   date.

**Kind.** Bug, diagnostics.

**Cost.** `core.ts` (`deliver`, `notifyMutation`, `settleTransaction`,
`flushNotifications`, `subscribe`), about 30 lines. No API change. The order
of calls changes when a subscriber writes: its write is delivered after the
current round, not inside it. Several pinned tests in
`core.characterisation.notifications.test.ts` change, and stage 3 should mark
the order across re-entrant writes as unspecified. Risk medium: every adapter
relies on synchronous delivery. Delivery stays synchronous; only re-entrancy
goes.

### 6. A write outside a transaction: MobX warns, also after an `await`

**What they do.** `enforceActions` defaults to "observed"
(`core/globalstate.ts:109`, `api/configure.ts:25-30`). Every write path calls
`checkIfStateModificationsAreAllowed` (`core/derivation.ts:133-151`; called
from `types/observablevalue.ts:116`, `types/observablearray.ts:175` and
`:317`, `types/observableobject.ts:312` and `:490`). In development, a write
to a value that has observers, made while no action is running, logs a
warning that names the field. It warns and does not throw, and it is compiled
out of the production build. An async method is an action only up to its
first `await`. For the rest MobX offers `runInAction`, and `flow`, which
drives a generator and wraps each resumed step in an action
(`api/flow.ts:83-86`). Writes inside a computed are disallowed by the same
check (`core/computedvalue.ts:295`).

**What we do.** A direct write is allowed anywhere and notifies on its own
(`core.ts:225-233`). A method is a transaction for its synchronous part only
(`core.ts:263-277`); the comment on `batch` says so (`core.ts:286-287`).
Nothing reports either case.

**Difference in behaviour.** Script 05. `load()` sets `loading`, awaits, then
sets `rows` and `loading`. The first line is abridged: the second warning is
the same text for `Loader@1.loading`.

```text
MobX async method        reaction saw ["true/0","true/3","false/3"] | warnings: ["[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Loader@1.rows", ...]
MobX await + runInAction reaction saw ["true/3","false/6"] | warnings: 0
MobX generator (flow)    reaction saw ["true/6","false/9"] | warnings: 0
Ours async method        sync subscriber saw ["true/0","true/3","false/3"] | warnings: 0
```

Both libraries deliver the state in between, `true/3`. MobX tells the
developer which field and which store. For a getter that writes (stage 1
finding 39):

```text
MobX: reads 1 | warnings: ["[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Sneaky@13.reads"]
```

**Proposal: adapt, as an opt-in.** MobX's rule cannot be our default. A
direct write from an event handler is a documented way to use the store, and
every adapter subscribes synchronously, so "warn on a write outside a
transaction to a store that has synchronous subscribers" would fire on
ordinary code. As an opt-in development check it catches the `await` case
exactly as MobX does, because after an `await` the transaction depth is back
at zero. The warning for a write inside a getter has no such conflict and can
be on in every development build: it is a write while the tracker stack is
not empty. The decision belongs with API question 2.

**Kind.** Diagnostics.

**Cost.** `core.ts` (`notifyMutation`), a development build (finding 7), and
docs. Not breaking. Risk low.

### 7. A development build

**What they do.** The source uses a bare `__DEV__`
(`packages/mobx/src/global.d.ts`). The build writes a development file, a
minified production file, and ESM files that work in either mode by reading
`process.env.NODE_ENV` once, at module scope, under a private name
(`scripts/create-rollup-config.mjs:84-91`). The comment there gives two
reasons: reading `process.env` at every call site is slow in Node, and a
private name cannot collide with a consumer's own `__DEV__` define. The
CommonJS entry picks a file by `NODE_ENV` (`dist/index.js`). `die()` throws
the full text in development and "minified error nr: N" in production
(`src/errors.ts:93-104`). The published 7.1.7 files measure 184 KB for
development, and 48 KB minified or 14.7 KB gzipped for production.

**What we do.** One build with no development branch (`REVIEW_PLAN.md`,
"Findings already in hand").

**Difference in behaviour.** Script 09, last block, run twice. The lines are
from the two outputs, labelled, with whitespace inside the getter text
trimmed:

```text
NODE_ENV unset       makeAutoObservable in a subclass: threw Error: [MobX] 'makeAutoObservable' can only be used for classes that don't have a superclass
NODE_ENV=production  makeAutoObservable in a subclass: threw TypeError: Unable to delete property.

NODE_ENV unset       write outside an action, warnings: 1
NODE_ENV=production  write outside an action, warnings: 0

NODE_ENV unset       cycle: threw Error: [MobX] Cycle detected in computation Cycle@19.a: get a() { return this.a + 1; }
NODE_ENV=production  cycle: threw Error: [MobX] minified error nr: 32 ObservableObject.key,get a() { return this.a + 1; }. See mobx.js.org/errors
```

The first pair is a warning to us. A check that throws in development only
means the two builds fail in different ways.

**Proposal: adapt.** Take the mechanism: one constant, resolved once, around
diagnostics that the minifier removes. Do not take the development-only
throws: in development, warn, and keep every thrown error the same in both
builds. At our size, 3.7 KB gzipped, numbered error codes are not worth
having.

**Kind.** Diagnostics.

**Cost.** The build configuration, the `exports` map if the split is made by
condition and not by `NODE_ENV`, the size script (the budgets are for the
production build), and CI. Not breaking. Risk: two builds to test. This
agrees with the Solid finding already in hand.

### 8. `this`, arrow-function methods and `#private` fields

**What they do.** MobX does not put a Proxy around a class instance.
`makeObservable(this, …)` or `makeAutoObservable(this)`, called in the
constructor, defines an accessor pair for each field on the instance itself
(`types/observableobject.ts:391-405`, one shared descriptor per key at
`:678-690`) and keeps the values in an administration object under a symbol
(`:661-668`). There is one object. `this` in the constructor, `this` in an
arrow function, `this` in a method that passes a `#private` brand check, and
the object given to consumers are all the same.

- An arrow-function field is an own property that holds a function. It
  becomes an observable property whose value is wrapped as an action
  (`types/autoannotation.ts:85-93`, `types/modifiers.ts:48-54`).
- A prototype method is replaced on the prototype, once per class, by an
  action wrapper (`types/actionannotation.ts:42-50`). It is not bound unless
  `autoBind: true` is passed, which defines a bound copy on every instance
  (`actionannotation.ts:31-35`, `:132-134`).
- A `#private` field is not observable through `makeObservable`, because it
  cannot be enumerated. It is observable with a standard decorator,
  `@observable accessor #x`, where MobX files it under a fresh symbol
  (`api/decorators.ts:22-24`).

**What we do.** `createClassyStore(instance)` wraps a finished instance. The
`get` trap binds every function to the proxy and caches the wrapper per key
(`core.ts:483-492`): that is `autoBind: true` for every method with no work
per instance and no change to the class. An arrow-function field captured the
raw instance when it was constructed, so its writes go around the `set` trap
(`CLAUDE.md`, "No arrow function methods"). A method or getter that touches
`#x` throws, because `this` is the proxy and the proxy does not carry the
field.

**Difference in behaviour.** Scripts 04 and 08, a selection of lines:

```text
── a write inside an arrow-function method ──
MobX: count 1 | reaction runs after one call: 1 | arrow field is an action: true | observable prop: true
Ours: count 1 | sync notifications: 0 | snapshot count: 0 | snapshot replaced: false

── #private fields and methods ──
MobX: read and write through #private: 2 | reaction saw [2]
Ours: getter that reads #secret: threw TypeError: Cannot access invalid private field (evaluating 'this.#secret')
MobX @observable accessor #secret: reaction saw [2,4]

── `this` kept by the constructor ──
MobX: write through the reference the constructor kept → reaction runs: 1 | same object: true
Ours: write through the reference the constructor kept → sync notifications: 0 | same object: false | live 5 | snapshot 0

── a method passed around without its object ──
MobX default        : threw TypeError: undefined is not an object (evaluating 'this.count')
MobX autoBind: true : 1 | own property: true | stable identity: true
Ours                : 1 | stable identity: true | prototype untouched: true
```

One MobX line needs a note. The getter that reads only `#secret` answered 2
when the field held 2 and the right answer was 4. Without the decorator a
`#private` field does not throw in MobX, and it is not reactive either, so an
observed getter over it is stale.

**Proposal: adapt, with a spike in stage 3.** What MobX shows is that arrow
functions and `#private` work when the reactive object exists before the
subclass's fields are initialised. For a Proxy store the counterpart is a
base class whose constructor returns the proxy. Script 10 does that with a
base class of four lines, on the unmodified library:

```text
first snapshot, before any read through the store: rows frozen? false | row frozen? false
arrow-function method: count 1 | sync notifications 1 | snapshot count 1
getter that reads #secret, live: 4
getter that reads #secret, snapshot: threw TypeError: Cannot access invalid private field (evaluating 'this.#secret')
`this` kept by the constructor is the store: true
write through that reference: sync notifications 1
```

So it works on the live store today, and two things stand in the way.

- Class fields are defined on the proxy, not assigned, so they arrive at the
  `defineProperty` trap, which links no child (stage 1 findings 1 and 45).
  The first snapshot holds the raw, unfrozen array. Those findings have to be
  fixed first.
- A snapshot is another object, so a getter that reads `#x` still throws
  there. MobX has no answer to this, having no snapshots. `#private` state
  would also stay invisible to snapshots, persistence and subscribers, as it
  stays unobservable in MobX without the decorator.

What MobX pays for its approach, and a base class would not: a call in every
constructor, no `makeAutoObservable` for a subclass
(`api/makeObservable.ts:46-48`), an `override` annotation per overridden
member (`types/overrideannotation.ts:15-31`), every annotated member made
non-configurable (`observableobject.ts:393`, `actionannotation.ts:143-150`),
and a changed class prototype.

If a base class is not wanted, the cheap part of the lesson is a development
warning in `createClassyStore()`. An own property whose value is a function
with no `prototype` property is an arrow function or a bound function, and on
a class instance it is nearly always an arrow-function field. This last part
is my reasoning; MobX has no such warning because it has no such failure.

**Kind.** API design, diagnostics.

**Cost.** One new export and its docs, after the fixes for findings 1 and 45.
An addition, not a breaking change. Risk medium: `instanceof`, `new.target`
and `useLocalStore` need checking in the spike.

### 9. Functions and classes held as data

**What they do.** A function stored in observable state is wrapped once,
when it is written, and the wrapper is what the state holds
(`types/modifiers.ts:48-54`). Every read returns that wrapper. To hold a
value exactly as given, the field is annotated `observableRef` or
`observableShallow` (`modifiers.ts:85-88`, `api/observable.ts:63-68`).
`makeAutoObservable` leaves `constructor` out by name
(`api/makeObservable.ts:68`).

**What we do.** We wrap on read. For an object, one wrapper per key is cached
(`core.ts:487-491`). For an array, every read makes a new wrapper, elements
included (`core.ts:486`). `constructor` is a function found through the
prototype, so it is wrapped as well.

**Difference in behaviour.** Script 06:

```text
── a function held in an array ──
MobX: same function on two reads: true | is the function that was stored: false | wrapped as an action: true | indexOf(first): -1 | indexOf(what was read): 1
MobX observableShallow: is the function that was stored: true | indexOf(first): 0
Ours: same function on two reads: false | is the function that was stored: false | indexOf(first): -1 | indexOf(what was read): -1
── a class held in a store ──
MobX: [false,null] | new: threw TypeError: Cannot call a class constructor Model without |new|
MobX observableRef: [true,"model",true]
Ours: [false,null,false]
```

MobX has the same weakness for a class held as data, and a worse symptom. Its
answer is the opt-out.

**Proposal: adapt.**

1. Cache wrappers per function, in a `WeakMap` on the node, not per key. Array
   reads become stable, and `indexOf`, `includes` and
   `splice(indexOf(x), 1)` work on what was read (stage 1 finding 5).
2. Never wrap `constructor` (finding 42).
3. Give a class or a callback held as data a way out, as MobX does. We have a
   rule of that shape already: a frozen object is a value. Extending it to a
   frozen function would cover finding 6 with no new export. This third step
   is my suggestion and not MobX's design.

**Kind.** Bug.

**Cost.** The `get` trap and `boundMethods` in `core.ts`. Not breaking. Risk
low for steps 1 and 2. The comment at `core.ts:485` says array methods are
left uncached on purpose and gives no reason; stage 3 should find it before
changing that.

### 10. Key enumeration, `in`, `defineProperty` and freezing

**What they do.** For a plain object, the Proxy has `has`, `ownKeys`,
`defineProperty` and `preventExtensions` traps next to `get`, `set` and
`deleteProperty` (`types/dynamicobject.ts:17-52`).

- `ownKeys` reports one keys node per object as observed
  (`types/observableobject.ts:609-612`). Adding or deleting a key reports it
  as changed (`:544`, `:606`).
- `in`, and a read of a key that does not exist, subscribe to a boolean for
  that one key, made on demand and dropped when nobody observes it (`has_`,
  `:254-272`; `get_`, `:212-218`).
- `defineProperty` deletes, defines and notifies inside one batch
  (`:307-357`).
- `preventExtensions`, which `Object.freeze` calls first, throws with an
  explanation (`dynamicobject.ts:49-51`, `types/observablearray.ts:106-108`).

A class instance has no Proxy, so none of this applies to it. MobX offers the
helpers `keys()` and `has()` for that case.

**What we do.** The traps are `get`, `set`, `defineProperty` and
`deleteProperty` (`core.ts:405-525`). `Object.keys(this)` and `'x' in this`
inside a getter record nothing. `defineProperty` links nothing, bumps nothing
and notifies no one; it exists for freezing (`core.ts:502-513`). Freezing
through the store is supported, and that branch is where the hang of stage 1
finding 66 begins.

**Difference in behaviour.** Scripts 03 and 09. Each pair is what a getter
returned for `Object.keys(this)` and `'extra' in this`: at the start, after
`extra` was added, and after it was deleted. The last two lines are from
script 09, the second of them cut short here:

```text
MobX observable(object)        [[["a"],false],[["a","extra"],true],[["a"],false]] {"keys":3,"hasExtra":3}
MobX class, plain assignment   [[["a"],false]] {"keys":1,"hasExtra":1}
MobX class, keys() and has()   [[["a"],false],[["a","extra"],true]] {"keys":2,"hasExtra":2}
Ours live                      [[["a"],false],[["a"],false],[["a"],false]] {"keys":1,"hasExtra":1}
Ours snapshot                  [[],false]

MobX: reaction saw [[["a"],null],[["a","b"],2]]
Object.freeze(store.config): threw Error: [MobX] Dynamic observable objects cannot be frozen. ...
```

A MobX class instance is as stale as our store here, which is the price of
having no Proxy around it.

**Proposal.**

- **Adopt** `has` and `ownKeys` traps that record getter dependencies. Our
  counterpart of the keys node is a per-node counter bumped when a key is
  added or removed. Our counterpart of the per-key boolean is a dependency
  entry that checks `Reflect.has` again. The Vue report should have the
  fuller design. MobX adds one detail: a read of a missing key should record
  that the key was missing. That fixes stage 1 finding 32, where such a
  getter re-runs on every read because `core.ts:147` treats a missing key as
  always invalid.
- **Adopt** sending a data descriptor given to `defineProperty` down the same
  path as `set` (findings 1, 45 and 71).
- **Consider** MobX's position on freezing: refuse `Object.freeze(store)`
  with a message that says to assign a frozen value. That removes the
  read-only branch of the `defineProperty` trap, and findings 61, 66 and 67
  with it. It reverses behaviour added in `f8a012f`, so it is a decision for
  before 1.0.

**Kind.** Bug, simplification.

**Cost.** The traps in `core.ts` and `DepEntry`. The tracking proxy at
`snapshot.ts:80-91` needs the same two traps for finding 31. Refusing to
freeze is breaking. Risk medium.

### 11. Two small adoptions

**A delete that removes nothing.** `delete_` returns before any notification
when the key is not an own property (`types/observableobject.ts:491-494`).
Ours notifies, because `Reflect.deleteProperty` answers `true` for a missing
key (`core.ts:517-522`). Script 03:

```text
MobX: reaction runs after deleting a missing key: 0
Ours: sync notifications after deleting a missing key: 1 | snapshot replaced: true
```

Adopt: check `Object.hasOwn` first. Kind: bug. Cost: one line in `core.ts`,
and the pinned tests of stage 1 finding 29. Risk low.

**A getter cycle on a snapshot.** Each `ComputedValue` has an `isComputing`
flag, and `get` throws error 32 when it is set
(`core/computedvalue.ts:200-203`, `:293`, `:313`). Our live layer has the
counterpart (`core.ts:171-184`). The snapshot layer has none
(`snapshot.ts:121-162`). Script 02:

```text
MobX, unobserved       threw Error: [MobX] Cycle detected in computation Cycle@1.a: get a() {
Ours, live store       threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a
Ours, snapshot         threw RangeError: Maximum call stack size exceeded.
```

Adopt in `evaluateSnapshotGetter`: a marker per snapshot and key while a
getter runs, and the live layer's message. Kind: bug, diagnostics. Cost:
`snapshot.ts`, and the pinned test of finding 38. Risk low.

### 12. What MobX does that we should not take

- **Dropping a getter's cache when nobody observes it.** MobX caches a
  computed only while something observes it or a batch is open
  (`core/computedvalue.ts:204-215`, `:317-322`). In script 01, three reads
  with no observer run every body three times. It is there to release memory,
  and the third item of stage 1 finding 27 is what not doing it costs. Our
  consumers read getters from snapshots and from the live store with no
  observer in MobX's sense, so caching always is right for us. MobX's own
  `keepAlive: true` behaves as we do. Reject.
- **Copying plain objects into the store.** `observable.object` builds a new
  target and copies the properties across (`api/observable.ts:210-218`).
  `store.child === raw` is false, and later writes to `raw` are not seen
  (script 09). It rules out our raw-against-proxy findings (9, 10, 11, 25,
  50) by construction, and it is the opposite of "a plain class wrapped in a
  proxy", which is fixed. Reject.
- **Annotations and decorators.** They are how MobX expresses what we infer
  from the class: getter, method, field. Nothing to take.
- **Subclass rules.** MobX needs `override` and a call per constructor
  because it installs members on the instance and the prototype. We read the
  prototype chain on each access (`core.ts:464`), so an overriding getter
  works with no rule at all. Script 06 shows the same run counts in both
  libraries for the base body, the overriding body and an inherited getter.
  Nothing to take.

One thing noted on the way, read and not measured: MobX does its per-class
work once per prototype. `makeAutoObservable` caches the list of keys on the
prototype (`api/makeObservable.ts:63-71`), prototype methods are wrapped once
per class (`types/actionannotation.ts:42-50`), and one accessor descriptor
per key is shared by every instance (`types/observableobject.ts:48`,
`:678-690`). That supports the open performance item in `REVIEW_PLAN.md`: our
`get` trap looks the descriptor up on every read (`core.ts:464`), and the
answer depends only on the prototype and the key when the instance has no own
property of that name.

## Stage 1 findings that have a counterpart in MobX

"Ran" means a script in "Ported tests" shows it. "Read" means the source says
so and no script was run.

| Finding        | What we do                                                                  | What MobX does there                                                                                                                                                               | Source                                                                   | Basis                  |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| 1, 45, 71      | `Object.defineProperty` through a store is silent and leaves children stale | The Proxy's `defineProperty` trap deletes, defines and notifies key observers in one batch. On a class instance annotated members are non-configurable, so redefining one throws   | `observableobject.ts:307-357`, `dynamicobject.ts:38-45`                  | Ran, script 09         |
| 2, 3           | A snapshot or a getter over many rows costs time per row                    | One node per array, so a read of any index observes the whole array. A getter over 1,000 rows re-runs in full after one row changes, as ours does. There is no snapshot to rebuild | `observablearray.ts:114`, `:308-311`                                     | Read                   |
| 5              | A function read from an array is a new wrapper each time                    | Wrapped once, when written. Reads are stable                                                                                                                                       | `modifiers.ts:48-54`                                                     | Ran, script 06         |
| 6, 42          | A class in a store, and `constructor`, come back as bound wrappers          | A class held as data is wrapped too, and `new` then throws. `observableRef` holds it as given. `constructor` is left out by name                                                   | `modifiers.ts:48-54`, `makeObservable.ts:68`                             | Ran, script 06         |
| 7              | `list.includes(raw)` misses                                                 | The same miss, for another reason: the store holds an observable copy of `raw`                                                                                                     | `api/observable.ts:210-218`                                              | Ran, script 09         |
| 8              | A store that refers to itself cannot be snapshotted                         | No snapshot. `toJS` follows a cycle through a map of objects already copied                                                                                                        | `tojs.ts:35-37`                                                          | Read                   |
| 9, 10, 11, 25  | The raw object and the proxy can disagree                                   | Cannot happen for a class instance, which is one object. A plain object is copied in, so the raw one is never connected                                                            | `observableobject.ts:391-405`, `api/observable.ts:210-218`               | Ran, scripts 04 and 09 |
| 12             | A native `Set` or `Map` holds raw members                                   | Replaced on assignment by an `ObservableMap` or `ObservableSet` whose members are made observable                                                                                  | `modifiers.ts:42-47`                                                     | Ran, script 09         |
| 18, 19         | A subscriber that writes overflows the stack, or never stops                | One queue drained in a loop, stopped after 100 rounds with an error that names the reaction                                                                                        | `reaction.ts:271-307`                                                    | Ran, script 05         |
| 20             | A subscriber removed during delivery is still called                        | Checked for disposal at the moment of the call                                                                                                                                     | `reaction.ts:128-129`                                                    | Ran, script 05         |
| 21             | A subscriber added after a write sometimes hears it                         | A new `autorun` runs once with the current state. A new `reaction()` does not fire for an earlier write                                                                            | `autorun.ts:89-91`, `:170-175`                                           | Ran, script 11         |
| 22             | A re-entrant write delivers the same snapshot twice                         | A reaction runs only when stale, so each sees the latest state once                                                                                                                | `reaction.ts:134`                                                        | Ran, script 05         |
| 23             | A subscriber's rejected promise is not reported                             | The same. `autorun` ignores what the view returns                                                                                                                                  | `autorun.ts:85-87`                                                       | Read                   |
| 24, 69         | The order of owner notifications                                            | No owners. Reactions run in the order they became stale                                                                                                                            | `reaction.ts:117-123`, `observable.ts:238`                               | Read                   |
| 26             | A subscription follows the object, not the property                         | `observe(store.user, cb)` follows the object as ours does. `autorun(() => store.user.name)` follows the path                                                                       | `api/observe.ts` was not read                                            | Ran, script 11         |
| 27             | A getter's cache keeps what it read alive                                   | A computed drops its value and its dependencies when its last observer leaves                                                                                                      | `computedvalue.ts:317-322`                                               | Ran, script 01         |
| 29             | A delete that removes nothing notifies                                      | Returns early                                                                                                                                                                      | `observableobject.ts:491-494`                                            | Ran, script 03         |
| 30, 31         | A getter over `Object.keys(this)` or `in` goes stale                        | A keys node and a per-key boolean on Proxy objects. A class instance is as stale as ours unless `keys()` and `has()` are used                                                      | `observableobject.ts:254-272`, `:609-623`                                | Ran, script 03         |
| 32             | A getter that reads a missing property re-runs on every read                | A read of a missing key inside a derivation subscribes to whether the key exists                                                                                                   | `observableobject.ts:212-218`                                            | Read                   |
| 36             | A getter misses another store, an outside reference, and a caught error     | One global tracker records every read. A dependency is registered before it is computed, so a throw does not lose it                                                               | `observable.ts:177-205`, `derivation.ts:181-192`, `computedvalue.ts:218` | Ran, scripts 02 and 03 |
| 37             | The snapshot layer loses nested memoization                                 | Each computed keeps its own cache. An outer one validates by reading the inner one                                                                                                 | `derivation.ts:84-125`                                                   | Ran, script 01         |
| 38             | A getter cycle on a snapshot overflows the stack                            | A flag per computed while it runs, and error 32                                                                                                                                    | `computedvalue.ts:200-203`                                               | Ran, script 02         |
| 39             | A getter that writes: re-runs on the live store, dropped on a snapshot      | Writes are disallowed while a computed runs. A development warning names the field                                                                                                 | `computedvalue.ts:295`, `derivation.ts:133-151`                          | Ran, script 05         |
| 40             | An object returned by a getter is not protected                             | The same. An `equals` option decides whether a new result counts as a change                                                                                                       | `computedvalue.ts:131`, `:268-272`                                       | Read                   |
| 41             | Inside a snapshot getter `this` is a tracking proxy over an empty object    | `this` is the instance, or its Proxy for a plain object                                                                                                                            | `observableobject.ts:455`                                                | Read                   |
| 43             | A setter is not a transaction                                               | A setter is an action                                                                                                                                                              | `computedvalue.ts:125-130`, `autoannotation.ts:55-75`                    | Ran, script 05         |
| 44             | A redefined getter keeps the old result                                     | Plain object: the old computed is deleted and its observers are told. Class instance: redefining throws                                                                            | `observableobject.ts:534-542`, `:457-462`                                | Ran, script 09         |
| 46, 61, 66, 67 | Freezing through or behind the store                                        | Freezing an observable Proxy is refused with an explanation. A frozen object assigned into a store is copied into an unfrozen observable                                           | `dynamicobject.ts:49-51`, `observablearray.ts:106-108`                   | Ran, script 09         |
| 64, first item | `if (!cached) return false` in `areDepsValid` is unreachable                | No counterpart. It becomes reachable, and needed, if finding 2 of this report is adopted                                                                                           | None                                                                     | Reasoning              |
| 72             | Suspending and resuming a detached subtree                                  | Nothing comparable. A child does not know its container, so a held row cannot keep a removed list alive. The price is no structural sharing: `toJS` copies everything on each call | `tojs.ts:22-69`                                                          | Read                   |

No counterpart, because MobX has no snapshots, no persistence or history in
its core, and no reactive collection of our kind: findings 4, 13 to 17, 28,
33 to 35, 47 to 60, 62, 63, 65, 68, 70 and 73.

## The eight API questions, from MobX's point of view

**1. Should synchronous notification be the default for `subscribe()`?**
Yes. A reaction runs synchronously when the outermost batch ends
(`core/observable.ts:111-124`). Delay is opt-in per reaction (`delay` and
`scheduler`, `api/autorun.ts:49`, `:102-108`) or for the whole process
(`reactionScheduler`, `core/reaction.ts:273`, `:311-314`). MobX can afford
this because delivery is queued, bounded and skips reactions that are up to
date. Finding 5 of this report is what our synchronous path lacks before it
could be the default.

**2. Should writes outside a store method be allowed, warned about, or
grouped automatically? Does `batch()` belong in the API?** Allowed, and
warned about by default in development, when the value written has an
observer (`enforceActions: "observed"`, `core/globalstate.ts:109`,
`core/derivation.ts:133-151`). `"always"` warns for unobserved values too and
`"never"` turns it off. Never grouped automatically: each write outside an
action is its own batch and runs reactions on its own
(`core/atom.ts:94-98`). `batch()` belongs. MobX exports two forms:
`transaction(fn)`, which only batches (`api/transaction.ts:10-17`), and
`runInAction(fn)`, which batches, stops dependency tracking and permits
writes (`api/action.ts:93-95`, `core/action.ts:91-135`). We need one, and
`batch` is the right name for it. See finding 6 for why MobX's default cannot
be ours.

**3. Should snapshot getters stay enumerable own accessors?** MobX says no to
"enumerable". A computed is defined with `enumerable: false`, on a class
instance and on a plain object alike (`types/observableobject.ts:457-462`),
and `toJS` leaves computed values out (`api/tojs.ts:60-66`, and its comment
at `:100-105`). Script 09: `Object.keys`, `JSON.stringify`, spread and `toJS`
of an object with a getter all give `{"amount":10}`. Derived values are not
data. We install an inherited getter on the snapshot as an own accessor with
`enumerable: true` (`snapshot.ts:213-217`), so a spread or a
`JSON.stringify` of a snapshot runs every getter, throws if one throws, and
`Object.keys(snapshot)` differs from `Object.keys(store)`. MobX's position
would be an own accessor that is not enumerable for a class getter. A getter
on an object literal is enumerable in the source object, and MobX hides that
one too. Being own is our business, since that is where the memoization
lives; MobX has no position on it.

**4. Can arrow-function methods and `#private` fields be made to work, for
example with a base class or a constructor that returns the proxy?** MobX
makes both work by never wrapping the instance, with the limits given in
finding 8: a `#private` field is usable and not reactive unless it is a
decorated `accessor`. A base class whose constructor returns the proxy is the
Proxy counterpart, and the spike shows it working on the live store today for
both. Snapshots remain the open part for `#private`, and MobX has no position
there.

**5. Should native `Map` and `Set` be reactive directly, replacing
`reactiveMap` and `reactiveSet`?** MobX makes them reactive by replacing
them. A `Map` or `Set` assigned into observable state is copied into an
`ObservableMap` or `ObservableSet` (`types/modifiers.ts:42-47`). Script 09:
the value read back is not the object that was assigned, is not
`instanceof Map`, reports `[object Map]`, and `structuredClone` rejects it.
So MobX's users write `new Map()` and get a different object that behaves
like one. That fits a library which copies plain objects on the way in. It
does not fit ours, where the raw object stays what the user made. MobX's
position is "the user should not need a second import". Its mechanism is not
one we can take without giving up that rule and pulling the collections into
the main entry (727 bytes gzipped today). A development warning when a native
`Map` or `Set` is assigned into a store would answer the same need.

**6. Is opt-in (`PROXYABLE`) or opt-out (`markRaw`, `ref`, freezing) the
better default for nested class instances?** Opt-in. The deep enhancer
converts arrays, plain objects, maps, sets and functions, and returns
anything else as it is (`types/modifiers.ts:24-56`; "plain" is decided at
`utils/utils.ts:61-73`). A class instance is observable only if its own
constructor says so. Script 06: a write to a plain class instance nested in
observable state runs no reaction, a write to one that called
`makeAutoObservable` runs one, and the instance is kept by reference. For
plain data the default is the other way round, deep unless marked
`observableRef` or `observableShallow`. That is the split we have: plain data
is proxied unless frozen, a class instance only with `PROXYABLE`.

**7. Are the entry points, export names and adapter names consistent across
the five frameworks?** No position on five frameworks: MobX's own bindings
are for React only. Two things bear on naming. MobX 7 replaced properties on
a namespace (`observable.ref`, `action.bound`, `comparer.shallow`) with named
exports (`observableRef`, `actionBound`, `compareShallow`) to make them
tree-shakeable (7.0.0 changelog entry). And the React binding's hook for a
store owned by a component is `useLocalObservable` (same entry), which
matches the shape of our `useLocalStore`.

**8. What development-only diagnostics would catch our silent failure
modes?** What MobX has, with the failure of ours it would catch:

| MobX diagnostic                                                                             | Source                                                                                   | Our silent failure                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Warning on a write to observed state outside an action, naming the store and field          | `derivation.ts:133-151`                                                                  | A write after an `await` in a method (opt-in for us, finding 6)                                                                                                          |
| The same check while a computed runs                                                        | `computedvalue.ts:295`                                                                   | A getter that writes (stage 1 finding 39)                                                                                                                                |
| Error after 100 rounds of reactions, naming the reaction                                    | `reaction.ts:292-299`                                                                    | A subscriber that writes to what it observes (findings 18, 19)                                                                                                           |
| Error on a cycle between computed values, naming the getter                                 | `computedvalue.ts:200-203`                                                               | A getter cycle on a snapshot (finding 38)                                                                                                                                |
| Opt-in warning for a derivation that read nothing observable (`reactionRequiresObservable`) | `derivation.ts:201-219`                                                                  | A getter that recorded no dependency: another store, `Object.keys(this)`, a static, a `#private` field (findings 30, 36). Opt-in because a constant getter is legitimate |
| Opt-in warning for a computed read with no observer (`computedRequiresReaction`)            | `computedvalue.ts:324-337`                                                               | None. We cache always                                                                                                                                                    |
| Error with an explanation on `Object.freeze` of an observable                               | `dynamicobject.ts:49-51`                                                                 | Freezing behind or through the store (findings 46, 61, 66)                                                                                                               |
| Error on an in-place `sort` or `reverse` inside a derivation                                | `observablearray.ts:429-449`                                                             | A getter that sorts `this.rows` in place: it writes while it runs                                                                                                        |
| Errors when an annotation names a missing field, repeats one, or overrides nothing          | `makeObservable.ts:97-100`, `observableobject.ts:751-761`, `overrideannotation.ts:24-29` | None. We have no annotations                                                                                                                                             |
| `spy`, `getDependencyTree`, `getObserverTree`                                               | 7.0.0 changelog entry                                                                    | A supported way to count listeners in tests (stage 1, "Tests of internal state")                                                                                         |

All of these are compiled out of the production build (finding 7). MobX has
no diagnostic for an arrow-function method, because there it works. The
warning proposed in finding 8 is ours to design.

## What was verified by running code, and what was only read

**Ran, in the scratch folder, with the output in this report:**

- Scripts 01 to 06 and 11: ports of our tests to MobX, each with our library
  run on the same case.
- Script 07: the cost of a clean getter read in a ladder of getters, ours
  against MobX. One run, on a machine that was also running other agents, so
  the figures show the shape and are not a baseline.
- Script 08: an `@observable accessor #secret` with standard decorators.
  Bun's transform rejected `this.#secret++` on a decorated accessor, so the
  script assigns `this.#secret + 1`. That is a Bun matter and not a MobX one.
- Script 09: the checks behind the table and the API answers, run with
  `NODE_ENV` unset and again with `NODE_ENV=production` for its last block.
- Script 10: the base-class spike on our unmodified library.
- The sizes of the published MobX files, with `ls` and `gzip`.
- The scripts as they are printed below. Biome reformatted them when it
  formatted this file, so they were extracted from the file and run once
  more. Every output was identical, apart from the timings of script 07 and
  the depth at which our subscriber overflows the stack in script 05 (3,011
  calls against 2,993).

**Read in the source, not run:**

- The rows of the table marked "Read".
- The state machine of `shouldCompute` and the three propagation functions.
  The run counts in script 01 agree with it; the states themselves were not
  inspected.
- `flow` beyond the one case in script 05, and the scheduler options of
  `autorun` and `reaction`.
- How the build defines the development flag. The effect was run (script 09
  in production mode); the build was not.
- The per-prototype caching noted at the end of finding 12.

**Reasoning, with no MobX source and no script behind it:**

- Every "Proposal" is a judgement about our code. None was implemented, apart
  from the spike in script 10. The cost lines are estimates from reading
  `core.ts` and `snapshot.ts`.
- The warning for arrow-function fields in finding 8, and "a frozen function
  is a value" in finding 9.
- That real getter graphs are shallow (finding 3).

**Not done:**

- Our test suites and benchmarks were not run, as instructed.
- `mobx-react-lite` and `mobx-react` were not read, so nothing here speaks to
  how MobX binds to React.
- MobX's own test suite was not read or run.

## Ported tests

Everything below ran in a scratch folder outside the repository, with
`bun add mobx@7.1.7` and nothing else installed. `ours.ts` re-exports our
library from the repository by absolute path; `<repo>` stands for the
checkout. Each script is given whole, followed by its whole output.

`ours.ts`:

```ts
// Our library, read from the repository by absolute path. Nothing is installed there.
export {
  batch,
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
```

### Script 01: nested getters, three levels deep

Port of `core.characterisation.getters.test.ts:81-165`.

`01-nested-getters.ts`:

```ts
// Port of "nested getters, three levels deep" (core.characterisation.getters.test.ts:81-165).
import {autorun, computed, makeAutoObservable} from 'mobx';
import {createClassyStore, snapshot} from './ours';

function mobxChain() {
  const runs = {a: 0, b: 0, c: 0};
  class Chain {
    count = 1;
    unrelated = 0;
    constructor() {
      makeAutoObservable(this);
    }
    get a() {
      runs.a++;
      return this.count * 2;
    }
    get b() {
      runs.b++;
      return this.a + 1;
    }
    get c() {
      runs.c++;
      return this.b + 1;
    }
  }
  return {store: new Chain(), runs};
}

function mobxThreshold(keepAlive = false) {
  const runs = {a: 0, b: 0, c: 0};
  class Threshold {
    count = 1;
    constructor() {
      makeAutoObservable(
        this,
        keepAlive
          ? {
              a: computed({keepAlive: true}),
              b: computed({keepAlive: true}),
              c: computed({keepAlive: true}),
            }
          : undefined,
      );
    }
    get a() {
      runs.a++;
      return this.count > 0;
    }
    get b() {
      runs.b++;
      return this.a ? 'yes' : 'no';
    }
    get c() {
      runs.c++;
      return `${this.b}!`;
    }
  }
  return {store: new Threshold(), runs};
}

function oursThreshold() {
  const runs = {a: 0, b: 0, c: 0};
  class Threshold {
    count = 1;
    get a() {
      runs.a++;
      return this.count > 0;
    }
    get b() {
      runs.b++;
      return this.a ? 'yes' : 'no';
    }
    get c() {
      runs.c++;
      return `${this.b}!`;
    }
  }
  return {store: createClassyStore(new Threshold()), runs};
}

const show = (label: string, runs: object) =>
  console.log(label.padEnd(74), JSON.stringify(runs));

console.log('── MobX, nobody observing ──');
{
  const {store, runs} = mobxChain();
  store.c;
  show('first read of c', runs);
  store.c;
  show('second read of c, nothing changed', runs);
  store.unrelated = 1;
  store.c;
  show('read of c after a write to an unrelated field', runs);
}

console.log('── MobX, c observed by an autorun ──');
{
  const {store, runs} = mobxChain();
  const dispose = autorun(() => void store.c);
  show('autorun created', runs);
  store.c;
  store.b;
  store.a;
  show('c, b and a read from outside', runs);
  store.unrelated = 1;
  show('write to an unrelated field', runs);
  store.count = 2;
  show('write to count (the autorun re-ran)', runs);
  dispose();
  store.c;
  show('autorun disposed, then c read', runs);
}

console.log(
  '── MobX, threshold chain: a gives the same result for every count > 0 ──',
);
{
  const {store, runs} = mobxThreshold();
  const dispose = autorun(() => void store.c);
  show('autorun created', runs);
  store.count = 2;
  show('count 1 -> 2, read from the top by the autorun', runs);
  dispose();
}
{
  const {store, runs} = mobxThreshold(true);
  store.c;
  show('keepAlive, no observer: first read of c', runs);
  store.c;
  show('keepAlive, no observer: second read of c', runs);
  store.count = 2;
  store.c;
  show('keepAlive, no observer: count 1 -> 2, then c read from the top', runs);
}

console.log('── Ours, threshold chain ──');
{
  const {store, runs} = oursThreshold();
  store.c;
  show('live: first read of c', runs);
  store.c;
  show('live: second read of c', runs);
  store.count = 2;
  store.c;
  show('live: count 1 -> 2, then c read from the top', runs);
}
{
  const {store, runs} = oursThreshold();
  snapshot(store).c;
  show('snapshot: first read of c', runs);
  store.count = 2;
  snapshot(store).c;
  show('snapshot: count 1 -> 2, then c read on the next snapshot', runs);
}
```

```text
── MobX, nobody observing ──
first read of c                                                            {"a":1,"b":1,"c":1}
second read of c, nothing changed                                          {"a":2,"b":2,"c":2}
read of c after a write to an unrelated field                              {"a":3,"b":3,"c":3}
── MobX, c observed by an autorun ──
autorun created                                                            {"a":1,"b":1,"c":1}
c, b and a read from outside                                               {"a":1,"b":1,"c":1}
write to an unrelated field                                                {"a":1,"b":1,"c":1}
[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Chain@2.count
write to count (the autorun re-ran)                                        {"a":2,"b":2,"c":2}
autorun disposed, then c read                                              {"a":3,"b":3,"c":3}
── MobX, threshold chain: a gives the same result for every count > 0 ──
autorun created                                                            {"a":1,"b":1,"c":1}
[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Threshold@4.count
count 1 -> 2, read from the top by the autorun                             {"a":2,"b":1,"c":1}
keepAlive, no observer: first read of c                                    {"a":1,"b":1,"c":1}
keepAlive, no observer: second read of c                                   {"a":1,"b":1,"c":1}
[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Threshold@6.count
keepAlive, no observer: count 1 -> 2, then c read from the top             {"a":2,"b":1,"c":1}
── Ours, threshold chain ──
live: first read of c                                                      {"a":1,"b":1,"c":1}
live: second read of c                                                     {"a":1,"b":1,"c":1}
live: count 1 -> 2, then c read from the top                               {"a":2,"b":2,"c":2}
snapshot: first read of c                                                  {"a":1,"b":1,"c":1}
snapshot: count 1 -> 2, then c read on the next snapshot                   {"a":2,"b":2,"c":1}
```

### Script 02: a getter cycle, a getter that throws, a getter that catches

Port of `core.characterisation.getters.test.ts:1049-1135`, `:1160-1215` and
`:1270-1300`.

`02-cycle-and-throw.ts`:

```ts
// Ports of "getters that read each other in a cycle" (getters test :1049-1135),
// "a getter that throws" (:1160-1215) and "a getter that catches the error of
// another getter" (:1270-1300).
import {autorun, makeAutoObservable, runInAction} from 'mobx';
import {createClassyStore, snapshot} from './ours';

const message = (read: () => unknown) => {
  try {
    return `returned ${JSON.stringify(read())}`;
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${String(
      (error as Error).message,
    )
      .split('\n')[0]
      .slice(0, 110)}`;
  }
};

console.log('── cycle: a reads b, b reads a ──');
{
  class Cycle {
    constructor() {
      makeAutoObservable(this);
    }
    get a(): number {
      return this.b + 1;
    }
    get b(): number {
      return this.a + 1;
    }
    get fine() {
      return 'fine';
    }
  }
  const store = new Cycle();
  console.log(
    'MobX, unobserved      ',
    message(() => store.a),
  );
  let seen = '';
  const dispose = autorun(() => {
    seen = message(() => store.a);
  });
  console.log('MobX, inside autorun  ', seen);
  console.log(
    'MobX, other getter    ',
    message(() => store.fine),
  );
  dispose();
}
{
  class Cycle {
    get a(): number {
      return this.b + 1;
    }
    get b(): number {
      return this.a + 1;
    }
  }
  const store = createClassyStore(new Cycle());
  console.log(
    'Ours, live store      ',
    message(() => store.a),
  );
  console.log(
    'Ours, snapshot        ',
    message(() => snapshot(store).a),
  );
}

console.log('── a getter that throws, then recovers ──');
function mobxLoader() {
  const runs = {strict: 0, outer: 0};
  class Loader {
    count = 0;
    unrelated = 0;
    constructor() {
      makeAutoObservable(this);
    }
    get strict(): number {
      runs.strict++;
      if (this.count === 0)
        throw new RangeError(`not ready (run ${runs.strict})`);
      return this.count * 2;
    }
    get outer(): number {
      runs.outer++;
      return this.strict + 1;
    }
  }
  return {store: new Loader(), runs};
}
{
  const {store, runs} = mobxLoader();
  const seen: string[] = [];
  const dispose = autorun(() => {
    seen.push(message(() => store.outer));
  });
  console.log(
    'MobX observed: first run          ',
    seen.at(-1),
    JSON.stringify(runs),
  );
  console.log(
    'MobX observed: read again         ',
    message(() => store.outer),
    JSON.stringify(runs),
  );
  console.log(
    'MobX observed: same error object  ',
    (() => {
      let first: unknown;
      let second: unknown;
      try {
        store.strict;
      } catch (error) {
        first = error;
      }
      try {
        store.strict;
      } catch (error) {
        second = error;
      }
      return first === second;
    })(),
  );
  runInAction(() => {
    store.unrelated = 1;
  });
  console.log(
    'MobX observed: unrelated write    ',
    message(() => store.outer),
    JSON.stringify(runs),
  );
  runInAction(() => {
    store.count = 2;
  });
  console.log(
    'MobX observed: count = 2          ',
    seen.at(-1),
    JSON.stringify(runs),
  );
  runInAction(() => {
    store.count = 0;
  });
  console.log(
    'MobX observed: count = 0 again    ',
    seen.at(-1),
    JSON.stringify(runs),
  );
  dispose();
}
{
  const runs = {strict: 0, outer: 0};
  class Loader {
    count = 0;
    unrelated = 0;
    get strict(): number {
      runs.strict++;
      if (this.count === 0)
        throw new RangeError(`not ready (run ${runs.strict})`);
      return this.count * 2;
    }
    get outer(): number {
      runs.outer++;
      return this.strict + 1;
    }
  }
  const store = createClassyStore(new Loader());
  console.log(
    'Ours live: first read             ',
    message(() => store.outer),
    JSON.stringify(runs),
  );
  console.log(
    'Ours live: read again             ',
    message(() => store.outer),
    JSON.stringify(runs),
  );
  store.count = 2;
  console.log(
    'Ours live: count = 2              ',
    message(() => store.outer),
    JSON.stringify(runs),
  );
}

console.log('── a getter that catches the error of another getter ──');
{
  let runs = 0;
  class Guarded {
    ready = false;
    constructor() {
      makeAutoObservable(this);
    }
    get strict(): string {
      if (!this.ready) throw new Error('not ready');
      return 'ready';
    }
    get safe(): string {
      runs++;
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  const store = new Guarded();
  const seen: string[] = [];
  const dispose = autorun(() => {
    seen.push(store.safe);
  });
  runInAction(() => {
    store.ready = true;
  });
  console.log('MobX observed  ', JSON.stringify(seen), 'runs of safe:', runs);
  dispose();
  const unobserved = new Guarded();
  const before = unobserved.safe;
  runInAction(() => {
    unobserved.ready = true;
  });
  console.log('MobX unobserved', JSON.stringify([before, unobserved.safe]));
}
{
  let runs = 0;
  class Guarded {
    ready = false;
    get strict(): string {
      if (!this.ready) throw new Error('not ready');
      return 'ready';
    }
    get safe(): string {
      runs++;
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  const store = createClassyStore(new Guarded());
  const before = store.safe;
  store.ready = true;
  console.log(
    'Ours live      ',
    JSON.stringify([before, store.safe]),
    'runs of safe:',
    runs,
    '| strict now:',
    store.strict,
    '| fresh snapshot:',
    snapshot(store).safe,
  );
}
```

```text
── cycle: a reads b, b reads a ──
MobX, unobserved       threw Error: [MobX] Cycle detected in computation Cycle@1.a: get a() {
MobX, inside autorun   threw Error: [MobX] Cycle detected in computation Cycle@1.a: get a() {
MobX, other getter     returned "fine"
Ours, live store       threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a
Ours, snapshot         threw RangeError: Maximum call stack size exceeded.
── a getter that throws, then recovers ──
MobX observed: first run           threw RangeError: not ready (run 1) {"strict":1,"outer":1}
MobX observed: read again          threw RangeError: not ready (run 1) {"strict":1,"outer":1}
MobX observed: same error object   true
MobX observed: unrelated write     threw RangeError: not ready (run 1) {"strict":1,"outer":1}
MobX observed: count = 2           returned 5 {"strict":2,"outer":2}
MobX observed: count = 0 again     threw RangeError: not ready (run 3) {"strict":3,"outer":3}
Ours live: first read              threw RangeError: not ready (run 1) {"strict":1,"outer":1}
Ours live: read again              threw RangeError: not ready (run 2) {"strict":2,"outer":2}
Ours live: count = 2               returned 5 {"strict":3,"outer":3}
── a getter that catches the error of another getter ──
MobX observed   ["fallback","ready"] runs of safe: 2
MobX unobserved ["fallback","ready"]
Ours live       ["fallback","fallback"] runs of safe: 1 | strict now: ready | fresh snapshot: ready
```

### Script 03: another store, `Object.keys(this)`, a delete that removes nothing

Port of `core.characterisation.getters.test.ts:786` and `:2014-2059`, and of
the test for stage 1 finding 29 in `core.fuzz.findings.test.ts`.

`03-other-store-and-keys.ts`:

```ts
// Ports of "a getter that reads another store keeps its result after that store
// changes" (getters test :786) and "a getter whose result depends on which keys
// the store has" (:2014-2059).
import {
  autorun,
  extendObservable,
  has as mobxHas,
  keys as mobxKeys,
  makeAutoObservable,
  observable,
  runInAction,
} from 'mobx';
import {createClassyStore, snapshot} from './ours';

console.log('── a getter that reads another store ──');
{
  class Rates {
    rate = 2;
    constructor() {
      makeAutoObservable(this);
    }
  }
  const rates = new Rates();
  let runs = 0;
  class Cart {
    amount = 10;
    constructor() {
      makeAutoObservable(this);
    }
    get total() {
      runs++;
      return this.amount * rates.rate;
    }
  }
  const cart = new Cart();
  const seen: number[] = [];
  const dispose = autorun(() => {
    seen.push(cart.total);
  });
  runInAction(() => {
    rates.rate = 3;
  });
  console.log('MobX observed  ', JSON.stringify(seen), 'runs:', runs);
  dispose();
}
{
  const rates = createClassyStore({rate: 2});
  let runs = 0;
  class Cart {
    amount = 10;
    get total() {
      runs++;
      return this.amount * rates.rate;
    }
  }
  const cart = createClassyStore(new Cart());
  const before = cart.total;
  rates.rate = 3;
  console.log(
    'Ours live      ',
    JSON.stringify([before, cart.total]),
    'runs:',
    runs,
    '| first snapshot after:',
    snapshot(cart).total,
  );
}

console.log('── a getter that reads Object.keys(this) and `in` ──');
{
  // A plain object made observable: MobX returns a Proxy with has and ownKeys traps.
  const runs = {keys: 0, hasExtra: 0};
  const store = observable({
    a: 1,
    get keys(): string[] {
      runs.keys++;
      return Object.keys(this);
    },
    get hasExtra(): boolean {
      runs.hasExtra++;
      return 'extra' in this;
    },
  }) as {a: number; extra?: number; keys: string[]; hasExtra: boolean};
  const seen: unknown[] = [];
  const dispose = autorun(() => {
    seen.push([store.keys, store.hasExtra]);
  });
  runInAction(() => {
    store.extra = 2;
  });
  runInAction(() => {
    delete store.extra;
  });
  console.log(
    'MobX observable(object)       ',
    JSON.stringify(seen),
    JSON.stringify(runs),
  );
  dispose();
}
{
  // A class instance: MobX installs accessors on the instance and returns no Proxy.
  const runs = {keys: 0, hasExtra: 0};
  class Shape {
    a = 1;
    constructor() {
      makeAutoObservable(this);
    }
    get keys(): string[] {
      runs.keys++;
      return Object.keys(this);
    }
    get hasExtra(): boolean {
      runs.hasExtra++;
      return 'extra' in this;
    }
  }
  const store = new Shape() as Shape & {extra?: number};
  const seen: unknown[] = [];
  const dispose = autorun(() => {
    seen.push([store.keys, store.hasExtra]);
  });
  // A plain assignment adds an ordinary, unobserved property.
  store.extra = 2;
  console.log(
    'MobX class, plain assignment  ',
    JSON.stringify(seen),
    JSON.stringify(runs),
  );
  delete store.extra;
  // The supported way to add a field later.
  runInAction(() => {
    extendObservable(store, {extra: 2});
  });
  console.log(
    'MobX class, extendObservable  ',
    JSON.stringify(seen),
    JSON.stringify(runs),
  );
  dispose();
}
{
  // The same class with MobX's own helpers in place of Object.keys and `in`.
  const runs = {keys: 0, hasExtra: 0};
  class Shape {
    a = 1;
    constructor() {
      makeAutoObservable(this);
    }
    get keys(): PropertyKey[] {
      runs.keys++;
      return mobxKeys(this);
    }
    get hasExtra(): boolean {
      runs.hasExtra++;
      return mobxHas(this, 'extra');
    }
  }
  const store = new Shape() as Shape & {extra?: number};
  const seen: unknown[] = [];
  const dispose = autorun(() => {
    seen.push([store.keys, store.hasExtra]);
  });
  runInAction(() => {
    extendObservable(store, {extra: 2});
  });
  console.log(
    'MobX class, keys() and has()  ',
    JSON.stringify(seen),
    JSON.stringify(runs),
  );
  dispose();
}
{
  const runs = {keys: 0, hasExtra: 0};
  class Shape {
    a = 1;
    get keys(): string[] {
      runs.keys++;
      return Object.keys(this);
    }
    get hasExtra(): boolean {
      runs.hasExtra++;
      return 'extra' in this;
    }
  }
  const store = createClassyStore(new Shape()) as Shape & {extra?: number};
  const seen: unknown[] = [[store.keys, store.hasExtra]];
  store.extra = 2;
  seen.push([store.keys, store.hasExtra]);
  delete store.extra;
  seen.push([store.keys, store.hasExtra]);
  console.log(
    'Ours live                     ',
    JSON.stringify(seen),
    JSON.stringify(runs),
  );
  const snap = snapshot(store);
  console.log(
    'Ours snapshot                 ',
    JSON.stringify([snap.keys, snap.hasExtra]),
  );
}

console.log('── a delete that removes nothing ──');
{
  const dict = observable({a: 1}) as Record<string, number>;
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    Object.keys(dict);
  });
  runInAction(() => {
    delete dict.missing;
  });
  console.log('MobX: reaction runs after deleting a missing key:', runs - 1);
  dispose();
}
{
  const store = createClassyStore({dict: {a: 1} as Record<string, number>});
  let calls = 0;
  const {subscribe} = await import('./ours');
  subscribe(
    store,
    () => {
      calls++;
    },
    {sync: true},
  );
  const before = snapshot(store);
  delete store.dict.missing;
  console.log(
    'Ours: sync notifications after deleting a missing key:',
    calls,
    '| snapshot replaced:',
    snapshot(store) !== before,
  );
}
```

```text
── a getter that reads another store ──
MobX observed   [20,30] runs: 2
Ours live       [20,20] runs: 1 | first snapshot after: 30
── a getter that reads Object.keys(this) and `in` ──
MobX observable(object)        [[["a"],false],[["a","extra"],true],[["a"],false]] {"keys":3,"hasExtra":3}
MobX class, plain assignment   [[["a"],false]] {"keys":1,"hasExtra":1}
MobX class, extendObservable   [[["a"],false]] {"keys":1,"hasExtra":1}
MobX class, keys() and has()   [[["a"],false],[["a","extra"],true]] {"keys":2,"hasExtra":2}
Ours live                      [[["a"],false],[["a"],false],[["a"],false]] {"keys":1,"hasExtra":1}
Ours snapshot                  [[],false]
── a delete that removes nothing ──
MobX: reaction runs after deleting a missing key: 0
Ours: sync notifications after deleting a missing key: 1 | snapshot replaced: true
```

### Script 04: arrow-function methods, `#private`, `this`, binding

Port of the arrow-function case in `CLAUDE.md` and of
`core.characterisation.getters.test.ts:2442`.

`04-this-arrow-private.ts`:

```ts
// Ports of the arrow-function method case (CLAUDE.md "No arrow function methods"),
// "a getter that reads a #private field" (getters test :2442), and method binding.
import {
  autorun,
  isAction,
  isObservableProp,
  makeAutoObservable,
  observable,
} from 'mobx';
import {createClassyStore, snapshot, subscribe} from './ours';

const outcome = (run: () => unknown) => {
  try {
    return JSON.stringify(run());
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${String((error as Error).message).slice(0, 90)}`;
  }
};

console.log('── a write inside an arrow-function method ──');
{
  class Counter {
    count = 0;
    other = 0;
    constructor() {
      makeAutoObservable(this);
    }
    increment = () => {
      this.count++;
      this.other++;
    };
  }
  const store = new Counter();
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    void store.count;
    void store.other;
  });
  const detached = store.increment;
  detached();
  console.log(
    'MobX: count',
    store.count,
    '| reaction runs after one call:',
    runs - 1,
    '| arrow field is an action:',
    isAction(store.increment),
    '| observable prop:',
    isObservableProp(store, 'increment'),
  );
  dispose();
}
{
  class Counter {
    count = 0;
    other = 0;
    increment = () => {
      this.count++;
      this.other++;
    };
  }
  const store = createClassyStore(new Counter());
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
    },
    {sync: true},
  );
  const before = snapshot(store);
  store.increment();
  console.log(
    'Ours: count',
    store.count,
    '| sync notifications:',
    calls,
    '| snapshot count:',
    snapshot(store).count,
    '| snapshot replaced:',
    snapshot(store) !== before,
  );
}

console.log('── #private fields and methods ──');
{
  class Vault {
    #secret = 1;
    visible = 1;
    constructor() {
      makeAutoObservable(this);
    }
    get doubled() {
      return this.#secret * 2;
    }
    bump() {
      this.#secret++;
      this.visible++;
    }
    bumpSecretOnly() {
      this.#secret++;
    }
  }
  const store = new Vault();
  const seen: number[] = [];
  const dispose = autorun(() => {
    seen.push(store.doubled);
  });
  store.bump();
  console.log(
    'MobX: read and write through #private:',
    outcome(() => store.doubled),
    '| reaction saw',
    JSON.stringify(seen),
  );
  store.bumpSecretOnly();
  console.log(
    'MobX: after a write to #secret alone, reaction saw',
    JSON.stringify(seen),
    '| unobserved read:',
    (dispose(), store.doubled),
  );
}
{
  class Vault {
    #secret = 1;
    visible = 1;
    get doubled() {
      return this.#secret * 2;
    }
    bump() {
      this.#secret++;
      this.visible++;
    }
  }
  const store = createClassyStore(new Vault());
  console.log(
    'Ours: getter that reads #secret:',
    outcome(() => store.doubled),
  );
  console.log(
    'Ours: method that writes #secret:',
    outcome(() => store.bump()),
  );
  console.log(
    'Ours: same getter on a snapshot:',
    outcome(() => snapshot(store).doubled),
  );
}

console.log('── `this` kept by the constructor ──');
{
  const registry: {count: number}[] = [];
  class Registered {
    count = 0;
    constructor() {
      makeAutoObservable(this);
      registry.push(this);
    }
  }
  const store = new Registered();
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    void store.count;
  });
  registry[0].count = 5;
  console.log(
    'MobX: write through the reference the constructor kept → reaction runs:',
    runs - 1,
    '| same object:',
    registry[0] === store,
  );
  dispose();
}
{
  const registry: {count: number}[] = [];
  class Registered {
    count = 0;
    constructor() {
      registry.push(this);
    }
  }
  const store = createClassyStore(new Registered());
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
    },
    {sync: true},
  );
  snapshot(store);
  registry[0].count = 5;
  console.log(
    'Ours: write through the reference the constructor kept → sync notifications:',
    calls,
    '| same object:',
    registry[0] === store,
    '| live',
    store.count,
    '| snapshot',
    snapshot(store).count,
  );
}

console.log('── a method passed around without its object ──');
{
  class Plain {
    count = 0;
    constructor() {
      makeAutoObservable(this);
    }
    increment() {
      this.count++;
    }
  }
  class Bound {
    count = 0;
    constructor() {
      makeAutoObservable(this, {}, {autoBind: true});
    }
    increment() {
      this.count++;
    }
  }
  const plain = new Plain();
  const bound = new Bound();
  const a = plain.increment;
  const b = bound.increment;
  console.log(
    'MobX default        :',
    outcome(() => {
      a();
      return plain.count;
    }),
  );
  console.log(
    'MobX autoBind: true :',
    outcome(() => {
      b();
      return bound.count;
    }),
    '| own property:',
    Object.hasOwn(bound, 'increment'),
    '| stable identity:',
    bound.increment === bound.increment,
  );
  console.log(
    'MobX prototype method replaced by an action wrapper:',
    isAction(Plain.prototype.increment),
  );
}
{
  class Plain {
    count = 0;
    increment() {
      this.count++;
    }
  }
  const store = createClassyStore(new Plain());
  const a = store.increment;
  console.log(
    'Ours                :',
    outcome(() => {
      a();
      return store.count;
    }),
    '| stable identity:',
    store.increment === store.increment,
    '| prototype untouched:',
    Plain.prototype.increment.name === 'increment' &&
      !('isMobxAction' in Plain.prototype.increment),
  );
}

console.log('── a plain object with an arrow function ──');
{
  const store = observable({
    count: 0,
    increment: () => {
      store.count++;
    },
  });
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    void store.count;
  });
  store.increment();
  console.log('MobX observable({...}): reaction runs', runs - 1);
  dispose();
}
```

```text
── a write inside an arrow-function method ──
MobX: count 1 | reaction runs after one call: 1 | arrow field is an action: true | observable prop: true
Ours: count 1 | sync notifications: 0 | snapshot count: 0 | snapshot replaced: false
── #private fields and methods ──
MobX: read and write through #private: 2 | reaction saw [2]
MobX: after a write to #secret alone, reaction saw [2] | unobserved read: 6
Ours: getter that reads #secret: threw TypeError: Cannot access invalid private field (evaluating 'this.#secret')
Ours: method that writes #secret: threw TypeError: Cannot access invalid private field (evaluating 'this.#secret')
Ours: same getter on a snapshot: threw TypeError: Cannot access invalid private field (evaluating 'this.#secret')
── `this` kept by the constructor ──
[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Registered@5.count
MobX: write through the reference the constructor kept → reaction runs: 1 | same object: true
Ours: write through the reference the constructor kept → sync notifications: 0 | same object: false | live 5 | snapshot 0
── a method passed around without its object ──
MobX default        : threw TypeError: undefined is not an object (evaluating 'this.count')
MobX autoBind: true : 1 | own property: true | stable identity: true
MobX prototype method replaced by an action wrapper: true
Ours                : 1 | stable identity: true | prototype untouched: true
── a plain object with an arrow function ──
MobX observable({...}): reaction runs 1
```

### Script 05: a write after an `await`, subscribers that write, setters, errors

Port of the `await` case in `REVIEW_PLAN.md`, of stage 1 findings 18, 20 and
22 in `core.characterisation.notifications.test.ts`, and of
`core.characterisation.getters.test.ts:1836-1850` and `:1325`.

`05-async-and-reactions.ts`:

```ts
// Ports of: a write after an `await` inside a method (REVIEW_PLAN "Findings already
// in hand"), a subscriber that writes to what it observes (notifications test,
// findings 18, 19, 22), a subscriber removed during delivery (finding 20), a
// setter that writes two fields (finding 43) and a getter that writes (finding 39).
import {
  autorun,
  configure,
  flow,
  makeAutoObservable,
  reaction,
  runInAction,
} from 'mobx';
import {batch, createClassyStore, snapshot, subscribe} from './ours';

const warnings: string[] = [];
const errors: string[] = [];
const realWarn = console.warn;
const realError = console.error;
console.warn = (...args: unknown[]) => {
  warnings.push(String(args[0]).slice(0, 150));
};
console.error = (...args: unknown[]) => {
  errors.push(
    args
      .map((arg) =>
        arg instanceof Error
          ? `${arg.constructor.name}: ${arg.message}`
          : String(arg),
      )
      .join(' ')
      .slice(0, 170),
  );
};
const drain = (list: string[]) => {
  const copy = [...list];
  list.length = 0;
  return copy;
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

console.log('── a write after an await inside a method ──');
{
  class Loader {
    loading = false;
    rows = 0;
    constructor() {
      makeAutoObservable(this);
    }
    async load() {
      this.loading = true;
      this.rows = 0;
      await tick();
      this.rows = 3;
      this.loading = false;
    }
    async loadInAction() {
      this.loading = true;
      await tick();
      runInAction(() => {
        this.rows = 6;
        this.loading = false;
      });
    }
    *loadFlow() {
      this.loading = true;
      yield tick();
      this.rows = 9;
      this.loading = false;
    }
  }
  const store = new Loader();
  const seen: string[] = [];
  const dispose = autorun(() => {
    seen.push(`${store.loading}/${store.rows}`);
  });
  seen.length = 0;
  await store.load();
  console.log(
    'MobX async method        reaction saw',
    JSON.stringify(seen),
    '| warnings:',
    JSON.stringify(drain(warnings)),
  );
  seen.length = 0;
  await store.loadInAction();
  console.log(
    'MobX await + runInAction reaction saw',
    JSON.stringify(seen),
    '| warnings:',
    drain(warnings).length,
  );
  seen.length = 0;
  await store.loadFlow();
  console.log(
    'MobX generator (flow)    reaction saw',
    JSON.stringify(seen),
    '| warnings:',
    drain(warnings).length,
  );
  dispose();
}
{
  class Loader {
    loading = false;
    rows = 0;
    async load() {
      this.loading = true;
      this.rows = 0;
      await tick();
      this.rows = 3;
      this.loading = false;
    }
  }
  const store = createClassyStore(new Loader());
  const seen: string[] = [];
  subscribe(
    store,
    () => {
      const snap = snapshot(store);
      seen.push(`${snap.loading}/${snap.rows}`);
    },
    {sync: true},
  );
  await store.load();
  console.log(
    'Ours async method        sync subscriber saw',
    JSON.stringify(seen),
    '| warnings:',
    drain(warnings).length,
  );
}

console.log('── a reaction that writes to what it observes ──');
{
  class Counter {
    count = 0;
    constructor() {
      makeAutoObservable(this);
    }
  }
  const store = new Counter();
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    store.count = store.count + 1;
  });
  console.log(
    'MobX autorun that always writes, first run: runs',
    runs,
    '| count',
    store.count,
    '| errors:',
    drain(errors).length,
    '| warnings:',
    drain(warnings).length,
  );
  runs = 0;
  runInAction(() => {
    store.count = 10;
  });
  console.log(
    'MobX the same autorun after an outside write: runs',
    runs,
    '| count',
    store.count,
    '| errors:',
    JSON.stringify(drain(errors)),
    '| warnings:',
    new Set(drain(warnings)).size,
    'distinct',
  );
  dispose();

  const bounded = new Counter();
  const order: string[] = [];
  const first = autorun(() => {
    order.push(`first:${bounded.count}`);
    if (bounded.count === 1) bounded.count = 2;
  });
  const second = autorun(() => {
    order.push(`second:${bounded.count}`);
  });
  order.length = 0;
  runInAction(() => {
    bounded.count = 1;
  });
  console.log('MobX re-entrant write, two reactions:', JSON.stringify(order));
  first();
  second();
  drain(warnings);
}
{
  const store = createClassyStore({count: 0});
  let calls = 0;
  const stop = subscribe(
    store,
    () => {
      calls++;
      if (calls < 20000) store.count++;
    },
    {sync: true},
  );
  store.count = 1;
  console.log(
    'Ours sync subscriber that always writes: calls',
    calls,
    '| count',
    store.count,
    '| errors:',
    JSON.stringify(drain(errors).map((line) => line.slice(0, 60))),
  );
  stop();

  const bounded = createClassyStore({count: 0});
  const order: string[] = [];
  subscribe(
    bounded,
    () => {
      order.push(`first:${snapshot(bounded).count}`);
      if (bounded.count === 1) bounded.count = 2;
    },
    {sync: true},
  );
  subscribe(
    bounded,
    () => {
      order.push(`second:${snapshot(bounded).count}`);
    },
    {sync: true},
  );
  bounded.count = 1;
  console.log(
    'Ours re-entrant write, two sync subscribers:',
    JSON.stringify(order),
  );
}

console.log('── a subscriber removed during delivery ──');
{
  class Counter {
    count = 0;
    constructor() {
      makeAutoObservable(this);
    }
  }
  const store = new Counter();
  const order: string[] = [];
  let disposeSecond = () => {};
  const disposeFirst = reaction(
    () => store.count,
    () => {
      order.push('first');
      disposeSecond();
    },
  );
  disposeSecond = reaction(
    () => store.count,
    () => {
      order.push('second');
    },
  );
  runInAction(() => {
    store.count = 1;
  });
  console.log('MobX:', JSON.stringify(order));
  disposeFirst();
}
{
  const store = createClassyStore({count: 0});
  const order: string[] = [];
  let stopSecond = () => {};
  subscribe(
    store,
    () => {
      order.push('first');
      stopSecond();
    },
    {sync: true},
  );
  stopSecond = subscribe(
    store,
    () => {
      order.push('second');
    },
    {sync: true},
  );
  store.count = 1;
  console.log('Ours:', JSON.stringify(order));
}

console.log('── a setter that writes two fields ──');
{
  class Name {
    first = 'Ada';
    last = 'Lovelace';
    constructor() {
      makeAutoObservable(this);
    }
    get full() {
      return `${this.first} ${this.last}`;
    }
    set full(value: string) {
      const [first, last] = value.split(' ');
      this.first = first;
      this.last = last;
    }
  }
  const store = new Name();
  const seen: string[] = [];
  const dispose = autorun(() => {
    seen.push(`${store.first} ${store.last}`);
  });
  seen.length = 0;
  store.full = 'Grace Hopper';
  console.log(
    'MobX reaction saw',
    JSON.stringify(seen),
    '| warnings:',
    drain(warnings).length,
  );
  dispose();
}
{
  class Name {
    first = 'Ada';
    last = 'Lovelace';
    get full() {
      return `${this.first} ${this.last}`;
    }
    set full(value: string) {
      const [first, last] = value.split(' ');
      this.first = first;
      this.last = last;
    }
  }
  const store = createClassyStore(new Name());
  const seen: string[] = [];
  subscribe(
    store,
    () => {
      const snap = snapshot(store);
      seen.push(`${snap.first} ${snap.last}`);
    },
    {sync: true},
  );
  store.full = 'Grace Hopper';
  console.log('Ours sync subscriber saw', JSON.stringify(seen));
}

console.log('── a getter that writes while it runs ──');
{
  class Sneaky {
    count = 1;
    reads = 0;
    constructor() {
      makeAutoObservable(this);
    }
    get doubled() {
      this.reads++;
      return this.count * 2;
    }
  }
  const store = new Sneaky();
  const watchReads = autorun(() => {
    void store.reads;
  });
  const dispose = autorun(() => {
    void store.doubled;
  });
  console.log(
    'MobX: reads',
    store.reads,
    '| warnings:',
    JSON.stringify(drain(warnings)),
  );
  dispose();
  watchReads();
}

console.log('── a reaction that throws ──');
{
  class Counter {
    count = 0;
    constructor() {
      makeAutoObservable(this);
    }
    fail() {
      this.count++;
      throw new Error('action failed');
    }
  }
  const store = new Counter();
  const order: string[] = [];
  const first = autorun(() => {
    if (store.count === 1) throw new Error('reaction failed');
    order.push(`first:${store.count}`);
  });
  const second = autorun(() => {
    order.push(`second:${store.count}`);
  });
  order.length = 0;
  runInAction(() => {
    store.count = 1;
  });
  console.log(
    'MobX: later reactions still ran',
    JSON.stringify(order),
    '| console.error:',
    JSON.stringify(drain(errors)),
  );
  runInAction(() => {
    store.count = 0;
  });
  order.length = 0;
  try {
    store.fail();
  } catch (error) {
    order.push(`caller caught: ${(error as Error).message}`);
  }
  console.log(
    'MobX: an action that throws, with a reaction that then throws:',
    JSON.stringify(order),
    '| console.error:',
    drain(errors).length,
    '| console.warn:',
    JSON.stringify(drain(warnings)),
  );
  first();
  second();
}

console.warn = realWarn;
console.error = realError;
void batch;
void configure;
void flow;
```

```text
── a write after an await inside a method ──
MobX async method        reaction saw ["true/0","true/3","false/3"] | warnings: ["[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Loader@1.rows","[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Loader@1.loading"]
MobX await + runInAction reaction saw ["true/3","false/6"] | warnings: 0
MobX generator (flow)    reaction saw ["true/6","false/9"] | warnings: 0
Ours async method        sync subscriber saw ["true/0","true/3","false/3"] | warnings: 0
── a reaction that writes to what it observes ──
MobX autorun that always writes, first run: runs 1 | count 1 | errors: 0 | warnings: 0
MobX the same autorun after an outside write: runs 99 | count 109 | errors: ["Reaction doesn't converge to a stable state after 100 iterations. Probably there is a cycle in the reactive function: Reaction[Autorun@4]"] | warnings: 1 distinct
MobX re-entrant write, two reactions: ["first:1","second:2","first:2"]
Ours sync subscriber that always writes: calls 2993 | count 2993 | errors: ["RangeError: Maximum call stack size exceeded."]
Ours re-entrant write, two sync subscribers: ["first:1","first:2","second:2","second:2"]
── a subscriber removed during delivery ──
MobX: ["first"]
Ours: ["first","second"]
── a setter that writes two fields ──
MobX reaction saw ["Grace Hopper"] | warnings: 0
Ours sync subscriber saw ["Grace Lovelace","Grace Hopper"]
── a getter that writes while it runs ──
MobX: reads 1 | warnings: ["[MobX] Since strict-mode is enabled, changing (observed) observable values without using an action is not allowed. Tried to modify: Sneaky@13.reads"]
── a reaction that throws ──
MobX: later reactions still ran ["second:1"] | console.error: ["[mobx] Encountered an uncaught exception that was thrown by a reaction or observer component, in: 'Reaction[Autorun@17]' Error: reaction failed"]
MobX: an action that throws, with a reaction that then throws: ["second:1","caller caught: action failed"] | console.error: 0 | console.warn: ["[mobx] (error in reaction 'Autorun@17' suppressed, fix error of causing action below)"]
```

### Script 06: a subclass that overrides a getter, functions and classes as data

Port of `core.characterisation.getters.test.ts:1551-1574` and of stage 1
findings 5 and 6 in `core.characterisation.identity.test.ts`.

`06-subclass-and-functions.ts`:

```ts
// Ports of "getters on a subclass" (getters test :1551-1574), "a function read
// from an array is a new wrapper on every read" and "a class held in a store"
// (identity test, findings 5 and 6).
import {
  action,
  autorun,
  computed,
  isAction,
  makeAutoObservable,
  makeObservable,
  observable,
  observableRef,
  observableShallow,
  override,
  runInAction,
} from 'mobx';
import {createClassyStore} from './ours';

const outcome = (run: () => unknown) => {
  try {
    return JSON.stringify(run());
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${String(
      (error as Error).message,
    )
      .replace(/\n/g, ' ')
      .slice(0, 150)}`;
  }
};

console.log('── a subclass that overrides a getter ──');
{
  class Base {
    count = 5;
    constructor() {
      makeAutoObservable(this);
    }
    get label(): string {
      return `base:${this.count}`;
    }
  }
  class Derived extends Base {
    suffix = '!';
    constructor() {
      super();
      makeAutoObservable(this);
    }
    override get label(): string {
      return `derived(${super.label})${this.suffix}`;
    }
  }
  console.log(
    'MobX makeAutoObservable in a subclass      :',
    outcome(() => new Derived().label),
  );
}
{
  const runs = {base: 0, derived: 0, inherited: 0};
  class Base {
    count = 5;
    constructor() {
      makeObservable(this, {
        count: observable,
        label: computed,
        next: computed,
        bump: action,
      });
    }
    get label(): string {
      runs.base++;
      return `base:${this.count}`;
    }
    get next() {
      runs.inherited++;
      return this.count + 1;
    }
    bump() {
      this.count++;
    }
  }
  class Forgetful extends Base {
    suffix = '!';
    constructor() {
      super();
      makeObservable(this, {suffix: observable, label: computed});
    }
    override get label(): string {
      return `derived(${super.label})${this.suffix}`;
    }
  }
  console.log(
    'MobX makeObservable, getter annotated twice:',
    outcome(() => new Forgetful().label),
  );

  class Derived extends Base {
    suffix = '!';
    constructor() {
      super();
      makeObservable(this, {
        suffix: observable,
        label: override,
        bump: override,
      });
    }
    override get label(): string {
      runs.derived++;
      return `derived(${super.label})${this.suffix}`;
    }
    override bump() {
      super.bump();
      this.suffix += '!';
    }
  }
  const store = new Derived();
  const seen: unknown[] = [];
  const dispose = autorun(() => {
    seen.push([store.label, store.next]);
  });
  console.log(
    'MobX makeObservable + override, first run  :',
    JSON.stringify(seen),
    JSON.stringify(runs),
  );
  runInAction(() => {
    store.suffix = '?';
  });
  console.log(
    'MobX after a write to the subclass field   :',
    JSON.stringify(seen.at(-1)),
    JSON.stringify(runs),
  );
  store.bump();
  console.log(
    'MobX after an overridden action            :',
    JSON.stringify(seen.at(-1)),
    JSON.stringify(runs),
    '| reaction runs in total:',
    seen.length,
  );
  dispose();
}
{
  const runs = {base: 0, derived: 0, inherited: 0};
  class Base {
    count = 5;
    get label(): string {
      runs.base++;
      return `base:${this.count}`;
    }
    get next() {
      runs.inherited++;
      return this.count + 1;
    }
  }
  class Derived extends Base {
    suffix = '!';
    override get label(): string {
      runs.derived++;
      return `derived(${super.label})${this.suffix}`;
    }
  }
  const store = createClassyStore(new Derived());
  const first = [store.label, store.next];
  console.log(
    'Ours, first read                           :',
    JSON.stringify(first),
    JSON.stringify(runs),
  );
  store.suffix = '?';
  console.log(
    'Ours after a write to the subclass field   :',
    JSON.stringify([store.label, store.next]),
    JSON.stringify(runs),
  );
}

console.log('── a function held in an array ──');
{
  const first = () => 'first';
  const second = () => 'second';
  const store = observable({callbacks: [first, second]});
  console.log(
    'MobX: same function on two reads:',
    store.callbacks[0] === store.callbacks[0],
    '| is the function that was stored:',
    store.callbacks[0] === first,
    '| wrapped as an action:',
    isAction(store.callbacks[0]),
    '| indexOf(first):',
    store.callbacks.indexOf(first),
    '| indexOf(what was read):',
    store.callbacks.indexOf(store.callbacks[1]),
  );
  const byRef = observable(
    {callbacks: [first, second]},
    {callbacks: observableShallow},
  );
  console.log(
    'MobX observableShallow: is the function that was stored:',
    byRef.callbacks[0] === first,
    '| indexOf(first):',
    byRef.callbacks.indexOf(first),
  );
}
{
  const first = () => 'first';
  const second = () => 'second';
  const store = createClassyStore({callbacks: [first, second]});
  console.log(
    'Ours: same function on two reads:',
    store.callbacks[0] === store.callbacks[0],
    '| is the function that was stored:',
    store.callbacks[0] === first,
    '| indexOf(first):',
    store.callbacks.indexOf(first),
    '| indexOf(what was read):',
    store.callbacks.indexOf(store.callbacks[1]),
  );
}

console.log('── a class held in a store ──');
{
  class Model {
    static label = 'model';
    constructor(public name: string) {}
  }
  const store = observable({Model});
  console.log(
    'MobX:',
    outcome(() => [
      store.Model === Model,
      (store.Model as typeof Model).label ?? null,
    ]),
    '| new:',
    outcome(() => new store.Model('x') instanceof Model),
  );
  const byRef = observable({Model}, {Model: observableRef});
  console.log(
    'MobX observableRef:',
    outcome(() => [
      byRef.Model === Model,
      byRef.Model.label,
      new byRef.Model('x') instanceof byRef.Model,
    ]),
  );
}
{
  class Model {
    static label = 'model';
    constructor(public name: string) {}
  }
  const store = createClassyStore({Model});
  console.log(
    'Ours:',
    outcome(() => [
      store.Model === Model,
      store.Model.label ?? null,
      new store.Model('x') instanceof store.Model,
    ]),
  );
}

console.log('── a class instance nested in a store ──');
{
  class Plain {
    n = 0;
  }
  class Marked {
    n = 0;
    constructor() {
      makeAutoObservable(this);
    }
  }
  const store = observable({
    plain: new Plain(),
    marked: new Marked(),
    literal: {n: 0},
  });
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    void store.plain.n;
    void store.marked.n;
    void store.literal.n;
  });
  runInAction(() => {
    store.plain.n = 1;
  });
  const afterPlain = runs - 1;
  runInAction(() => {
    store.marked.n = 1;
  });
  const afterMarked = runs - 1 - afterPlain;
  runInAction(() => {
    store.literal.n = 1;
  });
  console.log(
    'MobX: reaction runs after a write to a plain class instance:',
    afterPlain,
    '| to one that called makeAutoObservable:',
    afterMarked,
    '| to an object literal:',
    runs - 1 - afterPlain - afterMarked,
    '| instance kept by reference:',
    store.plain instanceof Plain,
  );
  dispose();
}
```

```text
── a subclass that overrides a getter ──
MobX makeAutoObservable in a subclass      : threw Error: [MobX] 'makeAutoObservable' can only be used for classes that don't have a superclass
MobX makeObservable, getter annotated twice: threw Error: [MobX] Cannot apply 'computed' to 'Forgetful@1.label': The field is already annotated with 'computed'. Re-annotating fields is not allowed. Use 'overr
MobX makeObservable + override, first run  : [["derived(base:5)!",6]] {"base":1,"derived":1,"inherited":1}
MobX after a write to the subclass field   : ["derived(base:5)?",6] {"base":2,"derived":2,"inherited":1}
MobX after an overridden action            : ["derived(base:6)?!",7] {"base":3,"derived":3,"inherited":2} | reaction runs in total: 3
Ours, first read                           : ["derived(base:5)!",6] {"base":1,"derived":1,"inherited":1}
Ours after a write to the subclass field   : ["derived(base:5)?",6] {"base":2,"derived":2,"inherited":1}
── a function held in an array ──
MobX: same function on two reads: true | is the function that was stored: false | wrapped as an action: true | indexOf(first): -1 | indexOf(what was read): 1
MobX observableShallow: is the function that was stored: true | indexOf(first): 0
Ours: same function on two reads: false | is the function that was stored: false | indexOf(first): -1 | indexOf(what was read): -1
── a class held in a store ──
MobX: [false,null] | new: threw TypeError: Cannot call a class constructor Model without |new|
MobX observableRef: [true,"model",true]
Ours: [false,null,false]
── a class instance nested in a store ──
MobX: reaction runs after a write to a plain class instance: 0 | to one that called makeAutoObservable: 1 | to an object literal: 1 | instance kept by reference: true
```

### Script 07: the cost of validating a ladder of getters

A measurement, not a port.

`07-validation-cost.ts`:

```ts
// A measurement, not a port: what a clean read of a getter costs when getters
// read each other in a ladder. Each level has two getters and each reads both
// getters of the level below.
import {autorun, makeAutoObservable, runInAction} from 'mobx';
import {createClassyStore, snapshot} from './ours';

function ladder(depth: number, observable: boolean) {
  const runs = {count: 0};
  const target: Record<string, unknown> = {base: 1, unrelated: 0};
  for (let level = 0; level < depth; level++) {
    for (const side of ['l', 'r']) {
      Object.defineProperty(target, `${side}${level}`, {
        enumerable: true,
        configurable: true,
        get(this: Record<string, number>) {
          runs.count++;
          return level === 0
            ? this.base
            : this[`l${level - 1}`] + this[`r${level - 1}`];
        },
      });
    }
  }
  const store = observable
    ? makeAutoObservable(target)
    : createClassyStore(target);
  return {store: store as Record<string, number>, runs, top: `l${depth - 1}`};
}

const time = (run: () => void) => {
  const start = performance.now();
  run();
  return `${(performance.now() - start).toFixed(2)} ms`.padStart(12);
};

console.log(
  'depth | ours: first read | ours: clean read | ours: read after base changed | ours: first snapshot read | getter runs (ours live, first read)',
);
for (const depth of [4, 8, 12, 16, 18]) {
  const {store, runs, top} = ladder(depth, false);
  const first = time(() => void store[top]);
  const firstRuns = runs.count;
  const clean = time(() => void store[top]);
  store.base = 2;
  const dirty = time(() => void store[top]);
  const snap = ladder(depth, false);
  const snapFirst = time(() => void snapshot(snap.store)[snap.top]);
  console.log(
    String(depth).padStart(5),
    '|',
    first,
    '|',
    clean,
    '|',
    dirty,
    '|',
    snapFirst,
    '|',
    firstRuns,
  );
}

console.log(
  'depth | MobX observed: first run | clean read | reaction after base changed | getter runs (first run)',
);
for (const depth of [4, 8, 12, 16, 18, 200]) {
  const {store, runs, top} = ladder(depth, true);
  let dispose = () => {};
  const first = time(() => {
    dispose = autorun(() => void store[top]);
  });
  const firstRuns = runs.count;
  const clean = time(() => void store[top]);
  const dirty = time(() =>
    runInAction(() => {
      store.base = 2;
    }),
  );
  dispose();
  console.log(
    String(depth).padStart(5),
    '|',
    first,
    '|',
    clean,
    '|',
    dirty,
    '|',
    firstRuns,
  );
}

console.log('depth | MobX unobserved: one read | getter runs');
for (const depth of [4, 8, 12, 16, 200]) {
  const {store, runs, top} = ladder(depth, true);
  const first = time(() => void store[top]);
  console.log(String(depth).padStart(5), '|', first, '|', runs.count);
}
```

```text
depth | ours: first read | ours: clean read | ours: read after base changed | ours: first snapshot read | getter runs (ours live, first read)
    4 |      0.19 ms |      0.01 ms |      0.03 ms |      0.23 ms | 7
    8 |      0.09 ms |      0.03 ms |      0.10 ms |      0.07 ms | 15
   12 |      0.42 ms |      0.30 ms |      0.34 ms |      0.07 ms | 23
   16 |      2.27 ms |      1.57 ms |      1.96 ms |      0.05 ms | 31
   18 |      6.51 ms |      4.12 ms |      6.44 ms |      0.07 ms | 35
depth | MobX observed: first run | clean read | reaction after base changed | getter runs (first run)
    4 |      0.43 ms |      0.01 ms |      0.21 ms | 7
    8 |      0.11 ms |      0.00 ms |      0.12 ms | 15
   12 |      0.07 ms |      0.00 ms |      0.08 ms | 23
   16 |      0.08 ms |      0.01 ms |      0.10 ms | 31
   18 |      0.06 ms |      0.00 ms |      0.07 ms | 35
  200 |      0.50 ms |      0.00 ms |      0.48 ms | 399
depth | MobX unobserved: one read | getter runs
    4 |      0.11 ms | 7
    8 |      0.03 ms | 15
   12 |      0.02 ms | 23
   16 |      0.05 ms | 31
  200 |      0.45 ms | 399
```

### Script 08: an observable `#private` accessor with standard decorators

`08-decorators.ts`:

```ts
// MobX 7 with standard (2022.3) decorators: an observable #private accessor.
import {action, autorun, computed, observable} from 'mobx';

class Vault {
  @observable accessor #secret = 1;

  @computed get doubled() {
    return this.#secret * 2;
  }

  @action bump() {
    this.#secret = this.#secret + 1;
  }
}

const store = new Vault();
const seen: number[] = [];
const dispose = autorun(() => {
  seen.push(store.doubled);
});
store.bump();
console.log(
  'MobX @observable accessor #secret: reaction saw',
  JSON.stringify(seen),
);
dispose();
```

```text
MobX @observable accessor #secret: reaction saw [2,4]
```

### Script 09: the checks behind the table and the API answers

`09-shape-and-diagnostics.ts`:

```ts
// Checks behind the API answers and the table of stage 1 findings. Not ports of
// one test each; every block names the finding it speaks to.
import {
  autorun,
  configure,
  isObservable,
  makeAutoObservable,
  observable,
  runInAction,
  toJS,
} from 'mobx';

const outcome = (run: () => unknown) => {
  try {
    return JSON.stringify(run());
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${String(
      (error as Error).message,
    )
      .replace(/\n/g, ' ')
      .slice(0, 140)}`;
  }
};
const warnings: string[] = [];
console.warn = (...args: unknown[]) => {
  warnings.push(String(args[0]).slice(0, 130));
};
const drain = () => {
  const copy = [...warnings];
  warnings.length = 0;
  return copy;
};

console.log('── API question 3: are computed values enumerable? ──');
{
  class Cart {
    amount = 10;
    constructor() {
      makeAutoObservable(this);
    }
    get doubled() {
      return this.amount * 2;
    }
    add() {
      this.amount++;
    }
  }
  const store = new Cart();
  console.log(
    'class instance: Object.keys',
    JSON.stringify(Object.keys(store)),
    '| JSON.stringify',
    JSON.stringify(store),
    '| toJS',
    JSON.stringify(toJS(store)),
    '| own accessor:',
    Object.hasOwn(store, 'doubled'),
    '| enumerable:',
    Object.getOwnPropertyDescriptor(store, 'doubled')?.enumerable,
  );
  const literal = observable({
    amount: 10,
    get doubled(): number {
      return this.amount * 2;
    },
  });
  console.log(
    'object literal: Object.keys',
    JSON.stringify(Object.keys(literal)),
    '| JSON.stringify',
    JSON.stringify(literal),
    '| spread',
    JSON.stringify({...literal}),
  );
}

console.log('── finding 1 and 45: Object.defineProperty through the store ──');
{
  const store = observable({a: 1}) as Record<string, number>;
  const seen: unknown[] = [];
  const dispose = autorun(() => {
    seen.push([Object.keys(store), store.b ?? null]);
  });
  runInAction(() => {
    Object.defineProperty(store, 'b', {
      value: 2,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });
  console.log('MobX: reaction saw', JSON.stringify(seen));
  dispose();
}

console.log('── finding 44: a getter that is redefined ──');
{
  const store = observable({
    count: 2,
    get view(): string {
      return `old ${this.count}`;
    },
  });
  const seen: string[] = [];
  const dispose = autorun(() => {
    seen.push(store.view);
  });
  console.log(
    'plain object:',
    outcome(() => {
      runInAction(() => {
        Object.defineProperty(store, 'view', {
          get() {
            return `new ${this.count}`;
          },
          configurable: true,
        });
      });
      return seen;
    }),
    '| read now:',
    store.view,
  );
  dispose();
  class Viewer {
    count = 2;
    constructor() {
      makeAutoObservable(this);
    }
    get view() {
      return `old ${this.count}`;
    }
  }
  const instance = new Viewer();
  console.log(
    'class instance:',
    outcome(() =>
      Object.defineProperty(instance, 'view', {
        get() {
          return 'new';
        },
        configurable: true,
      }),
    ),
  );
}

console.log('── finding 7, 9, 10, 11: the raw object and the store ──');
{
  const raw = {n: 0};
  const store = observable({list: [raw], child: raw});
  console.log(
    'MobX: list.includes(raw)',
    store.list.includes(raw),
    '| store.child === raw',
    store.child === raw,
    '| raw is observable',
    isObservable(raw),
    '| includes(what was read)',
    store.list.includes(store.list[0]),
  );
  raw.n = 5;
  console.log(
    'MobX: after raw.n = 5, store.child.n is',
    store.child.n,
    '(the store holds a copy)',
  );
}

console.log(
  '── API question 5: a native Map and Set held in observable state ──',
);
{
  const map = new Map([['a', {n: 1}]]);
  const set = new Set([1]);
  const store = observable({map, set});
  let runs = 0;
  const dispose = autorun(() => {
    runs++;
    void store.map.get('a')?.n;
    void store.set.has(2);
  });
  runInAction(() => {
    store.map.get('a')!.n = 2;
  });
  runInAction(() => {
    store.set.add(2);
  });
  console.log(
    'MobX: same object as given',
    store.map === map,
    '| instanceof Map',
    store.map instanceof Map,
    '| instanceof Set',
    store.set instanceof Set,
    '| toStringTag',
    Object.prototype.toString.call(store.map),
    '| reaction runs after two writes:',
    runs - 1,
    '| original map entry changed:',
    map.get('a')?.n,
  );
  console.log(
    'MobX: structuredClone of the observable map:',
    outcome(() => structuredClone(store.map) instanceof Map),
  );
  dispose();
}

console.log('── finding 46: freezing ──');
{
  const store = observable({config: {nested: {a: 1}}, list: [1]});
  console.log(
    'Object.freeze(store.config):',
    outcome(() => Object.freeze(store.config)),
  );
  console.log(
    'Object.freeze(store.list)  :',
    outcome(() => Object.freeze(store.list)),
  );
  console.log(
    'observable(frozen object)  :',
    outcome(() => isObservable(observable(Object.freeze({a: 1})))),
  );
  const holder = observable({value: null as unknown});
  runInAction(() => {
    holder.value = Object.freeze({a: {b: 1}});
  });
  console.log(
    'a frozen object assigned into a store:',
    outcome(() => [isObservable(holder.value), Object.isFrozen(holder.value)]),
  );
}

console.log('── API question 8: opt-in warnings ──');
{
  configure({computedRequiresReaction: true, reactionRequiresObservable: true});
  class Cart {
    amount = 10;
    constructor() {
      makeAutoObservable(this);
    }
    get doubled() {
      return this.amount * 2;
    }
    get constant() {
      return 42;
    }
  }
  const store = new Cart();
  void store.doubled;
  console.log('computed read with no observer:', JSON.stringify(drain()));
  const dispose = autorun(() => {
    void store.constant;
  });
  console.log(
    'computed that read nothing observable:',
    JSON.stringify(drain()),
  );
  dispose();
  const empty = autorun(() => {});
  console.log(
    'reaction that read nothing observable:',
    JSON.stringify(drain()),
  );
  empty();
  configure({
    computedRequiresReaction: false,
    reactionRequiresObservable: false,
  });
}

console.log('── build: NODE_ENV =', process.env.NODE_ENV ?? '(unset)', '──');
{
  class Base {
    count = 0;
    constructor() {
      makeAutoObservable(this);
    }
  }
  class Derived extends Base {
    extra = 0;
    constructor() {
      super();
      makeAutoObservable(this);
    }
  }
  console.log(
    'makeAutoObservable in a subclass:',
    outcome(() => {
      const d = new Derived();
      return Object.keys(d);
    }),
  );
  const store = new Base();
  const dispose = autorun(() => {
    void store.count;
  });
  store.count = 1;
  console.log('write outside an action, warnings:', drain().length);
  class Cycle {
    constructor() {
      makeAutoObservable(this);
    }
    get a(): number {
      return this.a + 1;
    }
  }
  console.log(
    'cycle:',
    outcome(() => new Cycle().a),
  );
  dispose();
}
```

With `NODE_ENV` unset:

```text
── API question 3: are computed values enumerable? ──
class instance: Object.keys ["amount"] | JSON.stringify {"amount":10} | toJS {"amount":10} | own accessor: true | enumerable: false
object literal: Object.keys ["amount"] | JSON.stringify {"amount":10} | spread {"amount":10}
── finding 1 and 45: Object.defineProperty through the store ──
MobX: reaction saw [[["a"],null],[["a","b"],2]]
── finding 44: a getter that is redefined ──
plain object: ["old 2","new 2"] | read now: new 2
class instance: threw TypeError: Attempting to change configurable attribute of unconfigurable property.
── finding 7, 9, 10, 11: the raw object and the store ──
MobX: list.includes(raw) false | store.child === raw false | raw is observable false | includes(what was read) true
MobX: after raw.n = 5, store.child.n is 0 (the store holds a copy)
── API question 5: a native Map and Set held in observable state ──
MobX: same object as given false | instanceof Map false | instanceof Set false | toStringTag [object Map] | reaction runs after two writes: 2 | original map entry changed: 1
MobX: structuredClone of the observable map: threw DOMException: The object can not be cloned.
── finding 46: freezing ──
Object.freeze(store.config): threw Error: [MobX] Dynamic observable objects cannot be frozen. If you're passing observables to 3rd party component/function that calls Object.freeze,
Object.freeze(store.list)  : threw Error: [MobX] Observable arrays cannot be frozen. If you're passing observables to 3rd party component/function that calls Object.freeze, pass copy
observable(frozen object)  : true
a frozen object assigned into a store: [true,false]
── API question 8: opt-in warnings ──
computed read with no observer: ["[mobx] Computed value 'Cart@14.doubled' is being read outside a reactive context. Doing a full recompute."]
computed that read nothing observable: ["[mobx] Derivation 'Cart@14.constant' is created/updated without reading any observable value."]
reaction that read nothing observable: ["[mobx] Derivation 'Autorun@16' is created/updated without reading any observable value."]
── build: NODE_ENV = (unset) ──
makeAutoObservable in a subclass: threw Error: [MobX] 'makeAutoObservable' can only be used for classes that don't have a superclass
write outside an action, warnings: 1
cycle: threw Error: [MobX] Cycle detected in computation Cycle@19.a: get a() {       return this.a + 1;     }
```

The last block again, with `NODE_ENV=production`:

```text
── build: NODE_ENV = production ──
makeAutoObservable in a subclass: threw TypeError: Unable to delete property.
write outside an action, warnings: 0
cycle: threw Error: [MobX] minified error nr: 32 ObservableObject.key,get a() {       return this.a + 1;     }. See mobx.js.org/errors
```

### Script 10: a base class whose constructor returns the proxy

A spike on our unmodified library, not a port.

`10-base-class-spike.ts`:

```ts
// A spike, not a port: what MobX's "make `this` reactive inside the constructor"
// would look like for a Proxy store. The base constructor returns the proxy, so
// the subclass's field initialisers and constructor body run with `this` set to it.
import {createClassyStore, snapshot, subscribe} from './ours';

const outcome = (run: () => unknown) => {
  try {
    return JSON.stringify(run());
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${String((error as Error).message).slice(0, 80)}`;
  }
};

class ClassyBase {
  constructor() {
    // biome-ignore lint/correctness/noConstructorReturn: the point of the spike
    return createClassyStore(this);
  }
}

const registry: object[] = [];

class Counter extends ClassyBase {
  count = 0;
  #secret = 1;
  rows = [{n: 1}];
  constructor() {
    super();
    registry.push(this);
  }
  increment = () => {
    this.count++;
    this.#secret++;
  };
  get doubledSecret() {
    return this.#secret * 2;
  }
  get total() {
    return this.rows.reduce((sum, row) => sum + row.n, 0);
  }
}

const store = new Counter();
let calls = 0;
subscribe(
  store,
  () => {
    calls++;
  },
  {sync: true},
);

console.log(
  'first snapshot, before any read through the store: rows frozen?',
  Object.isFrozen(snapshot(store).rows),
  '| row frozen?',
  Object.isFrozen(snapshot(store).rows[0]),
);
const detached = store.increment;
detached();
console.log(
  'arrow-function method: count',
  store.count,
  '| sync notifications',
  calls,
  '| snapshot count',
  snapshot(store).count,
);
console.log(
  'getter that reads #secret, live:',
  outcome(() => store.doubledSecret),
);
console.log(
  'getter that reads #secret, snapshot:',
  outcome(() => snapshot(store).doubledSecret),
);
console.log(
  '`this` kept by the constructor is the store:',
  registry[0] === store,
);
calls = 0;
(registry[0] as Counter).count = 9;
console.log('write through that reference: sync notifications', calls);
store.rows[0].n = 5;
console.log(
  'getter over rows after a row write:',
  store.total,
  '| snapshot:',
  snapshot(store).total,
  '| rows frozen now?',
  Object.isFrozen(snapshot(store).rows),
);
```

```text
first snapshot, before any read through the store: rows frozen? false | row frozen? false
arrow-function method: count 1 | sync notifications 1 | snapshot count 1
getter that reads #secret, live: 4
getter that reads #secret, snapshot: threw TypeError: Cannot access invalid private field (evaluating 'this.#secret')
`this` kept by the constructor is the store: true
write through that reference: sync notifications 1
getter over rows after a row write: 5 | snapshot: 5 | rows frozen now? true
```

### Script 11: a subscriber added after a write, and a replaced object

Port of stage 1 findings 21 and 26
(`core.characterisation.notifications.test.ts`,
`core.characterisation.detached.test.ts`).

`11-late-and-replaced.ts`:

```ts
// Ports of "a subscriber added after a write sometimes hears that write"
// (finding 21) and "a subscription follows the object, not the property"
// (finding 26, detached test).
import {
  autorun,
  makeAutoObservable,
  observe,
  reaction,
  runInAction,
} from 'mobx';
import {batch, createClassyStore, subscribe} from './ours';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

console.log('── a subscriber added after a write ──');
{
  class Counter {
    count = 0;
    constructor() {
      makeAutoObservable(this);
    }
  }
  const store = new Counter();
  const early: number[] = [];
  const late: number[] = [];
  const lateEffect: number[] = [];
  const disposeEarly = autorun(() => {
    early.push(store.count);
  });
  let disposeLate = () => {};
  let disposeEffect = () => {};
  runInAction(() => {
    store.count = 1;
    disposeLate = autorun(() => {
      late.push(store.count);
    });
    disposeEffect = reaction(
      () => store.count,
      (count) => {
        lateEffect.push(count);
      },
    );
  });
  console.log(
    'MobX: early autorun saw',
    JSON.stringify(early),
    '| autorun added after the write saw',
    JSON.stringify(late),
    '| reaction() added after the write fired',
    JSON.stringify(lateEffect),
  );
  disposeEarly();
  disposeLate();
  disposeEffect();
}
{
  const store = createClassyStore({count: 0});
  let early = 0;
  let late = 0;
  subscribe(
    store,
    () => {
      early++;
    },
    {sync: true},
  );
  batch(() => {
    store.count = 1;
    subscribe(
      store,
      () => {
        late++;
      },
      {sync: true},
    );
  });
  console.log(
    'Ours, sync, inside batch(): early subscriber calls',
    early,
    '| subscriber added after the write, calls',
    late,
  );

  const batched = createClassyStore({count: 0});
  let earlyBatched = 0;
  let lateBatched = 0;
  subscribe(batched, () => {
    earlyBatched++;
  });
  batched.count = 1;
  subscribe(batched, () => {
    lateBatched++;
  });
  await flush();
  console.log(
    'Ours, batched: early subscriber calls',
    earlyBatched,
    '| subscriber added after the write, calls',
    lateBatched,
  );
}

console.log('── watching store.user, then replacing the user ──');
{
  class Session {
    user = {name: 'Ada'};
    constructor() {
      makeAutoObservable(this);
    }
  }
  const store = new Session();
  const byPath: string[] = [];
  let byObject = 0;
  const disposePath = autorun(() => {
    byPath.push(store.user.name);
  });
  const disposeObject = observe(store.user, () => {
    byObject++;
  });
  runInAction(() => {
    store.user = {name: 'Grace'};
  });
  runInAction(() => {
    store.user.name = 'Hedy';
  });
  console.log(
    'MobX: autorun(() => store.user.name) saw',
    JSON.stringify(byPath),
    '| observe(store.user, cb) calls',
    byObject,
  );
  disposePath();
  disposeObject();
}
{
  const store = createClassyStore({user: {name: 'Ada'}});
  let calls = 0;
  subscribe(
    store.user,
    () => {
      calls++;
    },
    {sync: true},
  );
  store.user = {name: 'Grace'};
  store.user.name = 'Hedy';
  console.log('Ours: subscribe(store.user, cb) calls', calls);
}
```

```text
── a subscriber added after a write ──
MobX: early autorun saw [0,1] | autorun added after the write saw [1] | reaction() added after the write fired []
Ours, sync, inside batch(): early subscriber calls 1 | subscriber added after the write, calls 1
Ours, batched: early subscriber calls 1 | subscriber added after the write, calls 1
── watching store.user, then replacing the user ──
MobX: autorun(() => store.user.name) saw ["Ada","Grace","Hedy"] | observe(store.user, cb) calls 0
Ours: subscribe(store.user, cb) calls 0
```
