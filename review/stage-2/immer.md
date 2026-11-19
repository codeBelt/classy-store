# Stage 2: Immer

Stage 2 of the pre-1.0 review, 2026-11-19. Read-only: nothing in the
repository was changed apart from this file.

## Library, version and files read

- **Library:** Immer, `https://github.com/immerjs/immer`.
- **Version:** 11.2.10, the latest stable tag and the npm `latest` tag on
  2026-11-18.
- **Commit:** `16589b9c437a28433ceaf4072d5ab125287cd46a` (2026-11-10), tag
  `v11.2.10`, cloned into the scratch folder and read there. npm's `gitHead`
  for `immer@11.2.10` is the same commit.
- **Files read**, under `src/`: `core/proxy.ts`, `core/finalize.ts`,
  `core/immerClass.ts`, `core/scope.ts`, `core/current.ts`, `utils/common.ts`,
  `utils/errors.ts`, `utils/env.ts` and `plugins/mapset.ts` whole;
  `types/types-external.ts` lines 1 to 110.
- **Ours:** `snapshot/snapshot.ts`, `utils/internal/internal.ts`,
  `utils/cloneSnapshot/cloneSnapshot.ts`, `types.ts`, and in `core/core.ts`
  `isImmutableValue`, `linkChild` and the proxy handler (lines 330 to 525).
- **Ported tests** ran on Bun 1.4.4 and, where marked, Node 24.21.0, against
  `immer@11.2.10` from npm (its development build) and our source imported by
  absolute path. For Node, our source was bundled with `bun build` into the
  scratch folder first. Type-level port checked with TypeScript 7.0.2.

Line numbers for Immer refer to that commit. Line numbers for ours refer to
`release/1.0` at `12fe57d`. Machine: Apple M1 Max, not otherwise quiet, so
timings are best-of-seven and good to about 20 per cent.

## Summary

Immer and our snapshot layer solve the same problem from opposite ends. Immer
copies on write: a draft proxy makes a shallow copy of each object the first
time it is written, and `finalize` swaps finished copies into their parents.
We copy on read: the live store is mutated in place, and `snapshot()` rebuilds
every node whose version changed. Both end with a frozen tree in which
unchanged subtrees keep their identity. On the ports, the two agree on which
objects are new and which are kept: after one of 1,000 rows changes, the root,
the array and the row are new, and the other 999 rows and every other branch
keep their identity.

The findings that matter most:

1. **The cost of a snapshot after one row changed (finding 1).** Immer is no
   cheaper as long as it freezes: its deep freeze visits every element of
   every new array, which costs as much as our rebuild (66 against 56
   microseconds for 1,000 rows on Node; 138 against 119 on Bun). The floor is
   set by the engine. On Bun, freezing a new 1,000-element array costs about
   96 microseconds on its own, so nothing that returns a frozen array can be
   much faster. On Node, freezing is nearly free and 90 per cent of our cost is
   the per-element cache lookup; a rebuild that copies the previous snapshot
   array and recomputes only the changed indices measured 6 microseconds, nine
   times faster.
2. **Immer's proxies have a decoy target (finding 2).** A draft's Proxy target
   is Immer's own state object, not the user's object, so the user's object can
   be frozen, sealed or hold non-configurable properties without any Proxy
   invariant applying. Ours targets the raw object, which is the root of stage
   1 findings 46 and 49 and of the read-only special case in `linkChild`.
3. **Immer refuses what it cannot represent, with a numbered error (findings 3,
   4 and 5).** `Object.defineProperty`, `Object.setPrototypeOf` (which also
   blocks `__proto__` through `Object.assign`), and a named property written
   to an array all throw in development. In each case we accept the operation
   and then disagree with ourselves: the store and its snapshot diverge, or no
   subscriber is told.

Where Immer is weaker, the port shows it plainly: it flattens an own getter to
a value at the time of the copy, so the result reports a stale `double` (2 for
`n = 5`); it drops non-enumerable properties by default and leaves symbol-keyed
and non-enumerable objects unfrozen; it freezes the caller's own objects in
place; and a base that refers to itself produces a result whose `self` points
to the old base. Our behaviour is the one to keep in each case ("Where ours is
better").

## How the two designs differ

- **Immer copies on write.** `createProxyProxy` (`core/proxy.ts:57-105`) makes
  a revocable Proxy whose target is a state record holding `base_` (the
  user's object) and `copy_` (null until the first write). The `get` trap
  (`proxy.ts:111-162`) reads `latest(state)`, which is `copy_ ?? base_`, and
  creates a child draft lazily, only for an object that is still the base's
  own value at that key. The `set` trap (`proxy.ts:169-218`) returns early when
  the value is unchanged, otherwise calls `prepareCopy` (`proxy.ts:356-366`),
  which makes one shallow copy, and `markChanged` (`proxy.ts:347-354`), which
  marks every ancestor modified. An unmodified draft finalizes to its base
  (`core/finalize.ts:78-81`), which is the whole of Immer's structural sharing:
  what was never written is never copied.
- **We copy on read.** The store proxy targets the raw object
  (`core/core.ts:405`). A write bumps versions up to the root. `snapshot()`
  (`snapshot/snapshot.ts:235-288`) returns the cached frozen object when the
  version matches (`:241-244`) and otherwise rebuilds the node: an array by
  visiting every element (`:255-261`, through `mapOwnArrayElements`,
  `utils/internal/internal.ts:18-40`), an object by visiting every own key
  (`:264-275`). Each child's own cache answers in O(1), so unchanged subtrees
  are shared, but every element of a changed array is visited.
- **Freezing.** Immer freezes the finished result deeply once per `produce`
  (`finalize.ts:100-105`, called at `:54`), with `freeze(value, true)`
  (`utils/common.ts:266-289`). The walk stops at anything already frozen
  (`common.ts:268`), visits only enumerable string keys (`common.ts:278-287`,
  citing Immer issue 590), and freezes in place whatever it reaches, including
  objects that came from the caller. Freezing can be turned off
  (`setAutoFreeze`, `core/immerClass.ts:48`, `:175-181`). We freeze each
  snapshot node we build (`snapshot.ts:282`) and never freeze the caller's
  objects.

## Findings

### 1. The cost of a new snapshot after one row changed

- **What they do.** `produce` copies only written objects (`prepareCopy`,
  `proxy.ts:356-366`; an array is copied with `slice`, `common.ts:220`). Then
  `maybeFreeze` deep-freezes the result (`finalize.ts:100-105`), and
  `freeze(value, true)` calls itself on every element of every array it
  reaches (`common.ts:281-287`), each call ending at `isFrozen` for an
  unchanged row.
- **What we do.** `createSnapshotRecursive` (`snapshot.ts:255-261`) visits
  every element of a changed array; for each object element `snapshotValue`
  (`:183-193`) looks the child up in `childInternals` by `String(index)`, then
  `snapshotCache` by target, then compares versions. Then it freezes the new
  array (`:282`).
- **Difference in behaviour.** Measured, ports 1 and 1d:

  | 1,000 rows, write one, take the next result | Node 24      | Bun 1.4.4      |
  | ------------------------------------------- | ------------ | -------------- |
  | Immer, auto-freeze (default)                | 66.3 µs      | 138.5 µs       |
  | Immer, no freeze                            | 1.2 µs       | 1.6 µs         |
  | By hand: `slice`, replace one row, freeze   | 25.7 µs      | 97.6 µs        |
  | Copy previous frozen array by index, freeze | 6.0 µs       | 96.2 µs        |
  | The same without freezing the array         | 6.3 µs       | 2.3 µs         |
  | Ours                                        | 55.7–56.3 µs | 118.5–120.2 µs |
  | Ours, cached snapshot (nothing changed)     | 39 ns        | 22 ns          |
  | Immer, recipe that only reads one row       | 26.2 µs      | 16.7 µs        |

  At 10,000 rows every figure except the cached snapshot grows about ten
  times on Node and fifteen to twenty times on Bun, where freezing a larger
  array costs more per element (port 1b), so all of them are at least in
  proportion to the number of rows. Three things follow. First, Immer with freezing on
  costs the same as we do, so stage 1 finding 2 is not a defect of our design
  against Immer's. Second, on Bun `Object.freeze` of a new 1,000-element array
  costs about 94 microseconds by itself (row 4 against row 5): that is 80 per
  cent of our cost and cannot be removed while snapshots are frozen arrays.
  Third, on Node freezing is nearly free and our per-element lookup is about
  50 of the 56 microseconds. On V8, `slice` of a frozen array is slow (about
  27 nanoseconds per element, port 1b), and copying it by index is not (5).
  Immer's "reads one row" case costs 16 to 26 microseconds because the get
  trap calls `prepareCopy` to cache the child draft (`proxy.ts:154-159`),
  which copies the array even though nothing is written; the result is still
  the base.
- **Proposal: adapt.** Take Immer's idea of knowing which keys changed. When a
  child's version bump reaches its parent, record the child's key in a
  per-node "changed since the last snapshot" set. When that set is small,
  rebuild an array snapshot by copying the previous snapshot array by index and
  recomputing only the recorded indices; fall back to today's walk when the
  set is large, when the array's length changed, or when there is no previous
  snapshot. Expected effect on Node: 56 to about 6 microseconds for 1,000
  rows. On Bun the gain is small because freezing dominates. Do not adopt an
  off switch for freezing: frozen snapshots are part of the contract
  (`CLAUDE.md`, "frozen objects are values"), and Immer's own numbers show
  freezing is the price of that contract on JavaScriptCore.
- **Kind:** performance.
- **Cost:** `snapshot.ts` and the version propagation in `core.ts` or
  `ownership.ts`. Not breaking. Moderate risk: the dirty set must be cleared
  exactly when a snapshot is cached and must survive detach and resume; the
  invariant and fuzz tests from stage 1 cover the result. The 6 microseconds
  is the floor measured by port 1d, not a measured implementation.

### 2. A decoy Proxy target keeps the user's object out of Proxy invariants

- **What they do.** `createProxyProxy` uses the state record as the Proxy
  target (`proxy.ts:88-99`; an array draft's target is `[state]` so that
  `Array.isArray` stays true). Every trap reads from `latest(state)`. Because
  the target never has the user's properties, a frozen base, a sealed base, or
  a non-writable non-configurable property places no constraint on what a trap
  may return. `getOwnPropertyDescriptor` (`proxy.ts:236-246`) reports every
  property as writable and configurable. A frozen base is drafted and copied
  like any other (`shallowCopy` turns non-writable into writable,
  `common.ts:232-235`).
- **What we do.** The store proxy targets the raw object (`core.ts:405`). The
  engine therefore checks every `get` result against the raw object's
  descriptor. `linkChild` must leave a read-only property's object unproxied
  (`core.ts:369-374`, `isReadOnly` at `:345-347`), and freezing the raw object
  behind the store's back makes a read throw.
- **Difference in behaviour.** Port 2. A base frozen during the recipe and then
  written through the draft gives a new result in Immer; ours throws on read
  (stage 1 finding 46):

  ```text
  immer: base frozen during the recipe, then written through the draft: 2
  ours: read after the raw object was frozen: THROWS TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
  ```

  For a non-writable, non-configurable property holding an object, Immer
  writes inside it through a draft and leaves the base untouched; ours writes
  the shared raw object, notifies nobody, changes a snapshot already taken,
  and the snapshot's copy of it is not frozen (stage 1 finding 49).

  The decoy has a cost Immer pays too: `Object.freeze(draft)` throws an engine
  error about a property `parent_` of Immer's state record, which means
  nothing to the caller (port 2, last section).
- **Proposal: adapt, as a stage 3 design question, not a 1.0 blocker.** A decoy
  target would remove findings 46 and 49 (second half), and the read-only
  special case in `linkChild`. It also forces the proxy to answer every
  operation itself: `has`, `ownKeys`, `getOwnPropertyDescriptor`,
  `getPrototypeOf`, `defineProperty`, `preventExtensions`, `isExtensible`,
  which overlaps with stage 1 findings 1, 30, 45 and 50 and with the Vue
  report's finding on `has` and `ownKeys`. `Object.freeze(store)` and a frozen
  store root, which work today, would need explicit support. The smaller
  alternative is to document that the raw object must not be frozen or
  redefined once a store holds it.
- **Kind:** bug (46, 49), simplification.
- **Cost:** `core.ts` proxy handler; every trap. Not breaking for ordinary use;
  breaking for code that relies on `Object.isFrozen(store)` after freezing the
  raw object. High risk; a design change.

### 3. `defineProperty` and `setPrototypeOf` are refused with a clear error

- **What they do.** The `defineProperty` trap throws error 11, "Object.defineProperty() cannot be used on an Immer draft"
  (`proxy.ts:247-249`, text in `utils/errors.ts`). The `setPrototypeOf` trap
  throws error 12 (`proxy.ts:253-255`). Because `Object.assign` with an own
  `__proto__` key calls the `[[Set]]` of `__proto__`, which calls
  `setPrototypeOf`, the same trap also blocks that prototype swap.
- **What we do.** The `defineProperty` trap (`core.ts:502-513`) applies any
  definition to the raw object and only handles the case that makes a
  property read-only. There is no `setPrototypeOf` trap.
- **Difference in behaviour.** Port 5:

  ```text
  immer: on a draft: THROWS Error: [Immer] Object.defineProperty() cannot be used on an Immer draft
  ours: store reads: 2
  ours: subscriber calls: 0
  ours: snapshot has the property: false
  immer: Object.assign(draft, JSON.parse('{"__proto__": ...}')): THROWS Error: [Immer] Object.setPrototypeOf() cannot be used on an Immer draft
  ours: Object.assign(store, JSON.parse('{"__proto__": ...}')): [true, true]
  ```

- **Proposal: adopt, with one exception.** `Object.freeze(store)` reaches the
  `defineProperty` trap once per property with a descriptor that has no
  `value`, `get` or `set` (only `writable: false` and `configurable: false`),
  so that call can keep today's behaviour and every definition that carries a
  `value`, `get` or `set` can throw. Add a `setPrototypeOf` trap that throws.
  Both close stage 1 findings 1, 45, 47 (the prototype half), 48 and 71 with
  an error instead of a silent disagreement. The security agent's report on
  `persist` should say whether stored JSON can reach the `__proto__` path; the
  trap closes it either way.
- **Kind:** diagnostics, bug.
- **Cost:** `core.ts`, two traps. Breaking for code that defines properties on
  a store, which today half-works. Low risk.

### 4. Arrays carry indices and `length` only

- **What they do.** In development, writing a property of an array draft that
  is neither an index nor `length` throws error 14, and deleting one throws
  error 13 (`proxy.ts:274-288`). Copies are made with `slice`
  (`common.ts:220`), which keeps only the elements, so a named or symbol-keyed
  property of the base array is gone from any result in which the array
  changed.
- **What we do.** A named or symbol-keyed property of an array is reactive on
  the store and missing from its snapshot, because `mapOwnArrayElements`
  copies only indices (`internal.ts:18-40`, used at `snapshot.ts:257`). Stage 1
  finding 49.
- **Difference in behaviour.** Port 4: Immer throws on the write
  (`Immer only supports setting array indices and the 'length' property`) and
  drops the property after a `push`; ours accepts the write, the store reads
  `"y"` and the snapshot reads `undefined`. A symbol write on an Immer array
  draft fails with an unrelated `TypeError` from `parseInt`, so Immer's check
  is not complete either.
- **Proposal: adopt the rule, as a development error.** Carrying named
  properties into array snapshots would cost a `Reflect.ownKeys` of the whole
  array on every rebuild, which is the cost finding 1 tries to remove. Rejecting
  the write in development, as Immer does, makes the limit visible for nothing
  at run time in production. Document it in either case.
- **Kind:** diagnostics, docs.
- **Cost:** `core.ts` `set` and `deleteProperty` traps, behind the
  development check the diagnostics work (API question 8) introduces. Breaking
  only for code that relies on a value nobody can see in a snapshot. Low risk.

### 5. A delete that removes nothing is not a change

- **What they do.** `deleteProperty` (`proxy.ts:219-233`) marks the draft
  changed only when the key exists on the base; otherwise it forgets any
  pending assignment and leaves the draft unmodified, so `produce` returns the
  base.
- **What we do.** `deleteProperty` (`core.ts:515-524`) notifies whenever
  `Reflect.deleteProperty` returns `true`, which it also does for a key that
  is not there. Stage 1 finding 29.
- **Difference in behaviour.** Port 5: `produce(base, d => { delete d.missing })`
  returns `base`; ours calls the subscriber once and replaces the snapshot with
  an equal one.
- **Proposal: adopt.** Return `true` without notifying when
  `!Object.hasOwn(_target, prop)`. An inherited property cannot be deleted
  through the object either, so the same test covers it.
- **Kind:** bug.
- **Cost:** `core.ts`, one line. Not breaking. Low risk.

### 6. A plain object from another realm is opaque to us

- **What they do.** `isPlainObject` (`common.ts:61-78`) accepts a null
  prototype, `Object.prototype`, a prototype whose own `constructor` is
  `Object`, and otherwise compares `Function.prototype.toString` of the
  prototype's constructor with that of `Object`, cached per constructor in a
  `WeakMap` (`:59`, `:71-75`). An object made in an iframe or a Node `vm`
  context therefore counts as plain.
- **What we do.** `isPlainObject` (`internal.ts:54-60`) accepts only a null
  prototype or this realm's `Object.prototype`. `canProxy` (`:70-82`)
  therefore treats a foreign plain object as an opaque value. Foreign arrays
  pass, because `Array.isArray` works across realms.
- **Difference in behaviour.** Port 9 (Node and Bun, same output). Immer drafts
  and copies the foreign object. Ours hands out the raw object, a write inside
  it notifies nobody and changes a snapshot already taken. In a foreign array,
  a `push` notifies but a write to a foreign row does not.
- **Proposal: adopt.** The case is real for data from an iframe, a worker
  library that builds objects in a `vm` context, or a test runner with its own
  realm, and the failure is silent. Immer's per-constructor cache keeps the
  check cheap; the extra work happens only when the prototype is not this
  realm's.
- **Kind:** bug.
- **Cost:** `internal.ts`, about ten lines. It changes the result of `canProxy`
  for such objects, which `persist` and `history` also use, in the direction
  of treating them as data. Low risk.

### 7. Frozen means frozen to the bottom, or the store cannot see inside

- **What they do.** `finalize` returns a frozen value untouched
  (`finalize.ts:65`); `handleValue` skips it (`:286-294`); `freeze` stops at it
  (`common.ts:268`). But a frozen base can still be drafted, so a write below a
  frozen object in a recipe produces a new result and leaves the base alone.
- **What we do.** `isImmutableValue` (`core.ts:337-342`) treats any frozen
  object as a value and `linkChild` (`core.ts:368`) leaves it unproxied, as
  `CLAUDE.md` says.
- **Difference in behaviour.** Port 2: for `{config: Object.freeze({inner})}`
  with `inner` not frozen, Immer gives a new result for
  `draft.config.inner.n = 2`. Ours lets the write through to the raw `inner`,
  calls no subscriber, and the snapshot taken before the write now reads 2:
  a snapshot, documented as deeply frozen, changed. Immer has the same hole on
  its side: an object below one that was already frozen is not frozen in the
  result (`object below an already frozen one is frozen: false`).
- **Proposal: adapt, as documentation.** Say that "frozen objects are values"
  means the whole value must be frozen, and that a shallowly frozen object's
  mutable contents are shared with every snapshot. A development check that
  deep-scans a frozen object on first sight would cost what `isImmutableValue`
  caches to avoid; not worth it.
- **Kind:** docs.
- **Cost:** `CLAUDE.md` and the API reference. Not breaking. No risk.

### 8. Frozen collections in a result throw a named error

- **What they do.** `freeze` replaces `set`, `add`, `clear` and `delete` on a
  frozen `Map` or `Set` with a function that throws error 2, "This object has
  been frozen and should not be mutated" (`common.ts:269-276`, `:291-297`). The
  types say the same thing: `Immutable` turns `Map` into `ReadonlyMap` and
  `Set` into `ReadonlySet` (`types/types-external.ts:78-81`), so `set` does not
  compile. The override is an own property, so
  `Map.prototype.set.call(result.m, ...)` still writes (port 7).
- **What we do.** A snapshot of a `ReactiveMap` is a frozen instance whose
  inherited `set` fails on a frozen backing array with an engine message. The
  type keeps `set` (stage 1 finding 16).
- **Difference in behaviour.** Port 7: `snapshot.m.set()` throws
  `TypeError: Attempted to assign to readonly property.` on Bun, which does not
  name the store, the collection or the cause. Immer's message names the
  cause. Ours cannot be bypassed: the frozen backing array refuses every
  write.
- **Proposal: adopt the message and the types.** Have the mutators of
  `ReactiveMap` and `ReactiveSet` check whether the instance is a snapshot and
  throw an error that says so; map `ReactiveMap<K, V>` to a read-only interface
  in `Snapshot<T>`. Keep the frozen backing array, which is sounder than
  Immer's override.
- **Kind:** diagnostics, API design.
- **Cost:** `collections.ts`, `types.ts`. Breaking at the type level only for
  code that calls a mutator on a snapshot, which already throws. Low risk.

### 9. Map and Set drafts are subclasses of the native classes

- **What they do.** With the opt-in plugin (`enableMapSet`, global and
  permanent), a `Map` is drafted as a `DraftMap extends Map`
  (`plugins/mapset.ts:35`) and a `Set` as a `DraftSet extends Set` (`:215`),
  each carrying its state in an own field instead of being wrapped in a Proxy.
  The draft passes `instanceof Map`, and the result is a native `Map` or `Set`.
  A map copy is `new Map(base)` (`:208-213`), so a changed map costs one
  native copy. A set has no keys to address its members by, so the first
  read of a draft set's contents drafts every draftable member
  (`prepareSetCopy`, `:334-348`), and `has` answers for both a member and its
  draft (`:242-253`). Without the plugin, a `Map` nested in the base is
  ignored until it is read, and reading it throws error 0, which names the
  missing plugin (port 7, `noplugin`).
- **What we do.** `ReactiveMap` and `ReactiveSet` (`collections.ts:50`, `:205`)
  are classes of their own, backed by an array, marked `PROXYABLE`. A native
  `Map` in a store is opaque.
- **Difference in behaviour.** Port 7. Immer's result map is a native `Map`;
  our snapshot of a `reactiveMap` is not `instanceof Map`. Both keep the
  unchanged values' identity. Changing one value of a 1,000-entry map and
  taking the next result: Immer 21 µs, ours 127 µs (Bun only; our collections
  entry was not bundled for Node). A native `Map` in our store takes a write
  to a value and a `set()` with no notification, and a snapshot taken earlier
  reads both.
- **Proposal: no change for 1.0, input to API question 5.** Immer's subclass
  approach works because a draft lives for one recipe and the result is a
  fresh native copy. A store lives for the application's lifetime, and a
  frozen native `Map` is still writable through `Map.prototype.set`, so our
  snapshots could not be native maps without losing immutability. Making
  `ReactiveMap` extend `Map`, so that `instanceof Map` is true on the store,
  is possible but needs every inherited method overridden. The 6 times speed
  difference comes from our array-backed snapshot visiting every entry
  (finding 1 applies).
- **Kind:** API design, performance.
- **Cost:** none proposed.

### 10. Tuples survive Immer's types

- **What they do.** `Immutable<T>` (`types/types-external.ts:74-86`) has no
  array branch: everything that is not a leaf, `Map` or `Set` goes through one
  homomorphic mapped type (`:85`), which keeps tuples and their element
  positions. `WritableDraft` (`:31-37`) singles out plain arrays only to make
  them mutable. `produce` returns the base type.
- **What we do.** `Snapshot<T>` (`types.ts:38-44`) has an array branch,
  `T extends Array<infer U> ? ReadonlyArray<Snapshot<U>>`, which turns a tuple
  into an array of the union of its element types. Stage 1 finding 14.
- **Difference in behaviour.** Port 8 (type level, passes with TypeScript
  7.0.2). `Immutable<[string, number]>` is `readonly [string, number]`; ours is
  `readonly (string | number)[]`. A copy of our type with the array branch
  removed (`Snapshot2` in the port) gives `readonly [string, number]` for the
  tuple and the same `readonly {readonly id: number}[]` as today for an array.
- **Proposal: adopt.** Remove the array branch; the mapped type handles arrays,
  read-only arrays and tuples.
- **Kind:** API design.
- **Cost:** `types.ts`, one branch. Not breaking for arrays; a tuple's snapshot
  type becomes more precise, which can break code that relied on the union.
  The type tests from stage 1 pin the current type. Low risk.

### 11. A cycle is neither detected nor resolved by Immer

- **What they do.** Nothing detects cycles: error 5, "Immer forbids circular
  references", is still in `utils/errors.ts` but nothing in `src/` raises it.
  A draft assigned into itself is resolved by the finalization callbacks
  (`finalize.ts:217-237`), so the result refers to itself. A base that already
  refers to itself is copied once; the copy's `self` still points to the old
  base.
- **What we do.** `createSnapshotRecursive` throws "circular reference detected
  in snapshot" when it meets a target already in progress (`snapshot.ts:246-250`).
  Stage 1 finding 8: the write that creates the cycle succeeds and notifies.
- **Difference in behaviour.** Port 6. Immer: `next.self === base` after
  `draft.n = 2` on a self-referencing base, so `next.self.n` is the old value,
  silently. Ours: the snapshot throws.
- **Proposal: reject Immer's behaviour.** A silent stale reference is worse
  than our error. If cycles are to be supported, our snapshot could register
  the new snapshot object before visiting its children and return it when the
  cycle comes back, freezing it last; that is reasoning from reading, not
  tried. Otherwise the error should be raised at the write that creates the
  cycle, in development, so it points at the cause.
- **Kind:** bug, diagnostics.
- **Cost:** `snapshot.ts`, and the snapshot cache for a node that is its own
  ancestor. Moderate risk.

## Where ours is better

Each is measured in the ports.

- **Own getters.** Immer's copy reads an own accessor once and stores its value
  (`common.ts:239-245` in strict mode; the default copy is an object spread,
  which does the same, `common.ts:251-253`). In port 4, after `draft.n = 5`,
  the result's `double` is 2, and so is `draft.double` inside the recipe. Our
  snapshot keeps it as a memoized accessor and answers 10.
- **Symbols and non-enumerable properties.** Immer's default copy drops
  non-enumerable properties, and its deep freeze skips them and symbol keys,
  so in port 4 an object under a symbol is mutable after `produce`. Ours keeps
  both and freezes both.
- **The caller's objects.** Immer freezes in place every object it reaches in
  the result, including untouched branches of the base and objects assigned in
  the recipe (port 2: `untouched branch of the base, frozen in place: true`).
  We copy and never freeze the caller's objects.
- **Class instances.** Immer refuses a class instance without `immerable` at
  the root (error 1) and leaves one nested in the base unfrozen and writable,
  so a write in a recipe changes the base (port 3), exactly as our snapshot
  shares an unmarked instance. Our root may be any class instance, which is
  the library's purpose. Immer finds its marker through `value[DRAFTABLE]` or
  `value.constructor[DRAFTABLE]` (`common.ts:51-52`), which reads the instance,
  so an own field named `constructor` can change the answer; `canProxy` reads
  the constructor from the prototype on purpose (`internal.ts:73-78`).
  Neither library supports `#private` fields on a proxied or copied instance.

## Stage 1 findings with a counterpart

| Stage 1 | What Immer does there                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `Object.defineProperty` on a draft throws error 11 (finding 3).                                                                                |
| 2       | Same cost in proportion to the rows while auto-freeze is on; 1.2 µs with it off (finding 1).                                                   |
| 8       | No detection; a self-referencing base yields a result that points to the old base (finding 11).                                                |
| 12      | A draft `Set` answers `has` for both a member and its draft (`mapset.ts:242-253`); the result holds the new copy, not the original.            |
| 14      | `Immutable` keeps tuples (finding 10).                                                                                                         |
| 15      | No counterpart: a draft's state is behind a symbol on a subclass field, not in the public type.                                                |
| 16      | `Immutable` gives `ReadonlyMap` and `ReadonlySet`; frozen collections throw error 2 (finding 8).                                               |
| 25      | No counterpart: there is no long-lived store, each `produce` starts from the base it is given.                                                 |
| 29      | A delete of a missing key leaves the result equal to the base (finding 5).                                                                     |
| 30      | `has` and `ownKeys` read the latest copy, so `Object.keys(draft)` and `in` are right after a delete (port 5).                                  |
| 31      | Prototype getters run with the result or the draft as `this`, so they see its keys (port 5: `[1, 1]`; ours `[2, 2, 0]`).                       |
| 40      | Prototype getters are not memoized: each read runs again on frozen data, so nothing is shared between results.                                 |
| 45, 71  | `defineProperty` refused (finding 3).                                                                                                          |
| 46      | Not possible: the Proxy target is a decoy (finding 2).                                                                                         |
| 47, 48  | `setPrototypeOf` refused, which also blocks `__proto__` through `Object.assign` (finding 3).                                                   |
| 49      | Named array properties refused in development and dropped from copies (finding 4); read-only properties made writable in the copy (finding 2). |
| 50      | The same: `getOwnPropertyDescriptor(draft, key).value` is the base object, and a write through it changes the base (port 5).                   |
| 70      | Results keep the input's key order; prototype getters stay on the prototype and own getters become data in place.                              |

## The API questions

1. Synchronous notification by default: no position (Immer has no
   subscriptions).
2. Writes outside a store method and `batch()`: no position. A recipe is
   Immer's only unit of change, which is the closest it comes to a
   transaction.
3. **Should snapshot getters stay enumerable own accessors?** Immer's results
   have no own accessors: a prototype getter stays on the prototype and runs
   on each read, unmemoized (port 3: own keys of a class result are `["n"]`),
   and an own getter on a plain object is turned into a data property at copy
   time, which makes it stale (port 4). Immer's view is that a result is data
   and computed values live on the class. That favours installing memoized
   getters where the class has them, on a prototype, and keeping only data as
   own enumerable keys, so `Object.keys(snapshot)` and spreading give data.
   One way, from reading only: one derived prototype per class, created once
   and cached, inheriting from the class's prototype, whose accessors look up
   the per-snapshot cache. `instanceof` and `constructor` keep working, and
   the per-snapshot `installMemoizedGetters` walk (`snapshot.ts:196-221`) goes
   away. `Object.getPrototypeOf(snapshot) === Class.prototype` would become
   false.
4. Arrow-function methods and `#private` fields: no position. Port 3 shows
   that `#private` fails on Immer drafts and copies too.
5. **Should native `Map` and `Set` be reactive directly?** Immer drafts native
   `Map` and `Set` directly, by substituting a subclass instance that carries
   its own state, behind an opt-in plugin. That works because the draft is
   thrown away after one recipe and the result is a native copy (finding 9).
   For a store, which keeps its object and must hand out immutable snapshots,
   the result side does not carry over: a frozen native `Map` can still be
   written through `Map.prototype.set`. Immer therefore supports keeping
   `reactiveMap` and `reactiveSet` as the snapshot representation, while
   showing that the live side can be a subclass of the native class.
6. **Opt-in or opt-out for nested class instances?** Opt-in. Immer drafts only
   plain objects, arrays, `Map`, `Set` and classes marked with `immerable`,
   either as a static or as an instance field (`common.ts:46-56`). An unmarked
   instance is a value: Immer neither copies nor freezes it. That is the same
   default as `PROXYABLE`.
7. Entry points and adapter names: no position.
8. **Development diagnostics.** Immer's pattern is a numbered error table that
   exists only in the development build (`utils/errors.ts`, guarded by
   `process.env.NODE_ENV`), with production throwing the bare number and a
   link. Its errors cover the operations it cannot represent: findings 3 and 4
   above, revoked drafts, a recipe that both returns and modifies, and a
   missing plugin that is named in the message.

## Verified by running, and only read

**Verified by running code** (ports below): identity after a one-row write;
all timings; frozen input, nested frozen objects, freezing the raw object, a
read-only property holding an object; what auto-freeze freezes; class instances
with and without the marker, subclasses, `#private`; own getters, symbols,
non-enumerable properties, named array properties, sparse arrays;
`defineProperty`, `setPrototypeOf`, `__proto__` through `Object.assign`; a
delete of a missing key; keys and `in` after a delete; descriptor values;
revoked drafts; cycles; `Map` and `Set` drafts with and without the plugin;
another realm; the tuple types.

**Only read:** that error 5 is never raised (a search of `src/`); the reason
reading one row through a draft costs as much as a write (`proxy.ts:154-159`);
the dirty-key rebuild in finding 1 beyond its measured floor; the derived
prototype in question 3; supporting cycles in our snapshot (finding 11).
`plugins/patches.ts` and the array-methods plugin were not read.

## Appendix: ported tests

Each port is a file in the scratch folder `stage-2-immer/ports/`, with the
shared helpers in `harness.mjs` (`show` prints a value or the error thrown;
`time` returns the best of seven rounds in nanoseconds per call). `.ts` ports
ran with `bun <file>`; `.mjs` ports ran with both `node` and `bun` against a
bundle of our source.

### Shared helpers

`harness.mjs`:

```js
// Shared helpers for the ported tests.
export function section(title) {
  console.log(`\n## ${title}`);
}

/** Print the value of an expression, or the error it throws. */
export function show(label, run) {
  try {
    const value = run();
    console.log(`${label}: ${format(value)}`);
  } catch (error) {
    console.log(
      `${label}: THROWS ${error?.constructor?.name}: ${error?.message}`,
    );
  }
}

function format(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'symbol') return value.toString();
  if (Array.isArray(value)) return `[${value.map(format).join(', ')}]`;
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Best of `rounds`, in nanoseconds per call. */
export function time(run, {rounds = 7, sampleMs = 60} = {}) {
  // Warm up.
  let iterations = 1;
  for (;;) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) run(index);
    const elapsed = performance.now() - start;
    if (elapsed >= sampleMs) break;
    iterations *= 2;
  }
  let best = Number.POSITIVE_INFINITY;
  let counter = iterations;
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) run(counter++);
    const elapsed = performance.now() - start;
    best = Math.min(best, (elapsed * 1e6) / iterations);
  }
  return best;
}

export function ns(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} ms`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)} us`;
  return `${value.toFixed(1)} ns`;
}
```

### Port 1: one of 1,000 rows, identity and time

`p1-rows.mjs`:

```js
// Port 1: change one of N rows, time the next result, and see which objects
// keep their identity. Runs on Bun and on Node.
import {Immer, produce} from 'immer';
import {createClassyStore, snapshot} from './classy.mjs';
import {ns, section, show, time} from './harness.mjs';

const makeRows = (count) =>
  Array.from({length: count}, (_, index) => ({
    id: index,
    value: index,
    done: false,
  }));
const makeState = (count) => ({
  count: 0,
  label: 'a',
  nested: {deep: {value: 0}},
  rows: makeRows(count),
});

section('identity after one row is written (1,000 rows)');
{
  const base = makeState(1000);
  const next = produce(base, (draft) => {
    draft.rows[500].value = -1;
  });
  let kept = 0;
  for (let index = 0; index < 1000; index++) {
    if (next.rows[index] === base.rows[index]) kept++;
  }
  show('immer: root is new', () => next !== base);
  show('immer: rows array is new', () => next.rows !== base.rows);
  show('immer: rows that kept identity', () => kept);
  show('immer: nested kept identity', () => next.nested === base.nested);
  show('immer: base row untouched', () => base.rows[500].value);
  show(
    'immer: no write gives the base back',
    () => produce(next, () => {}) === next,
  );
  show(
    'immer: writing the value a field holds gives the base back',
    () =>
      produce(next, (draft) => {
        draft.count = 0;
      }) === next,
  );
  show(
    'immer: a read of one row gives the base back',
    () =>
      produce(next, (draft) => {
        void draft.rows[3].value;
      }) === next,
  );
  show(
    'immer: write then write back gives the base back',
    () =>
      produce(next, (draft) => {
        draft.count = 1;
        draft.count = 0;
      }) === next,
  );

  const store = createClassyStore(makeState(1000));
  const before = snapshot(store);
  store.rows[500].value = -1;
  const after = snapshot(store);
  kept = 0;
  for (let index = 0; index < 1000; index++) {
    if (after.rows[index] === before.rows[index]) kept++;
  }
  show('ours: root is new', () => after !== before);
  show('ours: rows array is new', () => after.rows !== before.rows);
  show('ours: rows that kept identity', () => kept);
  show('ours: nested kept identity', () => after.nested === before.nested);
  show('ours: write then write back gives the same snapshot', () => {
    const one = snapshot(store);
    store.count = 1;
    store.count = 0;
    return snapshot(store) === one;
  });
}

section('time to write one row and get the next immutable result');
// Every timed write is a real change: `tick` is a value no row has held.
let tick = 0;
const frozen = new Immer({autoFreeze: true});
const unfrozen = new Immer({autoFreeze: false});
for (const count of [100, 1000, 10000]) {
  const report = (label, value) =>
    console.log(
      `${count} rows | ${label}: ${ns(value)} (${(value / count).toFixed(1)} ns/row)`,
    );

  let state = frozen.produce(makeState(count), () => {});
  report(
    'immer, auto-freeze',
    time((index) => {
      state = frozen.produce(state, (draft) => {
        draft.rows[index % count].value = --tick;
      });
    }),
  );

  let loose = makeState(count);
  report(
    'immer, no freeze',
    time((index) => {
      loose = unfrozen.produce(loose, (draft) => {
        draft.rows[index % count].value = --tick;
      });
    }),
  );

  // The floor: copy by hand what has to change, freeze the three new objects.
  let manual = makeState(count);
  report(
    'by hand, frozen',
    time((index) => {
      const rows = manual.rows.slice();
      const at = index % count;
      rows[at] = Object.freeze({...rows[at], value: --tick});
      manual = Object.freeze({...manual, rows: Object.freeze(rows)});
    }),
  );

  let bare = makeState(count);
  report(
    'by hand, not frozen',
    time((index) => {
      const rows = bare.rows.slice();
      const at = index % count;
      rows[at] = {...rows[at], value: --tick};
      bare = {...bare, rows};
    }),
  );

  const store = createClassyStore(makeState(count));
  snapshot(store);
  let sum = 0;
  report(
    'ours',
    time((index) => {
      store.rows[index % count].value = --tick;
      sum += snapshot(store).rows.length;
    }),
  );
  if (sum < 0) console.log(sum);
}

section('time for a result nothing changed in (1,000 rows)');
{
  const state = frozen.produce(makeState(1000), () => {});
  const store = createClassyStore(makeState(1000));
  snapshot(store);
  let sum = 0;
  console.log(
    `immer, empty recipe: ${ns(
      time(() => {
        sum += frozen.produce(state, () => {}).rows.length;
      }),
    )}`,
  );
  console.log(
    `immer, recipe reads one row: ${ns(
      time((index) => {
        sum += frozen.produce(state, (draft) => {
          void draft.rows[index % 1000].value;
        }).rows.length;
      }),
    )}`,
  );
  console.log(
    `ours, cached snapshot: ${ns(
      time(() => {
        sum += snapshot(store).rows.length;
      }),
    )}`,
  );
  if (sum < 0) console.log(sum);
}
```

Output (Node 24):

```text

## identity after one row is written (1,000 rows)
immer: root is new: true
immer: rows array is new: true
immer: rows that kept identity: 999
immer: nested kept identity: true
immer: base row untouched: 500
immer: no write gives the base back: true
immer: writing the value a field holds gives the base back: true
immer: a read of one row gives the base back: true
immer: write then write back gives the base back: false
ours: root is new: true
ours: rows array is new: true
ours: rows that kept identity: 999
ours: nested kept identity: true
ours: write then write back gives the same snapshot: false

## time to write one row and get the next immutable result
100 rows | immer, auto-freeze: 7.79 us (77.9 ns/row)
100 rows | immer, no freeze: 1.00 us (10.0 ns/row)
100 rows | by hand, frozen: 2.74 us (27.4 ns/row)
100 rows | by hand, not frozen: 48.9 ns (0.5 ns/row)
100 rows | ours: 7.83 us (78.3 ns/row)
1000 rows | immer, auto-freeze: 66.30 us (66.3 ns/row)
1000 rows | immer, no freeze: 1.22 us (1.2 ns/row)
1000 rows | by hand, frozen: 25.65 us (25.7 ns/row)
1000 rows | by hand, not frozen: 253.8 ns (0.3 ns/row)
1000 rows | ours: 55.74 us (55.7 ns/row)
10000 rows | immer, auto-freeze: 631.37 us (63.1 ns/row)
10000 rows | immer, no freeze: 3.84 us (0.4 ns/row)
10000 rows | by hand, frozen: 250.28 us (25.0 ns/row)
10000 rows | by hand, not frozen: 2.83 us (0.3 ns/row)
10000 rows | ours: 529.15 us (52.9 ns/row)

## time for a result nothing changed in (1,000 rows)
immer, empty recipe: 222.9 ns
immer, recipe reads one row: 26.20 us
ours, cached snapshot: 39.3 ns
```

Output (Bun 1.4.4):

```text

## identity after one row is written (1,000 rows)
immer: root is new: true
immer: rows array is new: true
immer: rows that kept identity: 999
immer: nested kept identity: true
immer: base row untouched: 500
immer: no write gives the base back: true
immer: writing the value a field holds gives the base back: true
immer: a read of one row gives the base back: true
immer: write then write back gives the base back: false
ours: root is new: true
ours: rows array is new: true
ours: rows that kept identity: 999
ours: nested kept identity: true
ours: write then write back gives the same snapshot: false

## time to write one row and get the next immutable result
100 rows | immer, auto-freeze: 13.21 us (132.1 ns/row)
100 rows | immer, no freeze: 917.2 ns (9.2 ns/row)
100 rows | by hand, frozen: 8.39 us (83.9 ns/row)
100 rows | by hand, not frozen: 102.7 ns (1.0 ns/row)
100 rows | ours: 12.20 us (122.0 ns/row)
1000 rows | immer, auto-freeze: 138.48 us (138.5 ns/row)
1000 rows | immer, no freeze: 1.60 us (1.6 ns/row)
1000 rows | by hand, frozen: 97.64 us (97.6 ns/row)
1000 rows | by hand, not frozen: 869.2 ns (0.9 ns/row)
1000 rows | ours: 118.54 us (118.5 ns/row)
10000 rows | immer, auto-freeze: 2.30 ms (230.3 ns/row)
10000 rows | immer, no freeze: 6.41 us (0.6 ns/row)
10000 rows | by hand, frozen: 1.96 ms (196.4 ns/row)
10000 rows | by hand, not frozen: 5.99 us (0.6 ns/row)
10000 rows | ours: 2.34 ms (234.1 ns/row)

## time for a result nothing changed in (1,000 rows)
immer, empty recipe: 247.8 ns
immer, recipe reads one row: 16.72 us
ours, cached snapshot: 22.0 ns
```

### Port 1b: what freezing an array costs on each engine

`p1b-freeze-cost.mjs`:

```js
// What freezing an array costs on each engine, and what it does to later
// reads and copies. One call per size; no long loops, so a slow case shows.
const sizes = [100, 1000, 10000, 100000];

function once(run) {
  const start = performance.now();
  const result = run();
  return [(performance.now() - start) * 1e6, result];
}

function median(run, repeats = 15) {
  const all = [];
  for (let index = 0; index < repeats; index++) all.push(once(run)[0]);
  all.sort((a, b) => a - b);
  return all[repeats >> 1];
}

for (const size of sizes) {
  const rows = Array.from({length: size}, (_, index) => ({id: index}));
  const copy = median(() => rows.slice());
  const freeze = median(() => Object.freeze(rows.slice()));
  const frozen = Object.freeze(rows.slice());
  const isFrozen = median(() => Object.isFrozen(frozen));
  const sliceFrozen = median(() => frozen.slice());
  const readPlain = median(() => {
    let sum = 0;
    for (let index = 0; index < size; index++) sum += rows[index].id;
    return sum;
  });
  const readFrozen = median(() => {
    let sum = 0;
    for (let index = 0; index < size; index++) sum += frozen[index].id;
    return sum;
  });
  const forEachFrozen = median(() => {
    let sum = 0;
    frozen.forEach((row) => {
      sum += row.id;
    });
    return sum;
  });
  const per = (value) => `${(value / size).toFixed(1)} ns/el`;
  console.log(
    `${size}: slice ${per(copy)} | slice+freeze ${per(freeze)} | isFrozen(frozen) ${per(isFrozen)}` +
      ` | slice of frozen ${per(sliceFrozen)} | indexed read plain ${per(readPlain)} | indexed read frozen ${per(readFrozen)}` +
      ` | forEach frozen ${per(forEachFrozen)}`,
  );
}
```

Output (Node 24):

```text
100: slice 3.8 ns/el | slice+freeze 3.3 ns/el | isFrozen(frozen) 2.5 ns/el | slice of frozen 29.6 ns/el | indexed read plain 22.5 ns/el | indexed read frozen 22.1 ns/el | forEach frozen 60.8 ns/el
1000: slice 0.8 ns/el | slice+freeze 1.1 ns/el | isFrozen(frozen) 0.2 ns/el | slice of frozen 27.7 ns/el | indexed read plain 14.0 ns/el | indexed read frozen 5.3 ns/el | forEach frozen 25.9 ns/el
10000: slice 0.2 ns/el | slice+freeze 0.3 ns/el | isFrozen(frozen) 0.0 ns/el | slice of frozen 25.7 ns/el | indexed read plain 1.2 ns/el | indexed read frozen 4.8 ns/el | forEach frozen 25.5 ns/el
100000: slice 0.7 ns/el | slice+freeze 0.6 ns/el | isFrozen(frozen) 0.0 ns/el | slice of frozen 26.3 ns/el | indexed read plain 1.0 ns/el | indexed read frozen 4.7 ns/el | forEach frozen 27.0 ns/el
```

Output (Bun 1.4.4):

```text
100: slice 1.2 ns/el | slice+freeze 84.6 ns/el | isFrozen(frozen) 41.7 ns/el | slice of frozen 14.6 ns/el | indexed read plain 54.6 ns/el | indexed read frozen 65.4 ns/el | forEach frozen 85.0 ns/el
1000: slice 0.3 ns/el | slice+freeze 98.0 ns/el | isFrozen(frozen) 48.3 ns/el | slice of frozen 16.4 ns/el | indexed read plain 7.2 ns/el | indexed read frozen 14.0 ns/el | forEach frozen 23.0 ns/el
10000: slice 0.7 ns/el | slice+freeze 183.6 ns/el | isFrozen(frozen) 130.0 ns/el | slice of frozen 15.2 ns/el | indexed read plain 2.3 ns/el | indexed read frozen 13.2 ns/el | forEach frozen 21.3 ns/el
100000: slice 5.8 ns/el | slice+freeze 223.8 ns/el | isFrozen(frozen) 152.3 ns/el | slice of frozen 16.7 ns/el | indexed read plain 1.3 ns/el | indexed read frozen 16.6 ns/el | forEach frozen 23.8 ns/el
```

### Port 1d: the floor for a rebuild that recomputes only changed indices

`p1d-dirty-copy.mjs`:

```js
// The floor for a "dirty keys" snapshot of an array: copy the previous frozen
// snapshot array by index, replace the one changed element, freeze the copy.
// Compared with what ours does today on the same array.
import {createClassyStore, snapshot} from './classy.mjs';
import {ns, time} from './harness.mjs';

for (const count of [1000, 10000]) {
  const rows = Array.from({length: count}, (_, index) =>
    Object.freeze({id: index, value: index}),
  );
  let prev = Object.freeze(rows.slice());
  let tick = 0;
  const copyLoop = time((index) => {
    const next = new Array(count);
    for (let i = 0; i < count; i++) next[i] = prev[i];
    const at = index % count;
    next[at] = Object.freeze({...prev[at], value: --tick});
    prev = Object.freeze(next);
  });
  let prev2 = Object.freeze(rows.slice());
  const copyNoFreeze = time((index) => {
    const next = new Array(count);
    for (let i = 0; i < count; i++) next[i] = prev2[i];
    const at = index % count;
    next[at] = Object.freeze({...prev2[at], value: --tick});
    prev2 = next;
  });
  const store = createClassyStore({
    rows: Array.from({length: count}, (_, index) => ({
      id: index,
      value: index,
    })),
  });
  snapshot(store);
  let sum = 0;
  const ours = time((index) => {
    store.rows[index % count].value = --tick;
    sum += snapshot(store).rows.length;
  });
  const per = (v) => `${ns(v)} (${(v / count).toFixed(1)} ns/row)`;
  console.log(
    `${count} rows | copy by index + freeze: ${per(copyLoop)} | copy by index, array not frozen: ${per(copyNoFreeze)} | ours: ${per(ours)}`,
  );
  if (sum < 0) console.log(sum);
}
```

Output (Node 24):

```text
1000 rows | copy by index + freeze: 5.98 us (6.0 ns/row) | copy by index, array not frozen: 6.25 us (6.3 ns/row) | ours: 56.40 us (56.4 ns/row)
10000 rows | copy by index + freeze: 63.53 us (6.4 ns/row) | copy by index, array not frozen: 63.54 us (6.4 ns/row) | ours: 502.57 us (50.3 ns/row)
```

Output (Bun 1.4.4):

```text
1000 rows | copy by index + freeze: 95.33 us (95.3 ns/row) | copy by index, array not frozen: 2.14 us (2.1 ns/row) | ours: 123.02 us (123.0 ns/row)
10000 rows | copy by index + freeze: 1.92 ms (192.3 ns/row) | copy by index, array not frozen: 19.62 us (2.0 ns/row) | ours: 2.15 ms (214.9 ns/row)
```

### Port 2: frozen and read-only input

`p2-frozen.ts`:

```ts
// Port 2: frozen input, frozen objects nested in input, a read-only property
// that holds an object, and what auto-freeze does to objects Immer did not make.
import {produce} from 'immer';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {section, show} from './harness.mjs';

section('a frozen object as the input');
{
  const base = Object.freeze({
    a: Object.freeze({b: 1}),
    keep: Object.freeze({n: 1}),
  });
  const next = produce(base, (draft) => {
    draft.a.b = 2;
  });
  show('immer: write through a draft of a frozen base', () => next.a.b);
  show('immer: base untouched', () => base.a.b);
  show('immer: untouched branch kept', () => next.keep === base.keep);
  show(
    'immer: result frozen',
    () => Object.isFrozen(next) && Object.isFrozen(next.a),
  );

  const store = createClassyStore(Object.freeze({a: Object.freeze({b: 1})}));
  show('ours: read through a frozen root', () => store.a.b);
  show('ours: write to a frozen root', () => {
    (store as {a: object}).a = {b: 2};
    return store.a.b;
  });
  show('ours: write inside the frozen child', () => {
    (store.a as {b: number}).b = 2;
    return store.a.b;
  });
}

section(
  'a frozen object nested in the input, with an unfrozen object inside it',
);
{
  const inner = {n: 1};
  const base = {config: Object.freeze({inner}), other: 1};
  const next = produce(base, (draft) => {
    draft.config.inner.n = 2;
  });
  show('immer: write below the frozen object', () => next.config.inner.n);
  show('immer: the original inner object', () => inner.n);
  show('immer: config was copied', () => next.config !== base.config);

  const inner2 = {n: 1};
  const store = createClassyStore({
    config: Object.freeze({inner: inner2}),
    other: 1,
  });
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  show('ours: write below the frozen object', () => {
    store.config.inner.n = 2;
    return store.config.inner.n;
  });
  show('ours: subscriber calls', () => calls);
  show(
    'ours: the snapshot taken before the write now reads',
    () => before.config.inner.n,
  );
  show(
    'ours: snapshot after is the same object',
    () => snapshot(store) === before,
  );
}

section('the raw object is frozen after the store has it (finding 46)');
{
  const raw = {config: {nested: {n: 1}}};
  const next = produce(raw, (draft) => {
    Object.freeze(raw.config);
    draft.config.nested.n = 2;
  });
  show(
    'immer: base frozen during the recipe, then written through the draft',
    () => next.config.nested.n,
  );

  const raw2 = {config: {nested: {n: 1}}};
  const store = createClassyStore(raw2);
  void store.config.nested;
  Object.freeze(raw2.config);
  show(
    'ours: read after the raw object was frozen',
    () => store.config.nested.n,
  );
}

section('a non-writable, non-configurable property that holds an object');
{
  const make = () => {
    const base: {locked: {n: number}; a: number} = {a: 1} as never;
    Object.defineProperty(base, 'locked', {
      value: {n: 1},
      writable: false,
      configurable: false,
      enumerable: true,
    });
    return base;
  };
  const base = make();
  const next = produce(base, (draft) => {
    draft.locked.n = 2;
  });
  show('immer: write inside it', () => next.locked.n);
  show('immer: base untouched', () => base.locked.n);
  const replaced = produce(base, (draft) => {
    draft.locked = {n: 3};
  });
  show(
    'immer: replace the read-only property through the draft',
    () => replaced.locked.n,
  );
  show('immer: descriptor seen through a draft', () => {
    let seen: PropertyDescriptor | undefined;
    produce(base, (draft) => {
      seen = Object.getOwnPropertyDescriptor(draft, 'locked');
    });
    return {writable: seen?.writable, configurable: seen?.configurable};
  });

  const store = createClassyStore(make());
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  show('ours: write inside it', () => {
    store.locked.n = 2;
    return store.locked.n;
  });
  show('ours: subscriber calls', () => calls);
  show(
    'ours: the snapshot taken before the write now reads',
    () => before.locked.n,
  );
  show(
    'ours: snapshot shares the object with the store',
    () => before.locked === store.locked,
  );
  show('ours: is that object frozen in the snapshot', () =>
    Object.isFrozen(before.locked),
  );
}

section('what auto-freeze does to objects Immer did not create');
{
  const shared = {d: 1};
  const base = {a: {b: 1}, shared};
  const added = {x: {y: 1}};
  const next = produce(base, (draft) => {
    draft.a.b = 2;
    (draft as {added?: object}).added = added;
  });
  show('immer: base root frozen', () => Object.isFrozen(base));
  show('immer: untouched branch of the base, frozen in place', () =>
    Object.isFrozen(shared),
  );
  show(
    'immer: object assigned in the recipe, frozen in place',
    () => Object.isFrozen(added) && Object.isFrozen(added.x),
  );
  show(
    'immer: result holds the assigned object itself',
    () => (next as {added?: object}).added === added,
  );

  const halfFrozen = {keep: Object.freeze({inner: {n: 1}}), a: 1};
  const next2 = produce(halfFrozen, (draft) => {
    draft.a = 2;
  });
  show('immer: object below an already frozen one is frozen', () =>
    Object.isFrozen(next2.keep.inner),
  );

  const shared2 = {d: 1};
  const added2 = {x: {y: 1}};
  const store = createClassyStore({a: {b: 1}, shared: shared2} as {
    a: {b: number};
    shared: object;
    added?: object;
  });
  store.added = added2;
  const snap = snapshot(store);
  show(
    'ours: raw objects frozen after a snapshot',
    () => Object.isFrozen(shared2) || Object.isFrozen(added2),
  );
  show(
    'ours: snapshot holds the assigned object itself',
    () => snap.added === added2,
  );
  show(
    'ours: snapshot copy is deeply frozen',
    () =>
      Object.isFrozen(snap.added) &&
      Object.isFrozen((snap.added as typeof added2).x),
  );
}

section('Object.freeze on a draft, and on a store');
{
  show('immer: Object.freeze(draft)', () =>
    produce({a: 1, child: {n: 1}}, (draft) => {
      Object.freeze(draft);
    }),
  );
  const store = createClassyStore({a: 1, child: {n: 1}});
  show('ours: Object.freeze(store)', () => {
    Object.freeze(store);
    return Object.isFrozen(store);
  });
  show('ours: write after the freeze', () => {
    store.a = 2;
    return store.a;
  });
}
```

Output (Bun 1.4.4):

```text

## a frozen object as the input
immer: write through a draft of a frozen base: 2
immer: base untouched: 1
immer: untouched branch kept: true
immer: result frozen: true
ours: read through a frozen root: 1
ours: write to a frozen root: THROWS TypeError: Proxy object's 'set' trap returned falsy value for property 'a'
ours: write inside the frozen child: THROWS TypeError: Attempted to assign to readonly property.

## a frozen object nested in the input, with an unfrozen object inside it
immer: write below the frozen object: 2
immer: the original inner object: 1
immer: config was copied: true
ours: write below the frozen object: 2
ours: subscriber calls: 0
ours: the snapshot taken before the write now reads: 2
ours: snapshot after is the same object: true

## the raw object is frozen after the store has it (finding 46)
immer: base frozen during the recipe, then written through the draft: 2
ours: read after the raw object was frozen: THROWS TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property

## a non-writable, non-configurable property that holds an object
immer: write inside it: 2
immer: base untouched: 1
immer: replace the read-only property through the draft: 3
immer: descriptor seen through a draft: {"writable":true,"configurable":true}
ours: write inside it: 2
ours: subscriber calls: 0
ours: the snapshot taken before the write now reads: 2
ours: snapshot shares the object with the store: true
ours: is that object frozen in the snapshot: false

## what auto-freeze does to objects Immer did not create
immer: base root frozen: false
immer: untouched branch of the base, frozen in place: true
immer: object assigned in the recipe, frozen in place: true
immer: result holds the assigned object itself: true
immer: object below an already frozen one is frozen: false
ours: raw objects frozen after a snapshot: false
ours: snapshot holds the assigned object itself: false
ours: snapshot copy is deeply frozen: true

## Object.freeze on a draft, and on a store
immer: Object.freeze(draft): THROWS TypeError: Proxy object's non-extensible 'target' has configurable property 'parent_' that was not in the result from the 'ownKeys' trap
ours: Object.freeze(store): true
ours: write after the freeze: THROWS TypeError: Proxy object's 'set' trap returned falsy value for property 'a'
```

### Port 3: class instances

`p3-class.ts`:

```ts
// Port 3: class instances with and without the marker, getters, #private.
import {immerable, produce} from 'immer';
import {
  createClassyStore,
  PROXYABLE,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {section, show} from './harness.mjs';

class Unmarked {
  n = 1;
  get double() {
    return this.n * 2;
  }
  inc() {
    this.n++;
  }
}

class Marked {
  static [immerable] = true;
  static [PROXYABLE] = true;
  n = 1;
  get double() {
    return this.n * 2;
  }
  inc() {
    this.n++;
  }
}

class MarkedChild extends Marked {
  extra = 'x';
}

class InstanceMarked {
  [immerable] = true;
  n = 1;
}

class Private {
  static [immerable] = true;
  static [PROXYABLE] = true;
  #secret = 1;
  n = 1;
  read() {
    return this.#secret;
  }
}

section('a class instance without the marker');
{
  show('immer: as the root', () =>
    produce(new Unmarked(), (draft) => void draft.inc()),
  );
  const point = new Unmarked();
  const base = {point, a: 1};
  const next = produce(base, (draft) => {
    draft.point.n = 5;
  });
  show(
    'immer: nested, written in a recipe; the base instance now reads',
    () => point.n,
  );
  show('immer: result is the base', () => next === base);
  show('immer: instance frozen', () => Object.isFrozen(next.point));
  const next2 = produce(base, (draft) => {
    draft.a = 2;
  });
  show('immer: instance frozen after another field changed', () =>
    Object.isFrozen(next2.point),
  );

  const point2 = new Unmarked();
  const store = createClassyStore({point: point2, a: 1});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  store.point.n = 5;
  show('ours: nested, written; subscriber calls', () => calls);
  show('ours: the snapshot taken before now reads', () => before.point.n);
  show('ours: as the root', () => {
    const root = createClassyStore(new Unmarked());
    root.inc();
    return [root.n, snapshot(root).double];
  });
}

section('a class instance with the marker');
{
  const base = new Marked();
  const next = produce(base, (draft) => {
    draft.inc();
  });
  show('immer: method on the draft', () => [base.n, next.n]);
  show(
    'immer: result is an instance of the class',
    () => next instanceof Marked,
  );
  show('immer: prototype getter on the result', () => next.double);
  show('immer: own keys of the result', () => Reflect.ownKeys(next));
  show('immer: result frozen', () => Object.isFrozen(next));
  show('immer: getter read inside the recipe after a write', () => {
    let seen = 0;
    produce(base, (draft) => {
      draft.n = 10;
      seen = draft.double;
    });
    return seen;
  });
  show(
    'immer: subclass of a marked class',
    () =>
      produce(new MarkedChild(), (draft) => {
        draft.inc();
      }).n,
  );
  show(
    'immer: marker as an instance field',
    () =>
      produce(new InstanceMarked(), (draft) => {
        draft.n = 2;
      }).n,
  );

  const store = createClassyStore({item: new Marked()});
  store.item.inc();
  const snap = snapshot(store);
  show('ours: nested marked instance', () => [snap.item.n, snap.item.double]);
  show(
    'ours: snapshot is an instance of the class',
    () => snap.item instanceof Marked,
  );
  show('ours: own keys of the snapshot', () => Reflect.ownKeys(snap.item));
  show('ours: Object.keys of the snapshot', () => Object.keys(snap.item));
}

section('#private fields');
{
  show('immer: method that reads #private, on a draft', () => {
    let seen: unknown;
    produce(new Private(), (draft) => {
      seen = draft.read();
    });
    return seen;
  });
  show('immer: the same on a result that was copied', () =>
    produce(new Private(), (draft) => {
      draft.n = 2;
    }).read(),
  );
  show('ours: on the store', () => createClassyStore(new Private()).read());
  show('ours: on the snapshot', () =>
    snapshot(createClassyStore(new Private())).read(),
  );
}
```

Output (Bun 1.4.4):

```text

## a class instance without the marker
immer: as the root: THROWS Error: [Immer] produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '[object Object]'
immer: nested, written in a recipe; the base instance now reads: 5
immer: result is the base: true
immer: instance frozen: false
immer: instance frozen after another field changed: false
ours: nested, written; subscriber calls: 0
ours: the snapshot taken before now reads: 5
ours: as the root: [2, 4]

## a class instance with the marker
immer: method on the draft: [1, 2]
immer: result is an instance of the class: true
immer: prototype getter on the result: 4
immer: own keys of the result: ["n"]
immer: result frozen: true
immer: getter read inside the recipe after a write: 20
immer: subclass of a marked class: 2
immer: marker as an instance field: 2
ours: nested marked instance: [2, 4]
ours: snapshot is an instance of the class: true
ours: own keys of the snapshot: ["n", "double"]
ours: Object.keys of the snapshot: ["n", "double"]

## #private fields
immer: method that reads #private, on a draft: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
immer: the same on a result that was copied: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
ours: on the store: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
ours: on the snapshot: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
```

### Port 4: getters, symbols, non-enumerable and array properties, sparse arrays

`p4-shapes.ts`:

```ts
// Port 4: an own getter on the input, a symbol-keyed property, a
// non-enumerable property, a named property on an array, a sparse array.
import {Immer, produce} from 'immer';
import {
  createClassyStore,
  snapshot,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {section, show} from './harness.mjs';

const strict = new Immer({useStrictShallowCopy: true});

section('an own getter on the input');
{
  const make = () => ({
    n: 1,
    get double() {
      return this.n * 2;
    },
  });
  const next = produce(make(), (draft) => {
    draft.n = 5;
  });
  show('immer: the getter on the result', () => next.double);
  show(
    'immer: is it still an accessor',
    () => 'get' in (Object.getOwnPropertyDescriptor(next, 'double') ?? {}),
  );
  show('immer: read in the recipe after the write', () => {
    let seen = 0;
    produce(make(), (draft) => {
      draft.n = 5;
      seen = draft.double;
    });
    return seen;
  });
  show(
    'immer, strict copy: the getter on the result',
    () =>
      strict.produce(make(), (draft) => {
        draft.n = 5;
      }).double,
  );

  const store = createClassyStore(make());
  store.n = 5;
  const snap = snapshot(store);
  show('ours: the getter on the snapshot', () => snap.double);
  show(
    'ours: is it still an accessor',
    () => 'get' in (Object.getOwnPropertyDescriptor(snap, 'double') ?? {}),
  );
}

section('a symbol-keyed property that holds an object');
{
  const key = Symbol('meta');
  const make = () => ({a: 1, [key]: {n: 1}});
  const base = make();
  const next = produce(base, (draft) => {
    draft[key].n = 2;
  });
  show('immer: written through the draft', () => [base[key].n, next[key].n]);
  show('immer: the new object under the symbol is frozen', () =>
    Object.isFrozen(next[key]),
  );
  show('immer: can it be changed after produce', () => {
    next[key].n = 99;
    return next[key].n;
  });

  const store = createClassyStore(make());
  store[key].n = 2;
  const snap = snapshot(store);
  show('ours: written through the store', () => snap[key].n);
  show('ours: the object under the symbol is frozen', () =>
    Object.isFrozen(snap[key]),
  );
}

section('a non-enumerable property');
{
  const make = () => {
    const base = {a: 1} as {a: number; hidden: {n: number}};
    Object.defineProperty(base, 'hidden', {
      value: {n: 1},
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return base;
  };
  const next = produce(make(), (draft) => {
    draft.a = 2;
  });
  show(
    'immer: present on the result after another field changed',
    () => 'hidden' in next,
  );
  const strictNext = strict.produce(make(), (draft) => {
    draft.a = 2;
  });
  show('immer, strict copy: present, and enumerable', () => [
    'hidden' in strictNext,
    Object.getOwnPropertyDescriptor(strictNext, 'hidden')?.enumerable,
  ]);
  show('immer, strict copy: is it frozen', () =>
    Object.isFrozen(strictNext.hidden),
  );

  const store = createClassyStore(make());
  store.a = 2;
  const snap = snapshot(store);
  show('ours: present, and enumerable', () => [
    'hidden' in snap,
    Object.getOwnPropertyDescriptor(snap, 'hidden')?.enumerable,
  ]);
  show('ours: is it frozen', () => Object.isFrozen(snap.hidden));
}

section('a named property and a symbol on an array');
{
  const tag = Symbol('tag');
  const make = () => {
    const list = [1, 2, 3] as number[] & {label?: string; [tag]?: string};
    list.label = 'x';
    list[tag] = 't';
    return {list};
  };
  const next = produce(make(), (draft) => {
    draft.list.push(4);
  });
  show('immer: named property after a push', () => next.list.label);
  show('immer: symbol property after a push', () => next.list[tag]);
  show(
    'immer: write a named property on a draft array',
    () =>
      produce(make(), (draft) => {
        draft.list.label = 'y';
      }).list.label,
  );
  show(
    'immer: write a symbol property on a draft array',
    () =>
      produce(make(), (draft) => {
        draft.list[tag] = 'u';
      }).list[tag],
  );
  show(
    'immer: delete a named property on a draft array',
    () =>
      produce(make(), (draft) => {
        delete draft.list.label;
      }).list.label,
  );

  const store = createClassyStore(make());
  store.list.label = 'y';
  const snap = snapshot(store);
  show('ours: named property on the store', () => store.list.label);
  show('ours: named property on the snapshot', () => snap.list.label);
  show('ours: symbol property on the snapshot', () => snap.list[tag]);
}

section('a sparse array');
{
  // biome-ignore lint/suspicious/noSparseArray: the hole is the test
  const make = () => ({
    list: [{n: 1}, , {n: 3}] as ({n: number} | undefined)[],
  });
  const next = produce(make(), (draft) => {
    (draft.list[2] as {n: number}).n = 9;
  });
  show('immer: length and the hole', () => [next.list.length, 1 in next.list]);
  const grown = produce(make(), (draft) => {
    draft.list[5] = {n: 6};
  });
  show('immer: write past the end', () => [
    grown.list.length,
    3 in grown.list,
    4 in grown.list,
  ]);
  show('immer: delete an index', () => {
    const removed = produce(make(), (draft) => {
      delete draft.list[0];
    });
    return [removed.list.length, 0 in removed.list, removed.list[0]];
  });

  const store = createClassyStore(make());
  (store.list[2] as {n: number}).n = 9;
  const snap = snapshot(store);
  show('ours: length and the hole', () => [snap.list.length, 1 in snap.list]);
  delete store.list[0];
  show('ours: delete an index', () => {
    const after = snapshot(store);
    return [after.list.length, 0 in after.list, after.list[0]];
  });
}
```

Output (Bun 1.4.4):

```text

## an own getter on the input
immer: the getter on the result: 2
immer: is it still an accessor: false
immer: read in the recipe after the write: 2
immer, strict copy: the getter on the result: 2
ours: the getter on the snapshot: 10
ours: is it still an accessor: true

## a symbol-keyed property that holds an object
immer: written through the draft: [1, 2]
immer: the new object under the symbol is frozen: false
immer: can it be changed after produce: 99
ours: written through the store: 2
ours: the object under the symbol is frozen: true

## a non-enumerable property
immer: present on the result after another field changed: false
immer, strict copy: present, and enumerable: [true, false]
immer, strict copy: is it frozen: false
ours: present, and enumerable: [true, false]
ours: is it frozen: true

## a named property and a symbol on an array
immer: named property after a push: undefined
immer: symbol property after a push: undefined
immer: write a named property on a draft array: THROWS Error: [Immer] Immer only supports setting array indices and the 'length' property
immer: write a symbol property on a draft array: THROWS TypeError: Cannot convert a symbol to a string
immer: delete a named property on a draft array: THROWS Error: [Immer] Immer only supports deleting array indices
ours: named property on the store: "y"
ours: named property on the snapshot: undefined
ours: symbol property on the snapshot: undefined

## a sparse array
immer: length and the hole: [3, false]
immer: write past the end: [6, false, false]
immer: delete an index: [3, true, undefined]
ours: length and the hole: [3, false]
ours: delete an index: [3, false, undefined]
```

### Port 5: operations Immer refuses

`p5-traps.ts`:

```ts
// Port 5: operations the store proxy lets through and an Immer draft refuses
// or answers: defineProperty, setPrototypeOf, __proto__ through Object.assign,
// a delete of a missing key, keys and `in`, descriptors.
import {produce} from 'immer';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {section, show} from './harness.mjs';

section('Object.defineProperty (findings 1, 45, 71)');
{
  show('immer: on a draft', () =>
    produce({a: 1}, (draft) => {
      Object.defineProperty(draft, 'b', {
        value: 2,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }),
  );
  const store = createClassyStore({a: 1} as {a: number; b?: number});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  Object.defineProperty(store, 'b', {
    value: 2,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  show('ours: store reads', () => store.b);
  show('ours: subscriber calls', () => calls);
  show('ours: snapshot has the property', () => 'b' in snapshot(store));
  show(
    'ours: snapshot is the one from before',
    () => snapshot(store) === before,
  );
}

section('the prototype (findings 47, 48)');
{
  show('immer: Object.setPrototypeOf(draft)', () =>
    produce({a: 1}, (draft) => {
      Object.setPrototypeOf(draft, {polluted: true});
    }),
  );
  show('immer: Object.assign(draft, JSON.parse(\'{"__proto__": ...}\'))', () =>
    produce({a: 1}, (draft) => {
      Object.assign(draft, JSON.parse('{"__proto__": {"polluted": true}}'));
    }),
  );
  const store = createClassyStore({a: 1} as {a: number; polluted?: boolean});
  show('ours: Object.assign(store, JSON.parse(\'{"__proto__": ...}\'))', () => {
    Object.assign(store, JSON.parse('{"__proto__": {"polluted": true}}'));
    return [store.polluted, snapshot(store).polluted];
  });
}

section('a delete that removes nothing (finding 29)');
{
  const base = {a: 1} as {a: number; missing?: number};
  show(
    'immer: result is the base',
    () =>
      produce(base, (draft) => {
        delete draft.missing;
      }) === base,
  );
  const store = createClassyStore({a: 1} as {a: number; missing?: number});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  delete store.missing;
  show('ours: subscriber calls', () => calls);
  show(
    'ours: snapshot is the one from before',
    () => snapshot(store) === before,
  );
}

section('keys and `in` after a delete (findings 30, 31)');
{
  show('immer: Object.keys(draft) and "b" in draft after delete', () => {
    let seen: unknown;
    produce({a: 1, b: 2} as {a: number; b?: number}, (draft) => {
      delete draft.b;
      seen = [Object.keys(draft), 'b' in draft];
    });
    return seen;
  });
  show(
    'immer: a prototype getter that reads Object.keys(this), on a draft and on the result',
    () => {
      class Bag {
        static [Symbol.for('immer-draftable')] = true;
        a = 1;
        b?: number = 2;
        get size() {
          return Object.keys(this).length;
        }
      }
      let inRecipe = 0;
      const next = produce(new Bag(), (draft) => {
        delete draft.b;
        inRecipe = draft.size;
      });
      return [inRecipe, next.size];
    },
  );
  class Bag {
    a = 1;
    b?: number = 2;
    get size() {
      return Object.keys(this).length;
    }
  }
  const store = createClassyStore(new Bag());
  const first = store.size;
  delete store.b;
  show(
    'ours: the same getter, live before and after the delete, then on a snapshot',
    () => [first, store.size, snapshot(store).size],
  );
}

section('Object.getOwnPropertyDescriptor(...).value (finding 50)');
{
  const base = {child: {n: 1}};
  let viaDescriptor: unknown;
  produce(base, (draft) => {
    viaDescriptor = Object.getOwnPropertyDescriptor(draft, 'child')?.value;
    (viaDescriptor as {n: number}).n = 9;
  });
  show(
    'immer: the descriptor value is the base object',
    () => viaDescriptor === base.child,
  );
  show('immer: base after a write through it', () => base.child.n);

  const raw = {child: {n: 1}};
  const store = createClassyStore(raw);
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const value = Object.getOwnPropertyDescriptor(store, 'child')?.value as {
    n: number;
  };
  value.n = 9;
  show(
    'ours: the descriptor value is the raw object',
    () => value === raw.child,
  );
  show('ours: subscriber calls after a write through it', () => calls);
}

section('use of a draft after produce returned');
{
  let leaked: {n: number} | undefined;
  produce({child: {n: 1}}, (draft) => {
    leaked = draft.child;
  });
  show('immer: write to a leaked draft', () => {
    (leaked as {n: number}).n = 2;
    return 'no error';
  });
}
```

Output (Bun 1.4.4):

```text

## Object.defineProperty (findings 1, 45, 71)
immer: on a draft: THROWS Error: [Immer] Object.defineProperty() cannot be used on an Immer draft
ours: store reads: 2
ours: subscriber calls: 0
ours: snapshot has the property: false
ours: snapshot is the one from before: true

## the prototype (findings 47, 48)
immer: Object.setPrototypeOf(draft): THROWS Error: [Immer] Object.setPrototypeOf() cannot be used on an Immer draft
immer: Object.assign(draft, JSON.parse('{"__proto__": ...}')): THROWS Error: [Immer] Object.setPrototypeOf() cannot be used on an Immer draft
ours: Object.assign(store, JSON.parse('{"__proto__": ...}')): [true, true]

## a delete that removes nothing (finding 29)
immer: result is the base: true
ours: subscriber calls: 1
ours: snapshot is the one from before: false

## keys and `in` after a delete (findings 30, 31)
immer: Object.keys(draft) and "b" in draft after delete: [["a"], false]
immer: a prototype getter that reads Object.keys(this), on a draft and on the result: [1, 1]
ours: the same getter, live before and after the delete, then on a snapshot: [2, 2, 0]

## Object.getOwnPropertyDescriptor(...).value (finding 50)
immer: the descriptor value is the base object: true
immer: base after a write through it: 9
ours: the descriptor value is the raw object: true
ours: subscriber calls after a write through it: 0

## use of a draft after produce returned
immer: write to a leaked draft: THROWS TypeError: Proxy has already been revoked. No more operations are allowed to be performed on it
```

### Port 6: cycles

`p6-cycle.ts`:

```ts
// Port 6: a self-referencing object. Run with a timeout: a hang is a result.
import {produce} from 'immer';
import {
  createClassyStore,
  snapshot,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {section, show} from './harness.mjs';

type Node = {n: number; self?: Node};

section('a base that refers to itself');
{
  const base: Node = {n: 1};
  base.self = base;
  const next = produce(base, (draft) => {
    draft.n = 2;
  });
  show('immer: result.n', () => next.n);
  show('immer: result.self is the result', () => next.self === next);
  show('immer: result.self is the base', () => next.self === base);
  show('immer: the base is now frozen', () => Object.isFrozen(base));

  const base2: Node = {n: 1};
  base2.self = base2;
  const next2 = produce(base2, (draft) => {
    (draft.self as Node).n = 3;
  });
  show('immer: write through draft.self; result.n and result.self.n', () => [
    next2.n,
    next2.self?.n,
  ]);
  show('immer: result.self is the result', () => next2.self === next2);
}

section('a draft assigned to itself');
{
  const next = produce({n: 1} as Node, (draft) => {
    draft.self = draft;
  });
  show('immer: result.self is the result', () => next.self === next);
  show('immer: result.self is a revoked proxy', () => {
    try {
      void next.self?.n;
      return false;
    } catch {
      return true;
    }
  });
  show('immer: result frozen', () => Object.isFrozen(next));
}

section('the same in a store (finding 8)');
{
  const store = createClassyStore({n: 1} as Node);
  show('ours: store.self = store', () => {
    store.self = store;
    return store.self === store;
  });
  show('ours: snapshot', () => snapshot(store).n);
}
```

Output (Bun 1.4.4):

```text

## a base that refers to itself
immer: result.n: 2
immer: result.self is the result: false
immer: result.self is the base: true
immer: the base is now frozen: true
immer: write through draft.self; result.n and result.self.n: [1, 3]
immer: result.self is the result: false

## a draft assigned to itself
immer: result.self is the result: true
immer: result.self is a revoked proxy: false
immer: result frozen: true

## the same in a store (finding 8)
ours: store.self = store: true
ours: snapshot: THROWS Error: @codebelt/classy-store: circular reference detected in snapshot
```

### Port 7: Map and Set

`p7-mapset.ts`:

```ts
// Port 7: a Map and a Set with object members. Pass "noplugin" to run the
// first section without enableMapSet(), which is global and cannot be undone.
import {enableMapSet, produce} from 'immer';
import {
  reactiveMap,
  reactiveSet,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/collections/index.ts';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {ns, section, show, time} from './harness.mjs';

if (process.argv[2] === 'noplugin') {
  section('a Map without enableMapSet()');
  show('immer: Map as the root', () => produce(new Map([['a', 1]]), () => {}));
  show(
    'immer: Map nested, never read',
    () =>
      produce({m: new Map([['a', {n: 1}]]), x: 1}, (draft) => {
        draft.x = 2;
      }).x,
  );
  show('immer: Map nested, read in the recipe', () =>
    produce({m: new Map([['a', {n: 1}]]), x: 1}, (draft) => {
      void draft.m;
    }),
  );
  process.exit(0);
}

enableMapSet();

section('a Map with object values');
{
  const key = {id: 'k'};
  const base = {
    m: new Map<unknown, {n: number}>([
      ['a', {n: 1}],
      ['b', {n: 2}],
      [key, {n: 3}],
    ]),
  };
  const next = produce(base, (draft) => {
    (draft.m.get('a') as {n: number}).n = 5;
  });
  show('immer: result is a native Map', () => [
    next.m instanceof Map,
    Object.getPrototypeOf(next.m) === Map.prototype,
  ]);
  show('immer: map is new, changed value is new, other value kept', () => [
    next.m !== base.m,
    next.m.get('a') !== base.m.get('a'),
    next.m.get('b') === base.m.get('b'),
  ]);
  show('immer: base value untouched', () => base.m.get('a')?.n);
  show('immer: object key still finds its value', () => next.m.get(key)?.n);
  show('immer: result.m.set()', () => next.m.set('c', {n: 9}));
  show('immer: result.m.delete()', () => next.m.delete('a'));
  show('immer: Map.prototype.set.call(result.m)', () => {
    Map.prototype.set.call(next.m, 'c', {n: 9});
    return next.m.has('c');
  });
  show('immer: values are frozen', () => Object.isFrozen(next.m.get('b')));
  show('immer: draft is an instance of Map', () => {
    let seen = false;
    produce(base, (draft) => {
      seen = draft.m instanceof Map;
    });
    return seen;
  });

  const store = createClassyStore({m: new Map([['a', {n: 1}]])});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  (store.m.get('a') as {n: number}).n = 5;
  store.m.set('z', {n: 0});
  show(
    'ours, native Map: subscriber calls after a value write and a set()',
    () => calls,
  );
  show('ours, native Map: the snapshot taken before now reads', () => [
    before.m.get('a')?.n,
    before.m.has('z'),
  ]);

  const reactive = createClassyStore({
    m: reactiveMap<string, {n: number}>([
      ['a', {n: 1}],
      ['b', {n: 2}],
    ]),
  });
  let reactiveCalls = 0;
  subscribe(reactive, () => reactiveCalls++, {sync: true});
  const reactiveBefore = snapshot(reactive);
  (reactive.m.get('a') as {n: number}).n = 5;
  const reactiveAfter = snapshot(reactive);
  show('ours, reactiveMap: subscriber calls', () => reactiveCalls);
  show('ours, reactiveMap: before and after', () => [
    reactiveBefore.m.get('a')?.n,
    reactiveAfter.m.get('a')?.n,
  ]);
  show(
    'ours, reactiveMap: other value kept',
    () => reactiveAfter.m.get('b') === reactiveBefore.m.get('b'),
  );
  show(
    'ours, reactiveMap: snapshot is an instance of Map',
    () => reactiveAfter.m instanceof Map,
  );
  show('ours, reactiveMap: snapshot.m.set()', () =>
    (reactiveAfter.m as unknown as Map<string, object>).set('c', {}),
  );
}

section('a Set with object members');
{
  const row = {n: 1};
  const other = {n: 2};
  const base = {s: new Set([row, other])};
  let hasOriginal = false;
  let hasDraft = false;
  const next = produce(base, (draft) => {
    hasOriginal = draft.s.has(row);
    for (const member of draft.s) {
      if (member.n === 1) {
        member.n = 10;
        hasDraft = draft.s.has(member);
      }
    }
  });
  show('immer: draft.has(original) and draft.has(its draft)', () => [
    hasOriginal,
    hasDraft,
  ]);
  show('immer: result is a native Set', () => next.s instanceof Set);
  show('immer: members in order', () => [...next.s].map((member) => member.n));
  show(
    'immer: result has the original changed member, the unchanged one',
    () => [next.s.has(row), next.s.has(other)],
  );
  show('immer: result.s.add()', () => next.s.add({n: 3}));

  const store = createClassyStore({s: reactiveSet([{n: 1}, {n: 2}])});
  const before = snapshot(store);
  for (const member of store.s) if (member.n === 1) member.n = 10;
  const after = snapshot(store);
  show('ours, reactiveSet: members before and after', () => [
    [...before.s].map((member) => member.n),
    [...after.s].map((member) => member.n),
  ]);
  show(
    'ours, reactiveSet: unchanged member kept',
    () => [...after.s][1] === [...before.s][1],
  );
  show('ours, reactiveSet: snapshot.has(a row read from the store)', () =>
    after.s.has([...store.s][0]),
  );
}

section(
  'time to change one value of a 1,000-entry map, then take the next result',
);
{
  const entries = () =>
    Array.from(
      {length: 1000},
      (_, index) => [`k${index}`, {value: index}] as [string, {value: number}],
    );
  let tick = 0;
  let state = produce({m: new Map(entries())}, () => {});
  const immer = time((index) => {
    state = produce(state, (draft) => {
      (draft.m.get(`k${index % 1000}`) as {value: number}).value = --tick;
    });
  });
  const store = createClassyStore({m: reactiveMap(entries())});
  snapshot(store);
  let sum = 0;
  const ours = time((index) => {
    (store.m.get(`k${index % 1000}`) as {value: number}).value = --tick;
    sum += snapshot(store).m.size;
  });
  console.log(
    `immer, native Map draft: ${ns(immer)} | ours, reactiveMap: ${ns(ours)}`,
  );
  if (sum < 0) console.log(sum);
}
```

Output (Bun 1.4.4):

```text

## a Map with object values
immer: result is a native Map: [true, true]
immer: map is new, changed value is new, other value kept: [true, true, true]
immer: base value untouched: 1
immer: object key still finds its value: 3
immer: result.m.set(): THROWS Error: [Immer] This object has been frozen and should not be mutated
immer: result.m.delete(): THROWS Error: [Immer] This object has been frozen and should not be mutated
immer: Map.prototype.set.call(result.m): true
immer: values are frozen: true
immer: draft is an instance of Map: true
ours, native Map: subscriber calls after a value write and a set(): 0
ours, native Map: the snapshot taken before now reads: [5, true]
ours, reactiveMap: subscriber calls: 1
ours, reactiveMap: before and after: [1, 5]
ours, reactiveMap: other value kept: true
ours, reactiveMap: snapshot is an instance of Map: false
ours, reactiveMap: snapshot.m.set(): THROWS TypeError: Attempted to assign to readonly property.

## a Set with object members
immer: draft.has(original) and draft.has(its draft): [true, true]
immer: result is a native Set: true
immer: members in order: [10, 2]
immer: result has the original changed member, the unchanged one: [false, true]
immer: result.s.add(): THROWS Error: [Immer] This object has been frozen and should not be mutated
ours, reactiveSet: members before and after: [[1, 2], [10, 2]]
ours, reactiveSet: unchanged member kept: true
ours, reactiveSet: snapshot.has(a row read from the store): true

## time to change one value of a 1,000-entry map, then take the next result
immer, native Map draft: 21.29 us | ours, reactiveMap: 126.59 us
```

Output (Bun 1.4.4, with the argument noplugin):

```text

## a Map without enableMapSet()
immer: Map as the root: THROWS Error: [Immer] The plugin for 'MapSet' has not been loaded into Immer. To enable the plugin, import and call `enableMapSet()` when initializing your application.
immer: Map nested, never read: 2
immer: Map nested, read in the recipe: THROWS Error: [Immer] The plugin for 'MapSet' has not been loaded into Immer. To enable the plugin, import and call `enableMapSet()` when initializing your application.
```

### Port 8: types (tuple, Map, Set)

`p8-types.ts`:

```ts
// Port 8, type level only: a tuple, a Map and a Set through Immer's types and
// through ours. Checked with `tsc --noEmit`; nothing here runs.
import {type Draft, type Immutable, produce} from 'immer';
import type {ReactiveMap} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/collections/index.ts';
import type {Snapshot} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/types.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
declare function expectTrue<T extends true>(): T;

type Pair = [string, number];
type State = {
  pair: Pair;
  rows: {id: number}[];
  tags: Map<string, {n: number}>;
  ids: Set<number>;
};

// Immer: a tuple stays a tuple in both directions.
expectTrue<Equal<Immutable<Pair>, readonly [string, number]>>();
expectTrue<Equal<Draft<readonly [string, number]>, [string, number]>>();
expectTrue<
  Equal<Immutable<{id: number}[]>, readonly {readonly id: number}[]>
>();

// Immer: produce gives back the base type, tuple included.
declare const state: State;
const next = produce(state, (draft) => {
  draft.pair[1] = 2;
  // @ts-expect-error index 2 is outside the tuple
  draft.pair[2] = 3;
});
expectTrue<Equal<typeof next, State>>();

// Immer: a Map and a Set become their read-only interfaces.
expectTrue<
  Equal<Immutable<State>['tags'], ReadonlyMap<string, {readonly n: number}>>
>();
expectTrue<Equal<Immutable<State>['ids'], ReadonlySet<number>>>();
declare const frozen: Immutable<State>;
// @ts-expect-error ReadonlyMap has no set()
frozen.tags.set('a', {n: 1});

// Ours: the tuple becomes an array (finding 14).
expectTrue<Equal<Snapshot<Pair>, readonly (string | number)[]>>();
// @ts-expect-error control: it is not the tuple
expectTrue<Equal<Snapshot<Pair>, readonly [string, number]>>();

// Ours with the array branch removed, as Immer's Immutable is written.
type Primitive = string | number | boolean | null | undefined | symbol | bigint;
type Leaf =
  | Primitive
  | ((...args: never[]) => unknown)
  | Date
  | RegExp
  | Error
  | Map<unknown, unknown>
  | Set<unknown>;
type Snapshot2<T> = T extends Leaf
  ? T
  : T extends object
    ? {readonly [K in keyof T]: Snapshot2<T[K]>}
    : T;
expectTrue<Equal<Snapshot2<Pair>, readonly [string, number]>>();
expectTrue<
  Equal<Snapshot2<{id: number}[]>, readonly {readonly id: number}[]>
>();
expectTrue<
  Equal<Snapshot2<readonly {id: number}[]>, readonly {readonly id: number}[]>
>();

// Ours: a native Map in a snapshot keeps set(), and so does a ReactiveMap (finding 16).
declare const snap: Snapshot<{
  native: Map<string, number>;
  reactive: ReactiveMap<string, number>;
}>;
snap.native.set('a', 1);
snap.reactive.set('a', 1);
```

Output (tsc 7.0.2 --noEmit, lines for this file):

```text
errors reported in p8-types.ts: 0
```

### Port 9: another realm

`p9-realm.mjs`:

```js
// Port 9: a plain object made in another realm (an iframe, a Node vm context).
// Runs on Bun and on Node.
import vm from 'node:vm';
import {produce} from 'immer';
import {createClassyStore, snapshot, subscribe} from './classy.mjs';
import {section, show} from './harness.mjs';

section('a plain object from another realm');
const make = () => vm.runInNewContext('({a: {b: 1}, list: [{n: 1}]})');
{
  const foreign = make();
  show(
    "its prototype is this realm's Object.prototype",
    () => Object.getPrototypeOf(foreign) === Object.prototype,
  );
  const next = produce(foreign, (draft) => {
    draft.a.b = 2;
  });
  show('immer: drafted and copied', () => [foreign.a.b, next.a.b]);

  const data = make();
  const store = createClassyStore({data});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  store.data.a.b = 2;
  show('ours: subscriber calls after a write inside it', () => calls);
  show('ours: the snapshot taken before now reads', () => before.data.a.b);
  show('ours: the store hands out the raw object', () => store.data === data);

  const list = vm.runInNewContext('[{n: 1}]');
  const listStore = createClassyStore({list});
  let listCalls = 0;
  subscribe(listStore, () => listCalls++, {sync: true});
  listStore.list.push({n: 2});
  listStore.list[0].n = 5;
  show(
    'ours: a foreign array, calls after a push and a write to a foreign row',
    () => listCalls,
  );
}
```

Output (Node 24; Bun gives the same):

```text

## a plain object from another realm
its prototype is this realm's Object.prototype: false
immer: drafted and copied: [1, 2]
ours: subscriber calls after a write inside it: 0
ours: the snapshot taken before now reads: 2
ours: the store hands out the raw object: true
ours: a foreign array, calls after a push and a write to a foreign row: 1
```
