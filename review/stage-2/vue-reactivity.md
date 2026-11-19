# Stage 2: Vue reactivity (`@vue/reactivity`)

Stage 2 of the pre-1.0 review, 2026-11-18. Read-only: nothing in the
repository was changed apart from this file.

## Library, version and files read

- **Library:** `@vue/reactivity`, from `https://github.com/vuejs/core`.
- **Version:** 3.5.45, the npm `latest` tag on 2026-11-18. Version 3.6 is at
  `3.6.0-rc.15` on npm and was not read.
- **Commit:** `8b479a89445868d474f17e2d837765e7c9ece5e4`, tag `v3.5.45`, dated
  2026-11-05, cloned into a scratch folder and read there.
- **Files read**, under `packages/reactivity/src/`: `reactive.ts`,
  `baseHandlers.ts`, `collectionHandlers.ts`, `arrayInstrumentations.ts` and
  `dep.ts` whole; `effect.ts` lines 39 to 433 and `computed.ts` lines 40 to
  220, which hold everything that decides when an effect runs and when a
  computed value is recomputed. Four helpers in `packages/shared/src/general.ts`
  (`isObject`, `toRawType`, `isIntegerKey`, `hasChanged`), the package's
  `index.ts` for what it exports, and a dozen lines of `watch.ts` were looked up.
- **Ours:** `core/core.ts`, `core/ownership.ts`, `snapshot/snapshot.ts`,
  `collections/collections.ts`, `utils/internal/internal.ts`, `types.ts` and
  `frameworks/vue/vue.ts`.
- **Ported tests** ran on Bun 1.4.4 against `@vue/reactivity@3.5.45` installed
  from npm in the scratch folder (its development build), and against our
  source imported by absolute path. Their code and output are at the end.

Line numbers for Vue refer to that commit. Line numbers for ours refer to
`release/1.0` at `9ab9744`.

## Summary

Vue's proxies answer five of the thirteen object operations a Proxy can trap
(`get`, `set`, `deleteProperty`, `has`, `ownKeys`), replace 27 array methods,
and make native `Map` and `Set` reactive. Ours answer four (`get`,
`set`, `defineProperty`, `deleteProperty`). The comparison gives eleven
findings. The three that matter most:

1. **`has` and `ownKeys` (finding 1).** Vue records a dependency for `key in
   state` and for `Object.keys(state)`, and wakes the second only when a key is
   added or removed. A sketch of the same idea in a throwaway copy of our
   source fixed stage 1 findings 29 and 30 on the live store. On the snapshot
   it showed that the fix cannot be separated from API question 3: because
   snapshot getters are enumerable own accessors, a getter that lists the keys
   of `this` counts the getters too, and one that calls `Object.entries(this)`
   calls itself until the stack overflows.
2. **Raw values on write, and one node per raw object (findings 2 and 3).** Vue
   strips the proxy from every value before it stores it, and finds an
   object's proxy by the raw object. That one rule is why `includes(raw)`
   works, why the raw graph never holds a proxy, and why an object that is
   already reactive stays connected however it is handed over. A second sketch
   (20 lines added, 7 removed) fixed stage 1 findings 5, 6, 7, 9, 10 and 42
   together with finding 4 below.
3. **A function is a value unless it is a method (finding 4).** Vue wraps no
   function at all. We wrap every function read through a store, which is the
   one cause behind stage 1 findings 5, 6, 42 and 62. We should keep binding
   and transactions for methods, which Vue lacks, and stop wrapping array
   elements, classes and `constructor`.

Vue is not better everywhere. "Where we already do better" lists six cases
where our behaviour is the one to keep.

## How the two designs differ

This explains why some of Vue's answers carry over and some cannot.

- **Vue keeps nothing per property.** A proxy is made the first time an object
  is read and kept in a `WeakMap` keyed by the raw object (`reactiveMap`,
  `reactive.ts:26`; lookup in `createReactiveObject`, `reactive.ts:292`). Each
  `get` reads the target again and looks the proxy up again
  (`baseHandlers.ts:99`, `:126-131`). One handler object serves every proxy
  (`baseHandlers.ts:251`).
- **We keep an index of children per node** (`childInternals`,
  `ownership.ts:14`), filled when the store is made (`core.ts:535-542`) and
  kept in step by `set`, `deleteProperty` and the freezing half of
  `defineProperty`. Snapshots with structural sharing need it: a write has to
  reach every owner to bump its version (`core.ts:221-239`). Whatever changes
  the target without updating the index leaves the store answering from the
  old child. Stage 1 findings 45, 46 and 71 are all that.
- **Vue subscribes per property and per reader.** Reading `state.a` inside an
  effect or a computed value links that reader to `(state, 'a')`
  (`track`, `dep.ts:262`). There are no parent links, no ownership graph and so
  nothing like our suspend and resume. Stage 1 findings 28, 61, 66 to 70 and 72
  have no counterpart.
- **Vue has no snapshots.** `readonly()` is a live view through a second proxy,
  not a frozen copy. Questions about what a snapshot contains get "no
  position".

## Findings

### 1. `has` and `ownKeys` traps, and a dependency on the set of keys

Stage 1 findings 30, 31 and 41. Bears on API question 3.

- **What they do.** `MutableReactiveHandler.has` (`baseHandlers.ts:207`)
  records a dependency on the key. `ownKeys` (`baseHandlers.ts:215`) records
  one on a marker that stands for "the set of keys of this object"
  (`ITERATE_KEY`), or on `length` for an array. `trigger` (`dep.ts:294`) wakes
  the readers of that marker only when a key is added or deleted
  (`dep.ts:358-378`), not when a value changes. `get` records a dependency on a
  key whether or not the key exists (`baseHandlers.ts:113`), so a reader of a
  missing key is woken when the key appears.
- **What we do.** The store proxy has `get`, `set`, `defineProperty` and
  `deleteProperty` (`core.ts:405-525`). `in` and `Object.keys` reach the target
  directly and record nothing. A snapshot getter runs with `this` set to a
  proxy over an empty object that has only a `get` trap (`snapshot.ts:80-93`),
  so `in`, `Object.keys` and `instanceof` answer for the empty object.
- **Difference in behaviour.** Port 2. Vue: the key count goes 2, 2, 1, 2, 3
  and `'b' in state` goes true, true, false, false, true over a value write, a
  delete and two additions, and each computed value re-runs only when its
  answer could have changed. Ours: the live getters still say 2 and `true`
  after `delete store.b`; the snapshot getters say 0 and `false` from the
  start.
- **Proposal: adapt.** Vue pushes changes to readers and we validate on read,
  so its mechanism does not carry over, but its two ideas do:
  1. Two more kinds of getter dependency on the live store. `has` records the
     key and whether it was present, and is checked with `Reflect.has`. `keys`
     records a per-node counter that moves only when a key is added or
     removed.
  2. On the snapshot side, make the frozen snapshot the target of the
     tracking proxy, so that every operation without a trap answers for the
     real object, and add the same two traps.

  I tried both in a throwaway copy (port 13, 48 added lines). The live store
  then answers 2 and `true`, 1 and `false` after the delete, 3 and `true`
  after the additions. On the snapshot `'b' in this` and
  `this instanceof Dict` become right, but `Object.keys(this).length` is 5
  where the live store says 2. The snapshot holds each getter as an enumerable
  own accessor (`snapshot.ts:213-217`), so the three getters are counted. Port
  14 shows the sharper form: a getter that calls `Object.entries(this)` reads
  itself and overflows the stack. So this fix has to be decided together with
  API question 3. Either snapshot getters stop being enumerable, or the
  tracker's `ownKeys` leaves accessors out.
- **Kind:** bug.
- **Cost:** `core.ts`, `ownership.ts` or `core.types.ts`, `snapshot.ts`; about
  50 lines. Not breaking on the live store. On a snapshot it changes what a
  getter sees through `this`. Risk: medium, because of the tie to question 3.
  The sketch was not run against the repository's suite.

### 2. Identity-sensitive searches on a list

Stage 1 finding 7.

- **What they do.** `includes`, `indexOf` and `lastIndexOf` are replaced
  (`arrayInstrumentations.ts:144-160`) by `searchProxy`
  (`arrayInstrumentations.ts:380`). It runs the native method on the raw array
  with the argument as given. If that finds nothing and the argument is a
  proxy, it runs again with the raw argument.
- **What we do.** The native method runs with the proxy as `this`
  (`core.ts:486`), so every element it reads is a proxy and is compared with
  `===` against the argument.
- **Difference in behaviour.** Port 1. Vue: `list.includes(raw)` is `true`
  and `indexOf(raw)` is 0. Ours: `false` and -1. In both libraries
  `findIndex((x) => x === raw)` is -1, because a callback is handed proxies.
  Vue's two tries have a gap of their own: a list built around a proxy misses
  the raw object (`reactive([reactive(raw)]).includes(raw)` is `false`).
- **Proposal: adopt, and compare by `identityOf`.** `identityOf`
  (`core.ts:52`) already gives one identity to a raw object, its proxy and its
  snapshots, and `indexOfMember` uses it for the collections
  (`collections.ts:16-33`). The three array searches should use the same
  comparison. That closes Vue's gap as well. Port 15 shows a sketch: raw,
  proxy and snapshot row are all found.
- **Kind:** bug.
- **Cost:** `core.ts` `get` trap, about ten lines. `includes(raw)` changes
  from `false` to `true`. Risk: low. The sketch maps the whole array on each
  call; the real version should loop once.

### 3. Store raw values on write, and find a node by the raw object

Stage 1 findings 9, 10 and 34.

- **What they do.** `set` strips the proxy from the new value and from the
  old one before it compares and stores them (`baseHandlers.ts:150-155`).
  `Set.add` and `Map.set` do the same (`collectionHandlers.ts:169-176`,
  `:190-192`). The proxy for an object is looked up by the raw object, and that
  lookup comes before the check of what kind of object it is
  (`reactive.ts:292`, then `:296`). So the raw graph never holds a proxy, and
  one object has one proxy however it arrives.
- **What we do.** `set` stores what it is given, apart from a React tracking
  proxy (`core.ts:409-412`, `:432`), and so has to compare against both forms
  (`core.ts:421-427`). `linkChild` looks an existing node up by proxy only
  (`core.ts:364`) and applies `canProxy` to a raw value (`core.ts:368`). A
  class instance that is already a store, handed over raw, fails that check
  and is left unconnected.
- **Difference in behaviour.** Port 7. Vue: after `to.row = from.row` and
  after `list.reverse()` the raw objects hold raw rows;
  `outer.inner === inner` is `true` and an effect ran for both `inc()` calls.
  Ours: the raw objects hold proxies; `outer.inner === inner` is `false` and
  `outer.inner.inc()` notified neither store. Port 10 shows a consequence of
  Vue's rule: `structuredClone(toRaw(state))` works.
- **Proposal: adopt both halves.** Unwrap a store proxy in `set`, and let
  `linkChild` find a node by raw object as well as by proxy. Port 15 shows a
  sketch: the raw target holds the raw row, the two owners share one proxy and
  both are notified, and the store placed by its raw object is connected. The
  two-form comparison at `core.ts:421-427` then reduces to one. Two rules must
  survive the change: a value under a read-only property is returned as it is
  (`core.ts:369-374`), and a frozen container keeps whatever form it was given.
- **Kind:** bug, and a simplification.
- **Cost:** `core.ts`, `set` trap and `linkChild`, about ten lines. The raw
  object behind a store holds raw children after a write, which only code that
  keeps the raw object can see. Risk: medium, because it touches attach and
  detach. Not run against the repository's suite.

### 4. A function is a value unless it is a method

Stage 1 findings 5, 6, 42 and 62.

- **What they do.** Nothing wraps a function. `createReactiveObject` returns
  anything that is not an object as it is (`reactive.ts:269`; `isObject` is
  `typeof value === 'object'`), and `get` converts only objects
  (`baseHandlers.ts:126`). A method takes `this` from the call, so
  `state.inc()` runs with the proxy as `this`. The replaced array methods live
  in one table shared by every array (`arrayInstrumentations.ts:52`).
- **What we do.** Every function read through a store is wrapped: a new
  wrapper on each read for an array (`core.ts:486`), one cached per key
  otherwise (`core.ts:487-491`). The wrapper binds `this` and opens a
  transaction (`transactional`, `core.ts:263-277`).
- **Difference in behaviour.** Port 1. Vue: a function in an array is the same
  on every read and `splice(indexOf(first), 1)` removes the right one; a class
  held as a property keeps its statics and `instanceof`; `constructor` is the
  class. A destructured method throws, because it is not bound. Ours: a new
  wrapper each time, so `indexOf` is -1 and the splice removes the last
  callback; `store.Model.label` is `undefined`; a destructured method works.
- **Proposal: adapt.** Keep binding and transactions for methods. They are
  what Vue lacks: in port 6 one `reverse()` of eight slots re-ran a Vue effect
  eight times, and ours notified once. Narrow what counts as a method:
  1. On an array, an own property that holds a function is an element. Return
     it as it is.
  2. Return `constructor` as it is.
  3. Return a class as it is. A class can be told from a method without
     guessing: its `prototype` property is not writable, an ordinary
     function's is, and a method or an arrow function has none (port 10).

  Port 15 shows a sketch that fixes findings 5, 6 and 42 and keeps a
  destructured method working. A shared table of array methods that take
  `this` from the call, as Vue has, would also end the allocation on each
  read. For finding 62, Vue's answer is that a function is never made
  reactive: `reactive(fn)` returns `fn` and warns in development.
- **Kind:** bug.
- **Cost:** `core.ts` `get` trap, about ten lines. `store.Model` and
  `store.constructor` become the class itself. Risk: low.

### 5. A delete that removes nothing

Stage 1 finding 29.

- **What they do.** `deleteProperty` asks whether the key was an own key
  before deleting, and triggers only if it was (`baseHandlers.ts:198-203`).
- **What we do.** `deleteProperty` notifies whenever `Reflect.deleteProperty`
  succeeds, which it does for a missing key (`core.ts:515-524`).
- **Difference in behaviour.** Port 2. Vue: `delete state.missing` and
  `delete list[5]` re-run nothing. Ours: one notification and a new snapshot
  equal to the old one.
- **Proposal: adopt.** Check `Object.hasOwn` first. Port 13's sketch includes
  it: no notification.
- **Kind:** bug.
- **Cost:** two lines in `core.ts`. Not breaking. Risk: low.

### 6. `Object.defineProperty` through the proxy

Stage 1 findings 1, 45 and 71. Bears on API question 4.

- **What they do.** There is no `defineProperty` trap. The call reaches the
  target and triggers nothing, which is the same silence as ours. Reads are
  right afterwards all the same, because nothing is kept per property: the
  next `get` reads the target (`baseHandlers.ts:99`).
- **What we do.** The trap handles the read-only case only
  (`core.ts:502-513`). The child index is not updated, and `get` answers from
  it first (`core.ts:496-499`).
- **Difference in behaviour.** Port 3. After redefining `child` to another
  object, to 7, a list's `length` to 1 and its element 0 to 7, Vue reads 2, 7,
  `undefined` and 7. Ours reads 1, `{n: 1}`, `{id: 3}` and `{id: 1}`, while the
  snapshot says 7 for the last. Neither library tells a reader.

  Port 8 shows where this is reached without anyone calling
  `Object.defineProperty`. When a base class constructor returns the proxy,
  the fields of a derived class are defined through it. With our store,
  `snapshot(todo).items` is then the raw array, not frozen, until the field
  is first read through the store.
- **Proposal: adapt.** Take the outcome, not the missing trap: after any
  define, the store must agree with the target. A define of a data property
  is a write (relink the child, bump the version, notify). A define of an
  accessor removes the child. This is required if question 4 is answered with
  a base class.
- **Kind:** bug.
- **Cost:** `core.ts` trap, about 25 lines. Not breaking. Risk: medium. The
  one-line fix for stage 1 finding 66 belongs in the same trap. Not sketched.

### 7. Array reads on the raw array

Stage 1 finding 3. Performance.

- **What they do.** The methods that read a whole array (`forEach`, `map`,
  `filter`, `find`, `some`, `every`, `reduce`, `join`, the iterators and
  others) record one dependency for the array and then run the native method
  on the raw array, converting each element as it is handed to the callback
  (`apply`, `arrayInstrumentations.ts:310-346`; `shallowReadArray`, `:40`;
  `reduce`, `:349`). An array subclass with its own method takes the ordinary
  path (`:323-330`). `get` makes no descriptor lookup.
- **What we do.** The native method runs on the proxy (`core.ts:486`). Each
  index goes through `get`: a descriptor lookup along the prototype chain
  (`core.ts:464`, `internal.ts:88-99`), a `Map` lookup by string index
  (`core.ts:497`) and `recordDep` (`core.ts:498`).
- **Difference in behaviour.** Port 11, on one machine (Apple M1 Max, Bun
  1.4.4, best of seven rounds), so indicative only:

  | Operation                                  |    Raw |     Vue |     Ours |
  | ------------------------------------------ | -----: | ------: | -------: |
  | Read a number field                        | 1.7 ns | 15.9 ns |  31.3 ns |
  | Sum 1,000 rows with `reduce`, per row      | 2.1 ns | 75.9 ns | 126.2 ns |
  | Sum 1,000 rows with an index loop, per row |        |  221 ns |   135 ns |
  | `list.includes(10)` on ten numbers         |        | 56.9 ns |   921 ns |

  Vue's `reduce` figure includes a recorded dependency on every row's `value`,
  which we do not need. Its index loop is slower than ours because it records
  one dependency per index.
- **Proposal: adapt.** For the array methods that only read, run the native
  method on the raw array and hand out each element's proxy. A getter being
  tracked already holds one version dependency on the array node
  (`core.ts:93-101`), so nothing is needed per element. `includes` and
  `indexOf` on a list of primitives need no proxy work at all.
- **Kind:** performance.
- **Cost:** `core.ts`, a table of about fifteen methods. Not breaking if a
  callback still receives proxies and the proxy as its third argument. Risk:
  medium (sparse arrays, array subclasses, a callback that writes). Not
  sketched: the gain on our side is an expectation from Vue's numbers, not a
  measurement.

### 8. What a computed value records, and when

Stage 1 findings 32, 36 and 38.

- **What they do.** Each dependency has a version counter that moves on every
  trigger (`Dep.trigger`, `dep.ts:167`). Each pair of dependency and reader is
  a `Link` that remembers the version the reader last saw (`dep.ts:32`,
  `:127`). On a read, `refreshComputed` (`effect.ts:376`) returns the cached
  value when nothing reactive has been written anywhere since the last check
  (`:387`), or when `isDirty` (`effect.ts:353`) finds every link's version
  unchanged, refreshing nested computed values first. Otherwise it runs the
  function, collects the dependencies again (`prepareDeps` and `cleanupDeps`,
  `:312-351`), and moves its own version only if the result changed by
  `Object.is` (`:416`). Three details matter for us:
  1. Every reactive read made while the function runs is recorded, on any
     object (`track`, `dep.ts:262`).
  2. The link to a nested computed value is made before that value is
     evaluated (`computed.ts:131-139`), so one that throws is still a
     dependency.
  3. A read of a missing key is a dependency on that key (finding 1).
- **What we do.** `recordDep` keeps only reads on the getter's own node
  (`core.ts:91`). A nested getter is recorded after it returns
  (`core.ts:467-475`), so not when it throws. A dependency on a missing key
  fails validation every time (`core.ts:147`).
- **Difference in behaviour.** Ports 9 and 2. A value that reads another
  object: Vue 21, ours 11 on the live store and 21 on a snapshot. A value that
  catches another's error: Vue `'ok'` once the error stops, ours `'fallback'`
  for good. A value that reads a missing key: Vue returns the same object on
  both reads and recomputes when the key is added; ours builds a new object on
  each read.

  The comparison goes the other way for a cycle. Vue returns `NaN` and reports
  nothing. Our live store throws an error that names the cycle
  (`core.ts:173-184`), which is the behaviour to keep. Our snapshot layer
  overflows the stack and should throw the same error.
- **Proposal: adapt three things.**
  1. Record a nested getter before evaluating it, and treat a missing cache
     entry as "recompute". The `if (!cached)` branch at `core.ts:140`, which
     stage 1 finding 64 lists as unreachable, is then the one that handles it.
  2. Record whether the key was present with a value dependency, so that a
     missing key is valid for as long as it stays missing.
  3. For a read on any other node, record that node's version, once per node
     per evaluation.
- **Kind:** bug.
- **Cost:** `core.ts` (`recordDep`, `areDepsValid`, `get`), `core.types.ts`.
  Not breaking. Risk: medium. The third change makes a getter that reads
  another store recompute when that store changes, which is the point, and
  adds a lookup per foreign read. Not sketched: the behaviour is measured, the
  fix is reasoning from reading.

### 9. Delivery: no re-entry, and no call after removal

Stage 1 findings 18, 19 and 20.

- **What they do.** `ReactiveEffect.notify` returns at once while the effect
  is running (`effect.ts:150-156`), so an effect's own writes do not queue it
  again. `endBatch` checks that an effect is still active just before it calls
  it (`effect.ts:297`). The first error an effect throws is rethrown to the
  writer after the others have run (`effect.ts:289-309`). The scheduler in
  `runtime-core`, outside this package, has a limit of 100 repeats for a job
  that queues itself (`scheduler.ts:64`; only that line was read).
- **What we do.** `deliver` copies the listeners and calls each one
  (`core.ts:314-328`). It does not check that a listener is still subscribed
  and has no guard against re-entry. Errors go to `console.error`.
- **Difference in behaviour.** Port 9. A Vue effect that writes what it reads
  runs once per outside write, and an effect stopped by an earlier one in the
  same delivery is not run. Stage 1 pins ours: stack overflow (18), unbounded
  microtasks (19), one call after unsubscribing (20).
- **Proposal: adopt the check, adapt the guard.** Skip a listener that was
  removed since the copy was made (finding 20). For finding 18, either skip a
  sync listener that is already running, as Vue does, or count the depth and
  throw an error that names the cause. Vue's choice means a subscriber does
  not hear about its own writes, which suits a subscriber that corrects state.
  For finding 19, a bound like the scheduler's, in development. No change
  proposed for errors: logging keeps a faulty subscriber from breaking the
  writer.
- **Kind:** bug (20), diagnostics (18, 19).
- **Cost:** `core.ts`, `deliver` and `subscribe`. The check is not breaking. A
  guard changes what a subscriber that writes observes. Risk: low.

### 10. Native `Map` and `Set`

Stage 1 findings 12, 33 and 34. Bears on API question 5.

- **What they do.** A native collection gets a proxy with a single trap,
  `get`, which hands out replacement methods (`createInstrumentationGetter`,
  `collectionHandlers.ts:270-296`). Each one takes the raw collection from
  `this`, calls the native method on it and wraps what comes out (`get`
  `:101`, `has` `:130`, `add` `:169`, `set` `:189`, `delete` `:213`, `clear`
  `:232`, the iterators `:33`). Values are stored raw. A lookup tries the key
  as given, then raw. The file is 331 lines and covers `Map`, `Set`, `WeakMap`
  and `WeakSet` in mutable, read-only and shallow forms. In development it
  warns when a collection holds both the raw and the reactive form of one
  object (`checkIdentityKeys`, `:315`).
- **What we do.** Native collections are opaque (`internal.ts:70-82`).
  `ReactiveMap` and `ReactiveSet` keep an array and scan it
  (`collections.ts:16-33`). The arrays are public members (`collections.ts:54`,
  `:209`).
- **Difference in behaviour.** Port 5. Vue: `state.set instanceof Set`;
  `has` answers for the raw object and for the proxy; members come out
  reactive; `add(-0)` after `0` leaves one member; `add(raw)` then
  `add(proxy)` leaves one. Ours: a native set misses the proxy; `reactiveSet`
  finds the raw object, the proxy and a snapshot of it; `add(-0)` after `0`
  gives two members; `reactiveSet([raw, proxy])` holds two.
- **Proposal: do not replace the two classes for 1.0; take three details.**
  Vue's proxy is a live view. Our consumers read frozen copies, and a native
  `Map` cannot be frozen, so a snapshot would need a read-only class of its
  own and a full copy on each change. That part is reasoning, and the Valtio
  report is the place to test it. What can be taken now:
  1. Treat `+0` and `-0` as one member. `indexOfMember` compares with
     `Object.is` (`collections.ts:30`); `Map` and `Set` do not.
  2. Remove duplicates by identity in the two constructors
     (`collections.ts:57-70`, `:212-222`), as `add` already does.
  3. Warn in development when a native `Map` or `Set` is put in a store,
     because that is the silent case.

  One decision is needed before 1.0 whichever way this goes: whether "a native
  `Map` in a store is kept by reference" is part of the contract. Making it
  reactive later would change what a snapshot holds.
- **Kind:** API design; the first two details are bugs.
- **Cost:** `collections.ts`, a few lines. The first changes the size of
  `reactiveSet([0]).add(-0)`. Risk: low.

### 11. Read-only types

Stage 1 findings 14, 16 and 17.

- **What they do.** `DeepReadonly<T>` (`reactive.ts:157-177`) maps `Map` to
  `ReadonlyMap` and `Set` to `ReadonlySet`, leaves functions, `Date`, `RegExp`
  and `Error` alone, and uses a mapped type over `keyof T` for the rest, which
  keeps a tuple a tuple. `ComputedRef<T>` declares `readonly value`
  (`computed.ts:27-28`).
- **What we do.** `Snapshot<T>` turns every array into `ReadonlyArray`
  (`types.ts:40-41`) and has no case for `ReactiveMap` or `ReactiveSet`, so
  their mutators stay in the type. The Vue adapter returns
  `Ref<Snapshot<T>>`, cast from a `shallowRef` (`vue.ts:10-21`).
- **Difference in behaviour.** Port 12, a type check that passes:
  `DeepReadonly<[string, number]>` is `readonly [string, number]`, and
  `view.todos.set(...)` on a read-only `Map` is a compile error.
- **Proposal: adopt.** In `Snapshot<T>`, drop the array case and let the
  mapped type handle arrays and tuples, and map `ReactiveMap` and
  `ReactiveSet` to interfaces without mutators. For the adapter, Vue's own
  name for a ref that is replaced as a whole and not written by its reader is
  `Readonly<ShallowRef<T>>`.
- **Kind:** API design.
- **Cost:** `types.ts`, `vue.ts` and the collection types. Breaking at the
  type level for code that calls a mutator on a snapshot, which throws at run
  time today. Risk: low.

## Where we already do better

Each was run. These are behaviours to keep.

- **Freezing through the proxy** (port 4). `Object.freeze(state.config)` in
  Vue freezes the target behind a live proxy, and the next nested read through
  that proxy throws a `TypeError`. Ours reads 1, because the `defineProperty`
  trap detaches the child (`core.ts:502-513`).
- **A read-only property that holds an object** (port 4). Vue throws on the
  read. Ours returns the value (`core.ts:369-374`).
- **Sealed objects** (port 4). Vue leaves any non-extensible object out
  (`reactive.ts:288`), so a sealed object is not reactive. Ours treats only a
  frozen object as a value.
- **Transactions** (ports 6 and 8). Vue groups the writes of five array
  methods (`noTracking`, `arrayInstrumentations.ts:401`). `reverse()` of eight
  slots re-ran an effect eight times, `sort()` five times, and a setter that
  writes two fields twice. Ours notifies once for each array method and store
  method. Vue applications do not see this, because the framework's scheduler
  groups the runs.
- **A setter on the prototype** (port 8). Vue's `set` takes it for a new key
  (`baseHandlers.ts:174-186`), so an effect that reads only `Object.keys` ran
  again. Ours checks the descriptor first (`core.ts:413-418`).
- **A cycle between getters** (port 9). Vue returns `NaN`. Our live store
  throws an error that names the cycle.

## Stage 1 findings with a counterpart in Vue

"Run" means a ported test showed it. "Read" means it follows from the source
and was not run.

| Stage 1 | What Vue does                                                                                                            | Evidence     |
| ------: | ------------------------------------------------------------------------------------------------------------------------ | ------------ |
|       1 | No `defineProperty` trap. The target changes, no effect is triggered, and reads are right afterwards.                    | Run, port 3  |
|       3 | Whole-array reads run on the raw array with one dependency for the array: 76 ns per row here, against 126 ns for ours.   | Run, port 11 |
|       5 | A function in an array is returned as stored, the same on each read.                                                     | Run, port 1  |
|       6 | A class held as a property is returned as stored. Statics and `instanceof` work.                                         | Run, port 1  |
|       7 | `includes`, `indexOf` and `lastIndexOf` find the raw object. A list built around a proxy still misses it.                | Run, port 1  |
|       8 | An object can hold itself. The raw object holds itself raw. There is no snapshot to fail.                                | Run, port 7  |
|       9 | One proxy per raw object, found by the raw object. The instance is connected.                                            | Run, port 7  |
|      10 | Raw objects never hold proxies: `set` strips them.                                                                       | Run, port 7  |
|      11 | The same limit. A write through the raw object wakes no one.                                                             | Run, port 7  |
|      12 | Native `Set` and `Map` are reactive. `has` answers for the raw object and for the proxy.                                 | Run, port 5  |
|      13 | A computed value on a self-referencing object does not re-run for a field it never read.                                 | Run, port 7  |
|      14 | `DeepReadonly` keeps a tuple a tuple.                                                                                    | Run, port 12 |
|      16 | `DeepReadonly` of a `Map` has no mutators. At run time a write warns in development and does nothing.                    | Run, 5, 12   |
|      17 | Read-only handles are typed read-only: `ComputedRef` has `readonly value`, `DeepReadonly` maps a ref to a read-only one. | Read         |
|      18 | A running effect is not queued again by its own writes.                                                                  | Run, port 9  |
|      19 | Nothing in this package. The framework's scheduler stops after 100 repeats.                                              | Read         |
|      20 | An effect stopped during delivery is not called.                                                                         | Run, port 9  |
|      26 | A dependency follows the property. After the object is replaced, the effect follows the new one.                         | Run, port 10 |
|      29 | A delete of a missing key triggers nothing. Nor does writing the value a field already holds, `NaN` included.            | Run, port 2  |
|      30 | `in` and `Object.keys` are tracked. The reader re-runs when a key is added or removed.                                   | Run, port 2  |
|      32 | A read of a missing key is cached and re-run when the key appears.                                                       | Run, port 2  |
|      33 | Native semantics: `+0` and `-0` are one member.                                                                          | Run, port 5  |
|      34 | `add` stores the raw object, so one member. A `Set` constructed from both forms holds two, with a development warning.   | Run, port 5  |
|      36 | Reads of other objects are tracked. A nested computed value that throws is still a dependency.                           | Run, port 9  |
|      38 | A cycle returns `NaN`. No error.                                                                                         | Run, port 9  |
|      39 | A computed value that writes re-runs on every read (1, 2, 3). No warning was printed.                                    | Run, port 9  |
|      40 | The same. A computed result changed by its reader stays changed.                                                         | Run, port 10 |
|      42 | `constructor` is the class.                                                                                              | Run, port 1  |
|      43 | The same, and worse: a setter that writes two fields re-runs an effect twice and counts as a new key.                    | Run, port 8  |
|      45 | Reads follow the target after a redefinition.                                                                            | Run, port 3  |
|      46 | The parent hands out the raw object from then on, without saying so. A proxy taken earlier throws the same `TypeError`.  | Run, port 4  |
|      48 | The same as a plain object: the prototype is swapped.                                                                    | Run, port 10 |
|      50 | The same. The descriptor's value is the raw object.                                                                      | Run, port 10 |
|      51 | The same `DataCloneError`. `structuredClone(toRaw(state))` works, because the raw graph holds no proxy.                  | Run, port 10 |
|      62 | `reactive(fn)` returns `fn` and warns in development.                                                                    | Run, port 1  |
|      63 | A typed array is not made reactive. Nor is a `Date`.                                                                     | Run, port 10 |
|      71 | An element redefined to a primitive reads as the primitive.                                                              | Run, port 3  |

No counterpart: findings 2, 4, 15, 21 to 25, 27, 28, 31, 35, 37, 41, 44, 47,
49, 52 to 61, 64 to 70, 72 and 73. They concern snapshots, the ownership
graph, grouped delivery, `persist`, `history` or code that Vue does not have.
Finding 1 above still proposes a fix for 31 and 41.

## The eight API questions

1. **Should synchronous notification be the default for `subscribe()`?** Vue
   is synchronous at the bottom and grouped at the surface. `effect()` re-runs
   before the writing statement returns (`endBatch`, `effect.ts:273`), and
   `watch` in this package calls its job directly unless it is given a
   scheduler (`watch.ts:294-296`). What application code uses goes through the
   framework's scheduler, with a synchronous flush as an option; that part
   lives in `runtime-core` and was not read. That is the arrangement we have:
   the adapters subscribe synchronously and `subscribe()` is grouped by
   default. Vue's position supports keeping it.
2. **Writes outside a store method: allowed, warned about, or grouped? Does
   `batch()` belong?** Allowed, anywhere, with no warning. Vue has no notion
   of an action. Only five array methods are grouped. `startBatch` and
   `endBatch` exist, are marked internal and are not exported from the
   package's `index.ts`. Vue can do without a public `batch()` because its
   surface is grouped already. Our bindings are synchronous, so ours belongs.
   Port 6 shows what a bare synchronous reader sees without one.
3. **Should snapshot getters stay enumerable own accessors?** No position on
   snapshots: Vue makes no copies. What it shows is the other arrangement. A
   getter stays on the prototype, so `Object.keys(reactive(instance))` lists
   data only and `JSON.stringify` skips getters (port 14). With ours,
   `Object.keys(store)` is `a,b` and `Object.keys(snapshot(store))` is
   `a,b,entryCount`, and `JSON.stringify(snapshot(store))` runs every getter.
   Finding 1 shows that the choice also decides what a getter may do with
   `this`.
4. **Can arrow-function methods and `#private` fields be made to work?** Vue
   has both limits and no remedy (port 8): a write inside an arrow method
   wakes no one, and a getter that reads a `#private` field throws through the
   proxy. A base class whose constructor returns the proxy works in both
   libraries for arrow methods, and makes private fields readable on the live
   object, because the derived class's fields are then installed on the proxy.
   Port 8 and port 10 measured four limits with our store:
   - The fields arrive through `defineProperty`, which our trap does not treat
     as a write, so a snapshot holds the raw array until the field is first
     read (finding 6).
   - A write to a private field notifies no one. Private fields do not go
     through a Proxy. Vue is the same.
   - A getter that reads only private state is cached for good on the live
     store: it read 1 before and after `bump()`.
   - `snapshot(todo).secret` throws a `TypeError`, because the snapshot is a
     new object without the private fields.

   So arrow methods can be made to work with a base class. Private fields
   can be made readable on the live store, but not reactive, and not readable
   on a snapshot.
5. **Should native `Map` and `Set` be reactive directly?** Vue's answer is
   yes, and the mutable half costs one `get` trap and a dozen replaced methods
   (finding 10). Vue has no answer for the frozen half, which is the part that
   costs us.
6. **Opt-in or opt-out for nested class instances?** Opt-out. Vue proxies any
   extensible object whose `Object.prototype.toString` tag is `Object`,
   `Array`, `Map`, `Set`, `WeakMap` or `WeakSet` (`targetTypeMap`,
   `reactive.ts:43`), which includes class instances and excludes `Date` and
   typed arrays by their tag (port 10). The ways out are `markRaw`,
   `shallowReactive` and making the object non-extensible (port 8). The cost
   is loud: a class with `#private` fields throws when read through the proxy
   (port 8). The cost of our opt-in is silent: in port 7 a nested class
   instance changed its state and notified no one. Two things are particular
   to us. A snapshot is a copy, so a class with private fields would fail on
   the snapshot under opt-out. And `markRaw` works by writing a hidden
   property onto the user's object (`reactive.ts:420-424`), which our rule
   about internal state excludes; freezing is our way out today, and it does
   not suit an object that must stay mutable, so opt-out would need a marker
   kept in a `WeakSet`.
7. **Are the entry points, export names and adapter names consistent?** From
   Vue's side only. `use…` is the name for a function that must run in
   `setup()` or an effect scope and leaves its cleanup to the scope, which is
   what `useClassyStore` does (`vue.ts:14-18`, `:33-36`), so the name fits. The
   return type does not: see finding 11. No position on the other four.
8. **What development-only diagnostics would catch our silent failures?** Vue
   compiles its warnings behind a `__DEV__` flag. The build for bundlers
   leaves `process.env.NODE_ENV !== "production"` in place (34 times in
   `reactivity.esm-bundler.js`) for the application's bundler to remove, and
   `package.json` sends Node to `reactivity.cjs.prod.js` or
   `reactivity.cjs.js` by the `production` and `development` conditions. The
   production file has no warning call and is 51 KB against 55 KB. Run with
   `NODE_ENV=production`, port 1 printed no warning. Its warnings, and what
   the same idea would catch for us:
   - A value that cannot be made reactive (`reactive.ts:269-278`). For us: a
     native `Map` or `Set`, or a class instance without `PROXYABLE`, placed
     in a store. Today that is silent.
   - Both forms of one object in a collection (`collectionHandlers.ts:315`).
     For us: stage 1 finding 34.
   - A write to a read-only view (`baseHandlers.ts:230-248`). We throw
     already, because snapshots are frozen.
   - `onTrack` and `onTrigger` hooks that receive the target, the key and the
     old and new value (`dep.ts:153-162`, `:309-323`). For us: a way to ask
     which write caused a notification or a recompute.
   - A repeat limit (finding 9). For us: stage 1 findings 18 and 19.

   Vue has no diagnostic for a write inside an arrow method or after an
   `await`, and has the first of those failures itself (port 8).

## What was verified by running, and what was only read

**Run** (code and output below): every "Run" row of the table; the
differences stated in findings 1 to 11; the six cases under "Where we already
do better"; the timings in finding 7; the type check in finding 11; the two
sketches (ports 13 and 15) and the recursion in port 14; the absence of
warnings under `NODE_ENV=production`.

**Read, not run:** how `refreshComputed` and `isDirty` decide (finding 8),
apart from the outcomes port 9 shows; the scheduler's limit of 100; that
`startBatch` and `endBatch` are not exported; the two "Read" rows of the
table.

**Reasoning, not tested:**

- The proposals in findings 6, 7 and 8 were not sketched. The expected gain in
  finding 7 comes from Vue's numbers.
- The two sketches were run only against the scenarios in ports 13 to 15. The
  repository's suite was not run against them, so they show that the idea
  works, not that it is free of regressions.
- That a snapshot of a native `Map` needs its own class and a full copy
  (finding 10).

**Not done:** Vue 3.6 was not read. `watch.ts`, `ref.ts` and `effectScope.ts`
were not read beyond the lines cited. The timings ran on Bun only, not on
Node.

## Ported tests

Each script ran from a scratch folder with `@vue/reactivity@3.5.45` installed.
In the listings, `<repo>` stands for the absolute path of this checkout.
`[Vue warn]` lines are Vue's development warnings. Biome reformatted the
listings when this file was formatted; the code is otherwise what ran.

### Helpers shared by the ports

`helpers.ts`:

```ts
export const out = (label: string, value: unknown) =>
  console.log(
    `${label.padEnd(58)} ${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );

export const attempt = (run: () => unknown): unknown => {
  try {
    return run();
  } catch (error) {
    return `throws ${(error as Error).constructor.name}: ${(error as Error).message.split('\n')[0]}`;
  }
};

export const section = (title: string) => console.log(`\n# ${title}`);
```

### Port 1: searches on a list, a function in a list, a class as a property

`01-array-identity.ts`:

```ts
import {reactive, toRaw} from '@vue/reactivity';
import {createClassyStore} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

section('finding 7: identity-sensitive searches on a list of objects');
{
  const raw = {id: 1};
  const vue = reactive({list: [raw]});
  out('vue   list[0] === raw', vue.list[0] === raw);
  out('vue   list.includes(raw)', vue.list.includes(raw));
  out('vue   list.indexOf(raw)', vue.list.indexOf(raw));
  out('vue   list.lastIndexOf(raw)', vue.list.lastIndexOf(raw));
  out('vue   list.includes(list[0])', vue.list.includes(vue.list[0]));
  out(
    'vue   list.findIndex(x => x === raw)',
    vue.list.findIndex((x) => x === raw),
  );
  const held = reactive([reactive(raw)]);
  out('vue   a list built around the proxy: includes(raw)', held.includes(raw));

  const ours = createClassyStore({list: [raw]});
  out('ours  list[0] === raw', ours.list[0] === raw);
  out('ours  list.includes(raw)', ours.list.includes(raw));
  out('ours  list.indexOf(raw)', ours.list.indexOf(raw));
  out('ours  list.lastIndexOf(raw)', ours.list.lastIndexOf(raw));
  out('ours  list.includes(list[0])', ours.list.includes(ours.list[0]));
  out(
    'ours  list.findIndex(x => x === raw)',
    ours.list.findIndex((x) => x === raw),
  );
}

section('finding 5: a function held in an array, read twice');
{
  const first = () => 1;
  const second = () => 2;
  const vue = reactive({callbacks: [first, second]});
  out(
    'vue   callbacks[0] === callbacks[0]',
    vue.callbacks[0] === vue.callbacks[0],
  );
  out('vue   callbacks[0] === first', vue.callbacks[0] === first);
  out('vue   callbacks.indexOf(first)', vue.callbacks.indexOf(first));
  vue.callbacks.splice(vue.callbacks.indexOf(first), 1);
  out(
    'vue   after splice(indexOf(first), 1): kept second',
    vue.callbacks.length === 1 && vue.callbacks[0] === second,
  );

  const ours = createClassyStore({callbacks: [first, second]});
  out(
    'ours  callbacks[0] === callbacks[0]',
    ours.callbacks[0] === ours.callbacks[0],
  );
  out('ours  callbacks[0] === first', ours.callbacks[0] === first);
  out('ours  callbacks.indexOf(first)', ours.callbacks.indexOf(first));
  ours.callbacks.splice(ours.callbacks.indexOf(first), 1);
  out(
    'ours  after splice(indexOf(first), 1): kept second',
    ours.callbacks.length === 1 && ours.callbacks[0]() === 2,
  );
}

section('findings 6 and 42: a class held as a property, and `constructor`');
{
  class Model {
    static label = 'model';
    constructor(public name: string) {}
  }
  const vue = reactive({Model});
  out('vue   state.Model === Model', vue.Model === Model);
  out('vue   state.Model.label', vue.Model.label);
  out(
    'vue   new state.Model("x") instanceof state.Model',
    new vue.Model('x') instanceof vue.Model,
  );

  const ours = createClassyStore({Model});
  out('ours  store.Model === Model', ours.Model === Model);
  out('ours  store.Model.label', String(ours.Model.label));
  out(
    'ours  new store.Model("x") instanceof store.Model',
    attempt(() => new ours.Model('x') instanceof ours.Model),
  );

  class Counter {
    static kind = 'counter';
    count = 0;
    inc() {
      this.count++;
    }
  }
  const vueCounter = reactive(new Counter());
  out(
    'vue   counter.constructor === Counter',
    vueCounter.constructor === Counter,
  );
  out(
    'vue   counter.inc === Counter.prototype.inc (unbound)',
    vueCounter.inc === Counter.prototype.inc,
  );
  const {inc: vueInc} = vueCounter;
  out(
    'vue   const {inc} = counter; inc()',
    attempt(() => vueInc()),
  );

  const ourCounter = createClassyStore(new Counter());
  out(
    'ours  counter.constructor === Counter',
    ourCounter.constructor === Counter,
  );
  out(
    'ours  counter.constructor.kind',
    String((ourCounter.constructor as typeof Counter).kind),
  );
  const {inc: ourInc} = ourCounter;
  out(
    'ours  const {inc} = counter; inc(); counter.count',
    attempt(() => (ourInc(), ourCounter.count)),
  );
}

section('finding 62: a function given to the factory');
{
  const fn = () => 1;
  out(
    'vue   reactive(fn) === fn',
    (reactive as (value: unknown) => unknown)(fn) === fn,
  );
  out(
    'vue   toRaw(reactive(fn)) === fn',
    toRaw((reactive as (value: unknown) => unknown)(fn)) === fn,
  );
}
```

Output:

```text

# finding 7: identity-sensitive searches on a list of objects
vue   list[0] === raw                                      false
vue   list.includes(raw)                                   true
vue   list.indexOf(raw)                                    0
vue   list.lastIndexOf(raw)                                0
vue   list.includes(list[0])                               true
vue   list.findIndex(x => x === raw)                       -1
vue   a list built around the proxy: includes(raw)         false
ours  list[0] === raw                                      false
ours  list.includes(raw)                                   false
ours  list.indexOf(raw)                                    -1
ours  list.lastIndexOf(raw)                                -1
ours  list.includes(list[0])                               true
ours  list.findIndex(x => x === raw)                       -1

# finding 5: a function held in an array, read twice
vue   callbacks[0] === callbacks[0]                        true
vue   callbacks[0] === first                               true
vue   callbacks.indexOf(first)                             0
vue   after splice(indexOf(first), 1): kept second         true
ours  callbacks[0] === callbacks[0]                        false
ours  callbacks[0] === first                               false
ours  callbacks.indexOf(first)                             -1
ours  after splice(indexOf(first), 1): kept second         false

# findings 6 and 42: a class held as a property, and `constructor`
vue   state.Model === Model                                true
vue   state.Model.label                                    model
vue   new state.Model("x") instanceof state.Model          true
ours  store.Model === Model                                false
ours  store.Model.label                                    undefined
ours  new store.Model("x") instanceof store.Model          false
vue   counter.constructor === Counter                      true
vue   counter.inc === Counter.prototype.inc (unbound)      true
vue   const {inc} = counter; inc()                         throws TypeError: undefined is not an object (evaluating 'this.count')
ours  counter.constructor === Counter                      false
ours  counter.constructor.kind                             undefined
ours  const {inc} = counter; inc(); counter.count          1

# finding 62: a function given to the factory
[Vue warn] value cannot be made reactive: () => 1
vue   reactive(fn) === fn                                  true
[Vue warn] value cannot be made reactive: () => 1
vue   toRaw(reactive(fn)) === fn                           true
```

### Port 2: `Object.keys` and `in`, a delete of a missing key, a read of a missing key

`02-keys-and-has.ts`:

```ts
import {computed, effect, reactive} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {out, section} from './helpers';

section(
  'finding 30: a derived value that reads Object.keys(state) and "b" in state',
);
{
  const state = reactive<Record<string, number>>({a: 1, b: 2});
  let keyRuns = 0;
  let hasRuns = 0;
  const keyCount = computed(() => (keyRuns++, Object.keys(state).length));
  const hasB = computed(() => (hasRuns++, 'b' in state));
  const read = () =>
    `keyCount=${keyCount.value} hasB=${hasB.value} keyRuns=${keyRuns} hasRuns=${hasRuns}`;
  out('vue   start', read());
  state.a = 10;
  out('vue   after state.a = 10 (a value, not a key)', read());
  delete state.b;
  out('vue   after delete state.b', read());
  state.c = 3;
  out('vue   after state.c = 3 (a new key)', read());
  state.b = 5;
  out('vue   after state.b = 5 (the key comes back)', read());

  class Dict {
    [key: string]: unknown;
    a = 1;
    b = 2;
    get keyCount() {
      return Object.keys(this).length;
    }
    get hasB() {
      return 'b' in this;
    }
  }
  const store = createClassyStore(new Dict());
  const readOurs = () => `keyCount=${store.keyCount} hasB=${store.hasB}`;
  out('ours  start, live', readOurs());
  out(
    'ours  start, snapshot',
    `keyCount=${snapshot(store).keyCount} hasB=${snapshot(store).hasB}`,
  );
  delete store.b;
  out('ours  after delete store.b, live', readOurs());
  out(
    'ours  after delete store.b, snapshot',
    `keyCount=${snapshot(store).keyCount} hasB=${snapshot(store).hasB}`,
  );
}

section(
  'finding 29: a delete that removes nothing, and a write of the same value',
);
{
  const state = reactive<Record<string, number>>({a: 1});
  let runs = 0;
  effect(() => {
    runs++;
    Object.keys(state);
    state.a;
    state.missing;
  });
  out('vue   effect runs at start', runs);
  delete state.missing;
  out('vue   after delete state.missing', runs);
  state.a = 1;
  out('vue   after state.a = 1 (same value)', runs);
  state.n = Number.NaN;
  const afterNaN = runs;
  state.n = Number.NaN;
  out('vue   a second state.n = NaN adds runs', runs - afterNaN);
  const list = reactive([1, 2, 3]);
  let listRuns = 0;
  effect(() => {
    listRuns++;
    list.length;
    list[0];
  });
  delete list[5];
  out('vue   after delete list[5] (past the end)', listRuns);

  const store = createClassyStore<Record<string, number>>({a: 1});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  delete store.missing;
  out('ours  sync subscriber calls after delete store.missing', calls);
  out('ours  snapshot replaced by an equal one', snapshot(store) !== before);
  store.a = 1;
  out('ours  sync subscriber calls after store.a = 1', calls);
}

section(
  'finding 32: a derived value that reads a property which does not exist',
);
{
  const state = reactive<{maybe?: number}>({});
  let runs = 0;
  const box = computed(() => (runs++, {value: state.maybe}));
  out('vue   box.value === box.value', box.value === box.value);
  out('vue   runs after two reads', runs);
  state.maybe = 1;
  out(
    'vue   after state.maybe = 1: value, runs',
    `${box.value.value}, ${runs}`,
  );

  class Holder {
    maybe?: number;
    runs = 0;
    get box() {
      return {value: (this as {maybe?: number}).maybe};
    }
  }
  const holder = new Holder();
  delete holder.maybe;
  const store = createClassyStore(holder);
  out('ours  store.box === store.box', store.box === store.box);
  out(
    'ours  snapshot(store).box === snapshot(store).box',
    snapshot(store).box === snapshot(store).box,
  );
}
```

Output:

```text

# finding 30: a derived value that reads Object.keys(state) and "b" in state
vue   start                                                keyCount=2 hasB=true keyRuns=1 hasRuns=1
vue   after state.a = 10 (a value, not a key)              keyCount=2 hasB=true keyRuns=1 hasRuns=1
vue   after delete state.b                                 keyCount=1 hasB=false keyRuns=2 hasRuns=2
vue   after state.c = 3 (a new key)                        keyCount=2 hasB=false keyRuns=3 hasRuns=2
vue   after state.b = 5 (the key comes back)               keyCount=3 hasB=true keyRuns=4 hasRuns=3
ours  start, live                                          keyCount=2 hasB=true
ours  start, snapshot                                      keyCount=0 hasB=false
ours  after delete store.b, live                           keyCount=2 hasB=true
ours  after delete store.b, snapshot                       keyCount=0 hasB=false

# finding 29: a delete that removes nothing, and a write of the same value
vue   effect runs at start                                 1
vue   after delete state.missing                           1
vue   after state.a = 1 (same value)                       1
vue   a second state.n = NaN adds runs                     0
vue   after delete list[5] (past the end)                  1
ours  sync subscriber calls after delete store.missing     1
ours  snapshot replaced by an equal one                    true
ours  sync subscriber calls after store.a = 1              1

# finding 32: a derived value that reads a property which does not exist
vue   box.value === box.value                              true
vue   runs after two reads                                 1
vue   after state.maybe = 1: value, runs                   1, 2
ours  store.box === store.box                              false
ours  snapshot(store).box === snapshot(store).box          true
```

### Port 3: `Object.defineProperty` through the proxy

`03-define-property.ts`:

```ts
import {effect, reactive} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

const data = {writable: true, enumerable: true, configurable: true};

section('finding 1: Object.defineProperty adds a key through the proxy');
{
  const state = reactive<Record<string, unknown>>({a: 1});
  let runs = 0;
  let seen = '';
  effect(() => {
    runs++;
    seen = `${Object.keys(state).join(',')} b=${state.b}`;
  });
  Object.defineProperty(state, 'b', {value: 2, ...data});
  out('vue   effect runs after defineProperty', runs);
  out('vue   what the effect last saw', seen);
  out('vue   live read state.b', state.b);

  const store = createClassyStore<Record<string, unknown>>({a: 1});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  snapshot(store);
  Object.defineProperty(store, 'b', {value: 2, ...data});
  out('ours  sync subscriber calls after defineProperty', calls);
  out('ours  live read store.b', store.b);
  out('ours  snapshot(store).b', String(snapshot(store).b));
}

section('finding 45: redefining a property that holds an object');
{
  const state = reactive<{child: {n: number} | number}>({child: {n: 1}});
  const other = {n: 2};
  (state.child as {n: number}).n;
  Object.defineProperty(state, 'child', {value: other, ...data});
  out(
    'vue   state.child.n after redefining to another object',
    (state.child as {n: number}).n,
  );
  Object.defineProperty(state, 'child', {value: 7, ...data});
  out('vue   state.child after redefining to 7', state.child);

  const store = createClassyStore<{child: {n: number} | number}>({
    child: {n: 1},
  });
  (store.child as {n: number}).n;
  Object.defineProperty(store, 'child', {value: other, ...data});
  out(
    'ours  store.child.n after redefining to another object',
    (store.child as {n: number}).n,
  );
  Object.defineProperty(store, 'child', {value: 7, ...data});
  out('ours  store.child after redefining to 7', store.child);
}

section('findings 45 and 71: defineProperty on a list');
{
  const list = reactive<unknown[]>([{id: 1}, {id: 2}, {id: 3}]);
  let runs = 0;
  effect(() => {
    runs++;
    list.length;
    list[2];
  });
  Object.defineProperty(list, 'length', {value: 1});
  out('vue   list[2] after defining length = 1', String(list[2]));
  out('vue   effect runs', runs);
  Object.defineProperty(list, 0, {value: 7, ...data});
  out('vue   list[0] after redefining it to 7', list[0]);

  const store = createClassyStore<{rows: unknown[]}>({
    rows: [{id: 1}, {id: 2}, {id: 3}],
  });
  store.rows[2];
  Object.defineProperty(store.rows, 'length', {value: 1});
  out(
    'ours  rows[2] after defining length = 1',
    attempt(() => JSON.stringify(store.rows[2])),
  );
  Object.defineProperty(store.rows, 0, {value: 7, ...data});
  out(
    'ours  rows[0] after redefining it to 7',
    attempt(() => JSON.stringify(store.rows[0])),
  );
  out(
    'ours  snapshot(store).rows[0]',
    attempt(() => JSON.stringify(snapshot(store).rows[0])),
  );
}
```

Output:

```text

# finding 1: Object.defineProperty adds a key through the proxy
vue   effect runs after defineProperty                     1
vue   what the effect last saw                             a b=undefined
vue   live read state.b                                    2
ours  sync subscriber calls after defineProperty           0
ours  live read store.b                                    2
ours  snapshot(store).b                                    undefined

# finding 45: redefining a property that holds an object
vue   state.child.n after redefining to another object     2
vue   state.child after redefining to 7                    7
ours  store.child.n after redefining to another object     1
ours  store.child after redefining to 7                    {"n":1}

# findings 45 and 71: defineProperty on a list
vue   list[2] after defining length = 1                    undefined
vue   effect runs                                          1
vue   list[0] after redefining it to 7                     7
ours  rows[2] after defining length = 1                    {"id":3}
ours  rows[0] after redefining it to 7                     {"id":1}
ours  snapshot(store).rows[0]                              7
```

### Port 4: frozen, sealed and read-only

`04-frozen.ts`:

```ts
import {isReactive, reactive} from '@vue/reactivity';
import {createClassyStore} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

section('a frozen object given to a reactive parent');
{
  const frozen = Object.freeze({nested: {n: 1}});
  const state = reactive({config: frozen});
  out('vue   state.config === frozen', state.config === frozen);
  out('vue   isReactive(state.config.nested)', isReactive(state.config.nested));
  out(
    'vue   reactive(Object.seal({a: 1})) is reactive',
    isReactive(reactive(Object.seal({a: 1}))),
  );
  out(
    'vue   reactive(Object.preventExtensions({a: 1})) is reactive',
    isReactive(reactive(Object.preventExtensions({a: 1}))),
  );

  const store = createClassyStore({
    config: frozen,
    sealed: Object.seal({a: {n: 1}}),
  });
  out('ours  store.config === frozen', store.config === frozen);
  out('ours  store.config.nested.n', store.config.nested.n);
  let calls = 0;
  const {subscribe} = await import('<repo>/packages/classy-store/src/index.ts');
  subscribe(store, () => calls++, {sync: true});
  store.sealed.a.n = 2;
  out('ours  a write under a sealed object notifies', calls);
}

section('finding 46: the raw object is frozen behind the proxy');
{
  const raw = {config: {nested: {n: 1}}};
  const state = reactive(raw);
  const before = state.config;
  Object.freeze(raw.config);
  out(
    'vue   state.config.nested.n, read again from the parent',
    attempt(() => state.config.nested.n),
  );
  out('vue   isReactive(state.config) now', isReactive(state.config));
  out(
    'vue   nested.n through the proxy taken before',
    attempt(() => before.nested.n),
  );

  const ourRaw = {config: {nested: {n: 1}}};
  const store = createClassyStore(ourRaw);
  Object.freeze(ourRaw.config);
  out(
    'ours  store.config.nested.n',
    attempt(() => store.config.nested.n),
  );
}

section('Object.freeze through the proxy');
{
  const state = reactive({config: {nested: {n: 1}}});
  const config = state.config;
  Object.freeze(config);
  out(
    'vue   nested.n through the frozen proxy',
    attempt(() => config.nested.n),
  );
  out(
    'vue   state.config.nested.n, read again from the parent',
    attempt(() => state.config.nested.n),
  );

  const store = createClassyStore({config: {nested: {n: 1}}});
  const ourConfig = store.config;
  Object.freeze(ourConfig);
  out(
    'ours  nested.n through the frozen proxy',
    attempt(() => ourConfig.nested.n),
  );
  out(
    'ours  store.config.nested.n',
    attempt(() => store.config.nested.n),
  );
}

section('a read-only property that holds an object');
{
  const make = () => {
    const raw = {} as {child: {n: number}};
    Object.defineProperty(raw, 'child', {value: {n: 1}, enumerable: true});
    return raw;
  };
  out(
    'vue   reactive(raw).child.n',
    attempt(() => reactive(make()).child.n),
  );
  out(
    'ours  createClassyStore(raw).child.n',
    attempt(() => createClassyStore(make()).child.n),
  );
}
```

Output:

```text

# a frozen object given to a reactive parent
vue   state.config === frozen                              true
vue   isReactive(state.config.nested)                      false
vue   reactive(Object.seal({a: 1})) is reactive            false
vue   reactive(Object.preventExtensions({a: 1})) is reactive false
ours  store.config === frozen                              true
ours  store.config.nested.n                                1
ours  a write under a sealed object notifies               1

# finding 46: the raw object is frozen behind the proxy
vue   state.config.nested.n, read again from the parent    1
vue   isReactive(state.config) now                         false
vue   nested.n through the proxy taken before              throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
ours  store.config.nested.n                                throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property

# Object.freeze through the proxy
vue   nested.n through the frozen proxy                    throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
vue   state.config.nested.n, read again from the parent    1
ours  nested.n through the frozen proxy                    1
ours  store.config.nested.n                                1

# a read-only property that holds an object
vue   reactive(raw).child.n                                throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
ours  createClassyStore(raw).child.n                       1
```

### Port 5: native `Map` and `Set`

`05-native-collections.ts`:

```ts
import {effect, isReactive, reactive, readonly, toRaw} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
} from '<repo>/packages/classy-store/src/index.ts';
import {reactiveSet} from '<repo>/packages/classy-store/src/collections/index.ts';
import {attempt, out, section} from './helpers';

section(
  'finding 12: a native Set and Map with an object member, looked up by raw object and by proxy',
);
{
  const row = {id: 1};
  const state = reactive({
    list: [row],
    set: new Set([row]),
    map: new Map([[row, 'a']]),
  });
  out('vue   state.set instanceof Set', state.set instanceof Set);
  out('vue   set.has(row)', state.set.has(row));
  out('vue   set.has(list[0])', state.set.has(state.list[0]));
  out('vue   map.get(row)', state.map.get(row));
  out('vue   map.get(list[0])', state.map.get(state.list[0]));
  out(
    'vue   [...set][0] === list[0] (members come out reactive)',
    [...state.set][0] === state.list[0],
  );
  state.set.add(state.list[0]);
  out('vue   size after set.add(list[0])', state.set.size);
  out('vue   the raw set holds the raw row', [...toRaw(state.set)][0] === row);
  let runs = 0;
  effect(() => {
    runs++;
    state.set.has(row);
  });
  state.set.delete(state.list[0]);
  out('vue   effect on set.has(row) re-ran after delete by proxy', runs === 2);
  state.map.get(row);
  state.map.set(state.list[0], 'b');
  out('vue   map.size after map.set(list[0], "b")', state.map.size);

  const store = createClassyStore({
    list: [row],
    set: new Set([row]),
    tags: reactiveSet([row]),
  });
  out('ours  native set.has(row)', store.set.has(row));
  out('ours  native set.has(list[0])', store.set.has(store.list[0]));
  out('ours  reactiveSet.has(row)', store.tags.has(row));
  out('ours  reactiveSet.has(list[0])', store.tags.has(store.list[0]));
  out(
    'ours  reactiveSet.has(snapshot(store).list[0])',
    store.tags.has(snapshot(store).list[0]),
  );
  out(
    'ours  store.tags instanceof Set',
    (store.tags as unknown) instanceof Set,
  );
}

section('finding 33: +0 and -0');
{
  const zeros = reactive(new Set([0]));
  zeros.add(-0);
  out('vue   new Set([0]) then add(-0): size', zeros.size);
  const ours = createClassyStore({set: reactiveSet([0])});
  ours.set.add(-0);
  out('ours  reactiveSet([0]) then add(-0): size', ours.set.size);
}

section('finding 34: one object given in two forms');
{
  const row = {id: 1};
  const proxy = reactive(row);
  const both = reactive(new Set<object>([row, proxy]));
  out('vue   new Set([raw, proxy]): size', both.size);
  both.delete(proxy);
  out(
    'vue   after delete(proxy): size, has(raw), has(proxy)',
    `${both.size}, ${both.has(row)}, ${both.has(proxy)}`,
  );
  const added = reactive(new Set<object>());
  added.add(row);
  added.add(proxy);
  out('vue   add(raw) then add(proxy): size', added.size);

  const ourRow = {id: 1};
  const holder = createClassyStore({row: ourRow});
  const ours = createClassyStore({
    set: reactiveSet<object>([ourRow, holder.row]),
  });
  out('ours  reactiveSet([raw, proxy]): size', ours.set.size);
  ours.set.delete(ourRow);
  out(
    'ours  after delete(raw): size, has(raw)',
    `${ours.set.size}, ${ours.set.has(ourRow)}`,
  );
}

section('a read-only view of a Map');
{
  const view = readonly(reactive(new Map([['a', {n: 1}]])));
  out(
    'vue   readonly map.set("b", ...) returns the map, size',
    attempt(
      () => ((view as Map<string, {n: number}>).set('b', {n: 2}), view.size),
    ),
  );
  out('vue   isReactive(view.get("a"))', isReactive(view.get('a')));
}
```

Output:

```text

# finding 12: a native Set and Map with an object member, looked up by raw object and by proxy
vue   state.set instanceof Set                             true
vue   set.has(row)                                         true
vue   set.has(list[0])                                     true
vue   map.get(row)                                         a
vue   map.get(list[0])                                     a
vue   [...set][0] === list[0] (members come out reactive)  true
vue   size after set.add(list[0])                          1
vue   the raw set holds the raw row                        true
vue   effect on set.has(row) re-ran after delete by proxy  true
vue   map.size after map.set(list[0], "b")                 1
ours  native set.has(row)                                  true
ours  native set.has(list[0])                              false
ours  reactiveSet.has(row)                                 true
ours  reactiveSet.has(list[0])                             true
ours  reactiveSet.has(snapshot(store).list[0])             true
ours  store.tags instanceof Set                            false

# finding 33: +0 and -0
vue   new Set([0]) then add(-0): size                      1
ours  reactiveSet([0]) then add(-0): size                  2

# finding 34: one object given in two forms
vue   new Set([raw, proxy]): size                          2
[Vue warn] Reactive Set contains both the raw and reactive versions of the same object, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.
vue   after delete(proxy): size, has(raw), has(proxy)      1, true, true
vue   add(raw) then add(proxy): size                       1
ours  reactiveSet([raw, proxy]): size                      2
ours  after delete(raw): size, has(raw)                    1, true

# a read-only view of a Map
[Vue warn] Set operation on key "b" failed: target is readonly. Map(1) {
  "a": {
    n: 1,
  },
}
vue   readonly map.set("b", ...) returns the map, size     1
vue   isReactive(view.get("a"))                            true
```

### Port 6: a write to `length`, and how many times a reader runs

`06-array-length.ts`:

```ts
import {effect, reactive} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {out, section} from './helpers';

section('a write to an array length');
{
  const list = reactive<({id: number} | undefined)[]>([
    {id: 1},
    {id: 2},
    {id: 3},
  ]);
  const runs = {length: 0, first: 0, last: 0, iterate: 0};
  effect(() => (runs.length++, list.length));
  effect(() => (runs.first++, list[0]));
  effect(() => (runs.last++, list[2]));
  effect(() => {
    runs.iterate++;
    for (const row of list) row?.id;
  });
  const read = () => JSON.stringify(runs);
  out('vue   effect runs at start', read());
  list.length = 1;
  out('vue   after list.length = 1', read());
  list.length = 1;
  out('vue   after list.length = 1 again', read());
  list[4] = {id: 5};
  out('vue   after list[4] = row (past the end)', read());
  list.push({id: 6}, {id: 7}, {id: 8});
  out('vue   after push of three rows', read());
  list.reverse();
  out('vue   after reverse() of 8 slots', read());
  list.sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0));
  out('vue   after sort() of 8 slots', read());

  const store = createClassyStore({rows: [{id: 1}, {id: 2}, {id: 3}]});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const last = store.rows[2];
  const before = snapshot(store).rows;
  store.rows.length = 1;
  out('ours  sync calls after rows.length = 1', calls);
  out(
    'ours  snapshot rows length, first row shared',
    `${snapshot(store).rows.length}, ${snapshot(store).rows[0] === before[0]}`,
  );
  last.id = 99;
  out('ours  sync calls after a write to the removed row', calls);
  store.rows.push({id: 6}, {id: 7}, {id: 8});
  out('ours  sync calls after push of three rows', calls);
  store.rows.reverse();
  out('ours  sync calls after reverse()', calls);
  store.rows.sort((a, b) => a.id - b.id);
  out('ours  sync calls after sort()', calls);
}
```

Output:

```text

# a write to an array length
vue   effect runs at start                                 {"length":1,"first":1,"last":1,"iterate":1}
vue   after list.length = 1                                {"length":2,"first":1,"last":2,"iterate":2}
vue   after list.length = 1 again                          {"length":2,"first":1,"last":2,"iterate":2}
vue   after list[4] = row (past the end)                   {"length":3,"first":1,"last":2,"iterate":3}
vue   after push of three rows                             {"length":4,"first":1,"last":2,"iterate":4}
vue   after reverse() of 8 slots                           {"length":4,"first":2,"last":3,"iterate":12}
vue   after sort() of 8 slots                              {"length":4,"first":3,"last":3,"iterate":17}
ours  sync calls after rows.length = 1                     1
ours  snapshot rows length, first row shared               1, true
ours  sync calls after a write to the removed row          1
ours  sync calls after push of three rows                  2
ours  sync calls after reverse()                           3
ours  sync calls after sort()                              4
```

### Port 7: self-reference, and what the raw object holds

`07-self-reference-and-raw.ts`:

```ts
import {computed, effect, isReactive, reactive, toRaw} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

section('finding 8 and 13: an object that refers to itself');
{
  const state = reactive<{n: number; other: number; self?: unknown}>({
    n: 1,
    other: 0,
  });
  state.self = state;
  out('vue   state.self === state', state.self === state);
  out(
    'vue   the raw object holds itself raw',
    toRaw(state).self === toRaw(state),
  );
  let runs = 0;
  const double = computed(() => (runs++, state.n * 2));
  double.value;
  state.other = 1;
  double.value;
  out('vue   computed runs after a write to a field it never read', runs);

  const store = createClassyStore<{n: number; self?: unknown}>({n: 1});
  store.self = store;
  out('ours  store.self === store', store.self === store);
  out(
    'ours  snapshot(store)',
    attempt(() => typeof snapshot(store)),
  );
}

section(
  'finding 10: what the raw object holds after an assignment or a reverse',
);
{
  const from = reactive({row: {id: 1}});
  const to = reactive<{row?: {id: number}}>({});
  to.row = from.row;
  out(
    'vue   raw target holds a proxy after to.row = from.row',
    isReactive(toRaw(to).row),
  );
  const list = reactive([{id: 1}, {id: 2}]);
  list.reverse();
  out(
    'vue   raw list holds a proxy after reverse()',
    toRaw(list).some(isReactive),
  );

  const rawFrom = {row: {id: 1}};
  const rawTo: {row?: {id: number}} = {};
  const ourFrom = createClassyStore(rawFrom);
  const ourTo = createClassyStore(rawTo);
  ourTo.row = ourFrom.row;
  out(
    'ours  raw target holds the proxy after to.row = from.row',
    rawTo.row === ourFrom.row && rawTo.row !== rawFrom.row,
  );
  const rawList = [{id: 1}, {id: 2}];
  const first = rawList[0];
  const ourList = createClassyStore({list: rawList});
  ourList.list.reverse();
  out(
    'ours  raw list holds a proxy after reverse()',
    rawList[1] !== first && rawList[1] === ourList.list[1],
  );
}

section(
  'finding 9: a class instance that is already reactive, placed in another parent by its raw object',
);
{
  class Inner {
    n = 0;
    inc() {
      this.n++;
    }
  }
  const raw = new Inner();
  const inner = reactive(raw);
  const outer = reactive({inner: raw});
  out('vue   outer.inner === inner', outer.inner === inner);
  let runs = 0;
  effect(() => (runs++, outer.inner.n));
  outer.inner.inc();
  inner.inc();
  out('vue   effect runs after two inc() calls', runs);

  const ourRaw = new Inner();
  const ourInner = createClassyStore(ourRaw);
  const ourOuter = createClassyStore({inner: ourRaw});
  out('ours  outer.inner === inner', (ourOuter.inner as unknown) === ourInner);
  let outerCalls = 0;
  let innerCalls = 0;
  subscribe(ourOuter, () => outerCalls++, {sync: true});
  subscribe(ourInner, () => innerCalls++, {sync: true});
  ourOuter.inner.inc();
  out(
    'ours  calls after outer.inner.inc(): outer, inner',
    `${outerCalls}, ${innerCalls}`,
  );
}

section('finding 11: a write through the raw object');
{
  const raw = {child: {n: 0}};
  const state = reactive(raw);
  let runs = 0;
  effect(() => (runs++, state.child.n));
  raw.child.n = 5;
  out('vue   live read, effect runs', `${state.child.n}, ${runs}`);
}
```

Output:

```text

# finding 8 and 13: an object that refers to itself
vue   state.self === state                                 true
vue   the raw object holds itself raw                      true
vue   computed runs after a write to a field it never read 1
ours  store.self === store                                 true
ours  snapshot(store)                                      throws Error: @codebelt/classy-store: circular reference detected in snapshot

# finding 10: what the raw object holds after an assignment or a reverse
vue   raw target holds a proxy after to.row = from.row     false
vue   raw list holds a proxy after reverse()               false
ours  raw target holds the proxy after to.row = from.row   true
ours  raw list holds a proxy after reverse()               true

# finding 9: a class instance that is already reactive, placed in another parent by its raw object
vue   outer.inner === inner                                true
vue   effect runs after two inc() calls                    3
ours  outer.inner === inner                                false
ours  calls after outer.inner.inc(): outer, inner          0, 0

# finding 11: a write through the raw object
vue   live read, effect runs                               5, 1
```

### Port 8: class instances, arrow methods, `#private` fields, a base class, a setter

`08-class-instances.ts`:

```ts
import {
  effect,
  isReactive,
  markRaw,
  reactive,
  shallowReactive,
} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

section(
  'a class instance is proxied by default; an arrow method and a #private field',
);
{
  class Counter {
    count = 0;
    #secret = 1;
    inc() {
      this.count++;
    }
    arrow = () => {
      this.count++;
    };
    get secret() {
      return this.#secret;
    }
  }
  const counter = reactive(new Counter());
  let runs = 0;
  effect(() => (runs++, counter.count));
  counter.inc();
  out('vue   effect runs after inc()', runs);
  counter.arrow();
  out(
    'vue   effect runs after arrow(), live count',
    `${runs}, ${counter.count}`,
  );
  out(
    'vue   counter.secret',
    attempt(() => counter.secret),
  );
  const nested = reactive({inner: new Counter()});
  out('vue   a nested class instance is reactive', isReactive(nested.inner));
  out(
    'vue   markRaw(instance) nested is reactive',
    isReactive(reactive({inner: markRaw(new Counter())}).inner),
  );
  out(
    'vue   shallowReactive: nested is reactive',
    isReactive(shallowReactive({inner: new Counter()}).inner),
  );

  const store = createClassyStore(new Counter());
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  store.arrow();
  out('ours  sync calls after arrow(), live count', `${calls}, ${store.count}`);
  out(
    'ours  store.secret',
    attempt(() => store.secret),
  );
  out(
    'ours  snapshot(store).secret',
    attempt(() => snapshot(store).secret),
  );
}

section('a base class whose constructor returns the proxy');
{
  class VueBase {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the point of the test
      return reactive(this);
    }
  }
  class Derived extends VueBase {
    count = 0;
    items = [{id: 1}];
    #secret = 1;
    arrow = () => {
      this.count++;
    };
    bump() {
      this.#secret++;
    }
    get secret() {
      return this.#secret;
    }
  }
  const derived = new Derived();
  out('vue   new Derived() is reactive', isReactive(derived));
  let runs = 0;
  let secretRuns = 0;
  effect(() => (runs++, derived.count));
  effect(() => (secretRuns++, derived.secret));
  derived.arrow();
  out('vue   effect runs after arrow()', runs);
  derived.bump();
  out(
    'vue   secret after bump(), runs of the effect that read it',
    `${attempt(() => derived.secret)}, ${secretRuns}`,
  );

  class OurBase {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the point of the test
      return createClassyStore(this);
    }
  }
  class Todo extends OurBase {
    count = 0;
    items = [{id: 1}];
    #secret = 1;
    arrow = () => {
      this.count++;
    };
    bump() {
      this.#secret++;
    }
    get secret() {
      return this.#secret;
    }
    get double() {
      return this.count * 2;
    }
  }
  const todo = new Todo();
  let calls = 0;
  subscribe(todo, () => calls++, {sync: true});
  out(
    'ours  snapshot before any write: count, items frozen',
    attempt(
      () => `${snapshot(todo).count}, ${Object.isFrozen(snapshot(todo).items)}`,
    ),
  );
  todo.arrow();
  out(
    'ours  sync calls after arrow(), live count, double',
    `${calls}, ${todo.count}, ${todo.double}`,
  );
  out(
    'ours  snapshot after: count, double, items frozen',
    attempt(
      () =>
        `${snapshot(todo).count}, ${snapshot(todo).double}, ${Object.isFrozen(snapshot(todo).items)}`,
    ),
  );
  todo.bump();
  out(
    'ours  live secret after bump(), sync calls',
    `${attempt(() => todo.secret)}, ${calls}`,
  );
  out(
    'ours  snapshot(todo).secret',
    attempt(() => snapshot(todo).secret),
  );
  todo.items.push({id: 2});
  out(
    'ours  sync calls after items.push, snapshot items length',
    `${calls}, ${snapshot(todo).items.length}`,
  );
}

section('finding 43: a setter that writes two fields');
{
  class Person {
    first = 'a';
    last = 'b';
    set full(value: string) {
      [this.first, this.last] = value.split(' ');
    }
  }
  const person = reactive(new Person());
  let runs = 0;
  let keyRuns = 0;
  effect(() => (runs++, person.first + person.last));
  effect(() => (keyRuns++, Object.keys(person)));
  person.full = 'x y';
  out('vue   runs of the effect that reads both fields', runs);
  out('vue   runs of an effect that reads only Object.keys', keyRuns);

  const store = createClassyStore(new Person());
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  store.full = 'x y';
  out('ours  sync calls after the setter', calls);
}
```

Output:

```text

# a class instance is proxied by default; an arrow method and a #private field
vue   effect runs after inc()                              2
vue   effect runs after arrow(), live count                2, 2
vue   counter.secret                                       throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
vue   a nested class instance is reactive                  true
vue   markRaw(instance) nested is reactive                 false
vue   shallowReactive: nested is reactive                  false
ours  sync calls after arrow(), live count                 0, 1
ours  store.secret                                         throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
ours  snapshot(store).secret                               throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')

# a base class whose constructor returns the proxy
vue   new Derived() is reactive                            true
vue   effect runs after arrow()                            2
vue   secret after bump(), runs of the effect that read it 2, 1
ours  snapshot before any write: count, items frozen       0, false
ours  sync calls after arrow(), live count, double         1, 1, 2
ours  snapshot after: count, double, items frozen          1, 2, false
ours  live secret after bump(), sync calls                 2, 1
ours  snapshot(todo).secret                                throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
ours  sync calls after items.push, snapshot items length   2, 2

# finding 43: a setter that writes two fields
vue   runs of the effect that reads both fields            3
vue   runs of an effect that reads only Object.keys        2
ours  sync calls after the setter                          2
```

### Port 9: what a derived value records, cycles, and delivery

`09-computed-and-loops.ts`:

```ts
import {computed, effect, reactive, stop} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

section('finding 36: a derived value that reads another object');
{
  const a = reactive({n: 1});
  const b = reactive({n: 10});
  const sum = computed(() => a.n + b.n);
  sum.value;
  b.n = 20;
  out('vue   sum after the other object changed', sum.value);

  const other = createClassyStore({n: 10});
  class Sum {
    n = 1;
    get total() {
      return this.n + other.n;
    }
  }
  const store = createClassyStore(new Sum());
  store.total;
  other.n = 20;
  out('ours  live total after the other store changed', store.total);
  out('ours  snapshot total', snapshot(store).total);
}

section("finding 36: a derived value that catches another one's error");
{
  const state = reactive({fail: true});
  const strict = computed(() => {
    if (state.fail) throw new Error('no');
    return 'ok';
  });
  const safe = computed(() => {
    try {
      return strict.value;
    } catch {
      return 'fallback';
    }
  });
  out('vue   safe while strict throws', safe.value);
  state.fail = false;
  out('vue   safe after strict stops throwing', safe.value);

  class Guarded {
    fail = true;
    get strict() {
      if (this.fail) throw new Error('no');
      return 'ok';
    }
    get safe() {
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  const store = createClassyStore(new Guarded());
  out('ours  safe while strict throws', store.safe);
  store.fail = false;
  out('ours  live safe after strict stops throwing', store.safe);
}

section('finding 37: a chain of three, then a write to an unrelated field');
{
  const state = reactive({x: 1, unrelated: 0});
  const runs = {a: 0, b: 0, c: 0};
  const a = computed(() => (runs.a++, state.x));
  const b = computed(() => (runs.b++, a.value + 1));
  const c = computed(() => (runs.c++, b.value + 1));
  c.value;
  state.unrelated = 1;
  c.value;
  out('vue   runs after the unrelated write', JSON.stringify(runs));
  const positive = computed(() => (runs.a++, state.x > 0));
  const label = computed(() => (runs.b++, positive.value ? 'yes' : 'no'));
  runs.a = 0;
  runs.b = 0;
  label.value;
  state.x = 5;
  label.value;
  out(
    'vue   x: 1 to 5 under "x > 0": runs of the test, runs of its reader',
    `${runs.a}, ${runs.b}`,
  );
}

section('finding 38: a cycle between two derived values');
{
  const x: {value: number} = computed(() => y.value + 1);
  const y: {value: number} = computed(() => x.value + 1);
  out(
    'vue   x.value',
    attempt(() => String(x.value)),
  );

  class Cycle {
    get x(): number {
      return this.y + 1;
    }
    get y(): number {
      return this.x + 1;
    }
  }
  const store = createClassyStore(new Cycle());
  out(
    'ours  live store.x',
    attempt(() => store.x),
  );
  out(
    'ours  snapshot(store).x',
    attempt(() => snapshot(store).x),
  );
}

section('finding 39: a derived value that writes');
{
  const state = reactive({n: 0});
  let runs = 0;
  const writer = computed(() => (runs++, state.n++, state.n));
  out('vue   three reads', `${writer.value}, ${writer.value}, ${writer.value}`);
  out('vue   runs', runs);
}

section('finding 18: an effect that writes what it reads');
{
  const state = reactive({n: 0});
  let runs = 0;
  effect(() => {
    runs++;
    if (state.n < 5) state.n++;
  });
  out('vue   runs at start, n', `${runs}, ${state.n}`);
  state.n = 0;
  out('vue   runs after state.n = 0, n', `${runs}, ${state.n}`);
}

section('finding 20: an effect stopped while another one is being delivered');
{
  const state = reactive({n: 0});
  let secondRuns = 0;
  // Effects are delivered in the order they subscribed.
  const first = effect(() => {
    state.n;
    if (state.n === 1) stop(second);
  });
  const second = effect(() => (secondRuns++, state.n));
  state.n = 1;
  out('vue   runs of the stopped effect (1 is the first run)', secondRuns);
  void first;
}
```

Output:

```text

# finding 36: a derived value that reads another object
vue   sum after the other object changed                   21
ours  live total after the other store changed             11
ours  snapshot total                                       21

# finding 36: a derived value that catches another one's error
vue   safe while strict throws                             fallback
vue   safe after strict stops throwing                     ok
ours  safe while strict throws                             fallback
ours  live safe after strict stops throwing                fallback

# finding 37: a chain of three, then a write to an unrelated field
vue   runs after the unrelated write                       {"a":1,"b":1,"c":1}
vue   x: 1 to 5 under "x > 0": runs of the test, runs of its reader 2, 1

# finding 38: a cycle between two derived values
vue   x.value                                              NaN
ours  live store.x                                         throws Error: @codebelt/classy-store: circular computed getter dependency: x → y → x
ours  snapshot(store).x                                    throws RangeError: Maximum call stack size exceeded.

# finding 39: a derived value that writes
vue   three reads                                          1, 2, 3
vue   runs                                                 3

# finding 18: an effect that writes what it reads
vue   runs at start, n                                     1, 1
vue   runs after state.n = 0, n                            2, 1

# finding 20: an effect stopped while another one is being delivered
vue   runs of the stopped effect (1 is the first run)      1
```

### Port 10: other edges

`10-edges.ts`:

```ts
import {computed, effect, isReactive, reactive, toRaw} from '@vue/reactivity';
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {attempt, out, section} from './helpers';

section(
  'finding 26: a dependency follows the property, a subscription follows the object',
);
{
  const state = reactive({user: {name: 'a'}});
  let runs = 0;
  effect(() => (runs++, state.user.name));
  state.user = {name: 'b'};
  state.user.name = 'c';
  out(
    'vue   effect runs after replacing the user, then renaming the new one',
    runs,
  );

  const store = createClassyStore({user: {name: 'a'}});
  let calls = 0;
  subscribe(store.user, () => calls++, {sync: true});
  store.user = {name: 'b'};
  store.user.name = 'c';
  out('ours  calls of subscribe(store.user) after the same two writes', calls);
}

section('findings 50, 51, 48, 63, 40: other edges');
{
  const state = reactive({child: {n: 1}});
  out(
    'vue   getOwnPropertyDescriptor(state, "child").value is reactive',
    isReactive(Object.getOwnPropertyDescriptor(state, 'child')?.value),
  );
  out(
    'vue   structuredClone(state)',
    attempt(() => typeof structuredClone(state)),
  );
  out(
    'vue   structuredClone(toRaw(state))',
    attempt(() => JSON.stringify(structuredClone(toRaw(state)))),
  );
  const target = reactive<Record<string, unknown>>({});
  Object.assign(target, JSON.parse('{"__proto__": {"polluted": true}}'));
  out(
    'vue   Object.assign(state, {"__proto__": ...}) swaps the prototype',
    target.polluted === true,
  );
  out(
    'vue   reactive(new Uint8Array(2)) is reactive',
    isReactive(reactive(new Uint8Array(2))),
  );
  out(
    'vue   reactive(new Date()) is reactive',
    isReactive(reactive(new Date())),
  );
  const made = computed(() => ({a: 1}));
  made.value.a = 2;
  out(
    'vue   a computed result changed by the reader stays changed',
    made.value.a,
  );
}

section(
  'a getter that reads only a #private field, on a store made in a base constructor',
);
{
  class Base {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the point of the test
      return createClassyStore(this);
    }
  }
  class Vault extends Base {
    #secret = 1;
    bump() {
      this.#secret++;
    }
    get secret() {
      return this.#secret;
    }
  }
  const vault = new Vault();
  const before = vault.secret;
  vault.bump();
  out('ours  secret before bump(), after bump()', `${before}, ${vault.secret}`);
}

section('telling a class from a method: the "prototype" property');
{
  class Model {}
  function legacy() {}
  const describe = (fn: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
    return descriptor
      ? `prototype writable=${descriptor.writable}`
      : 'no prototype';
  };
  out('class Model {}', describe(Model));
  out('function legacy() {}', describe(legacy));
  out(
    'arrow function',
    describe(() => {}),
  );
  out('shorthand method', describe({method() {}}.method));
  out('Date', describe(Date));
}
```

Output:

```text

# finding 26: a dependency follows the property, a subscription follows the object
vue   effect runs after replacing the user, then renaming the new one 3
ours  calls of subscribe(store.user) after the same two writes 0

# findings 50, 51, 48, 63, 40: other edges
vue   getOwnPropertyDescriptor(state, "child").value is reactive false
vue   structuredClone(state)                               throws DOMException: The object can not be cloned.
vue   structuredClone(toRaw(state))                        {"child":{"n":1}}
vue   Object.assign(state, {"__proto__": ...}) swaps the prototype true
vue   reactive(new Uint8Array(2)) is reactive              false
vue   reactive(new Date()) is reactive                     false
vue   a computed result changed by the reader stays changed 2

# a getter that reads only a #private field, on a store made in a base constructor
ours  secret before bump(), after bump()                   1, 1

# telling a class from a method: the "prototype" property
class Model {}                                             prototype writable=false
function legacy() {}                                       prototype writable=true
arrow function                                             no prototype
shorthand method                                           no prototype
Date                                                       prototype writable=false
```

### Port 11: timings (indicative)

`11-timings.ts`:

```ts
import {computed, reactive} from '@vue/reactivity';
import {createClassyStore} from '<repo>/packages/classy-store/src/index.ts';

// Indicative only: one machine, Bun (JavaScriptCore), best of seven rounds.
const best = (
  label: string,
  iterations: number,
  per: number,
  run: () => void,
) => {
  let fastest = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 7; round++) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) run();
    fastest = Math.min(fastest, performance.now() - start);
  }
  console.log(
    `${label.padEnd(62)} ${((fastest * 1e6) / iterations / per).toFixed(1)} ns`,
  );
};

let sink = 0;

{
  const raw = {count: 1};
  const vue = reactive({count: 1});
  const ours = createClassyStore({count: 1});
  best('read a number field, raw object', 5e6, 1, () => (sink += raw.count));
  best('read a number field, vue reactive', 5e6, 1, () => (sink += vue.count));
  best('read a number field, our store', 5e6, 1, () => (sink += ours.count));
}

{
  const rows = (n: number) => Array.from({length: n}, (_, value) => ({value}));
  const vue = reactive({rows: rows(1000)});
  const vueReduce = computed(() =>
    vue.rows.reduce((sum, row) => sum + row.value, 0),
  );
  const vueLoop = computed(() => {
    const list = vue.rows;
    let sum = 0;
    for (let index = 0; index < list.length; index++) sum += list[index].value;
    return sum;
  });
  class Table {
    rows = rows(1000);
    get viaReduce() {
      return this.rows.reduce((sum, row) => sum + row.value, 0);
    }
    get viaLoop() {
      const list = this.rows;
      let sum = 0;
      for (let index = 0; index < list.length; index++)
        sum += list[index].value;
      return sum;
    }
  }
  const ours = createClassyStore(new Table());
  let tick = 0;
  best(
    'sum 1,000 rows after one changed, per row: vue reduce',
    2000,
    1000,
    () => {
      vue.rows[tick++ % 1000].value++;
      sink += vueReduce.value;
    },
  );
  best(
    'sum 1,000 rows after one changed, per row: vue index loop',
    2000,
    1000,
    () => {
      vue.rows[tick++ % 1000].value++;
      sink += vueLoop.value;
    },
  );
  best(
    'sum 1,000 rows after one changed, per row: ours reduce',
    2000,
    1000,
    () => {
      ours.rows[tick++ % 1000].value++;
      sink += ours.viaReduce;
    },
  );
  best(
    'sum 1,000 rows after one changed, per row: ours index loop',
    2000,
    1000,
    () => {
      ours.rows[tick++ % 1000].value++;
      sink += ours.viaLoop;
    },
  );
  const plain = rows(1000);
  best('sum 1,000 rows, per row: plain array reduce', 2000, 1000, () => {
    sink += plain.reduce((sum, row) => sum + row.value, 0);
  });
}

{
  const vue = reactive({list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]});
  const ours = createClassyStore({list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]});
  const vueList = vue.list;
  const ourList = ours.list;
  best(
    'list.includes(10) on ten numbers: vue',
    2e6,
    1,
    () => (sink += vueList.includes(10) ? 1 : 0),
  );
  best(
    'list.includes(10) on ten numbers: ours',
    2e6,
    1,
    () => (sink += ourList.includes(10) ? 1 : 0),
  );
}
console.log(sink > 0 ? 'done' : '');
```

Output:

```text
read a number field, raw object                                1.7 ns
read a number field, vue reactive                              15.9 ns
read a number field, our store                                 31.3 ns
sum 1,000 rows after one changed, per row: vue reduce          75.9 ns
sum 1,000 rows after one changed, per row: vue index loop      220.7 ns
sum 1,000 rows after one changed, per row: ours reduce         126.2 ns
sum 1,000 rows after one changed, per row: ours index loop     135.2 ns
sum 1,000 rows, per row: plain array reduce                    2.1 ns
list.includes(10) on ten numbers: vue                          56.9 ns
list.includes(10) on ten numbers: ours                         920.8 ns
done
```

### Port 12: `DeepReadonly` on a tuple and a `Map` (type check)

`12-types.ts`:

```ts
import type {DeepReadonly} from '@vue/reactivity';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// Finding 14: a tuple stays a tuple.
export const tuple: Equal<
  DeepReadonly<[string, number]>,
  readonly [string, number]
> = true;
// Finding 16: a read-only view of a Map or Set has no mutators in its type.
export const map: Equal<
  DeepReadonly<Map<string, {n: number}>>,
  ReadonlyMap<string, {readonly n: number}>
> = true;
export const set: Equal<DeepReadonly<Set<number>>, ReadonlySet<number>> = true;

declare const view: DeepReadonly<{
  todos: Map<string, {done: boolean}>;
  pair: [string, number];
}>;
// @ts-expect-error no `set` on a read-only map
view.todos.set('a', {done: true});
// @ts-expect-error a tuple has no third element
view.pair[2];
// @ts-expect-error read-only element
view.pair[0] = 'x';
```

Output:

```text
tsc exit code: 0
```

### Sketch A: `has` and `ownKeys` traps, applied to a throwaway copy of `src/`

`patch-copy.py`:

```python
import sys
from pathlib import Path

root = Path(sys.argv[1])

def patch(path, pairs):
    text = path.read_text()
    for old, new in pairs:
        if text.count(old) != 1:
            raise SystemExit(f"{path.name}: expected one match for {old[:50]!r}, found {text.count(old)}")
        text = text.replace(old, new)
    path.write_text(text)

patch(root / "core/ownership.ts", [
    ("  version = 0;\n", "  version = 0;\n  keysVersion = 0;\n"),
])

patch(root / "core/core.ts", [
    # validate the two new kinds of dependency
    ("    } else if (dep.kind === 'computed') {",
     "    } else if ((dep as any).kind === 'has') {\n"
     "      if (Reflect.has((dep as any).target, (dep as any).prop) !== (dep as any).present) return false;\n"
     "    } else if ((dep as any).kind === 'keys') {\n"
     "      if ((dep as any).internal.keysVersion !== (dep as any).keysVersion) return false;\n"
     "    } else if (dep.kind === 'computed') {"),
    # count key additions
    ("      const written = Reflect.set(_target, prop, value);\n",
     "      const hadKey = Object.hasOwn(_target, prop);\n"
     "      const written = Reflect.set(_target, prop, value);\n"
     "      if (written && !hadKey) internal.keysVersion++;\n"),
    # a delete of a missing key is not a write; count key removals
    ("      const deleted = Reflect.deleteProperty(_target, prop);\n      if (deleted) {\n",
     "      const hadKey = Object.hasOwn(_target, prop);\n"
     "      const deleted = Reflect.deleteProperty(_target, prop);\n"
     "      if (deleted && hadKey) {\n        internal.keysVersion++;\n"),
    # the two traps
    ("    deleteProperty(_target, prop) {\n",
     "    has(_target, prop) {\n"
     "      const present = Reflect.has(_target, prop);\n"
     "      const tracker = activeTracker();\n"
     "      if (tracker && tracker.internal === internal)\n"
     "        (tracker.deps as any[]).push({kind: 'has', target: _target, prop, present});\n"
     "      return present;\n"
     "    },\n\n"
     "    ownKeys(_target) {\n"
     "      const tracker = activeTracker();\n"
     "      if (tracker && tracker.internal === internal)\n"
     "        (tracker.deps as any[]).push({kind: 'keys', internal, keysVersion: internal.keysVersion});\n"
     "      return Reflect.ownKeys(_target);\n"
     "    },\n\n"
     "    deleteProperty(_target, prop) {\n"),
])

patch(root / "snapshot/snapshot.ts", [
    ("type GetterDep = {prop: string | symbol; value: unknown};",
     "type GetterDep = {kind?: 'has' | 'keys'; prop: string | symbol; value: unknown};"),
    ("      return value;\n    },\n  };\n\n  const tracked = new Proxy({}, handler);",
     "      return value;\n    },\n"
     "    has(_target, prop) {\n"
     "      const value = Reflect.has(snap, prop);\n"
     "      deps.push({kind: 'has', prop, value});\n"
     "      return value;\n"
     "    },\n"
     "    ownKeys() {\n"
     "      const value = Reflect.ownKeys(snap);\n"
     "      deps.push({kind: 'keys', prop: '', value});\n"
     "      return value;\n"
     "    },\n"
     "  };\n\n"
     "  // The frozen snapshot is the target, so untrapped operations answer for it.\n"
     "  const tracked = new Proxy(snap, handler);"),
    ("  for (const dep of deps) {\n    const currentValue",
     "  for (const dep of deps) {\n"
     "    if (dep.kind === 'has') {\n"
     "      if (Reflect.has(currentSnap, dep.prop) !== dep.value) return false;\n"
     "      continue;\n"
     "    }\n"
     "    if (dep.kind === 'keys') {\n"
     "      const before = dep.value as (string | symbol)[];\n"
     "      const now = Reflect.ownKeys(currentSnap);\n"
     "      if (now.length !== before.length || now.some((key, index) => key !== before[index])) return false;\n"
     "      continue;\n"
     "    }\n"
     "    const currentValue"),
])
print("patched")
```

### Port 13: findings 29, 30, 31 and 41, before and after sketch A

`13-patched-copy.ts`:

```ts
// Runs against a throwaway copy of our source with `has` and `ownKeys` traps added.
import {out, section} from './helpers';

const variant = process.argv[2];
const {createClassyStore, snapshot, subscribe} = await import(
  variant === 'patched'
    ? '../ours-copy/src/index.ts'
    : '<repo>/packages/classy-store/src/index.ts'
);

section(`${variant}: findings 29, 30, 31 and 41`);
class Dict {
  [key: string]: unknown;
  a = 1;
  b = 2;
  get keyCount() {
    return Object.keys(this).length;
  }
  get hasB() {
    return 'b' in this;
  }
  get isDict() {
    return this instanceof Dict;
  }
}
const store = createClassyStore(new Dict());
const read = (from: Dict) =>
  `keyCount=${from.keyCount} hasB=${from.hasB} isDict=${from.isDict}`;
out('start, live', read(store));
out('start, snapshot', read(snapshot(store)));
store.a = 10;
out('after store.a = 10, live', read(store));
out('after store.a = 10, snapshot', read(snapshot(store)));
delete store.b;
out('after delete store.b, live', read(store));
out('after delete store.b, snapshot', read(snapshot(store)));
store.c = 3;
store.b = 5;
out('after adding c and b, live', read(store));
out('after adding c and b, snapshot', read(snapshot(store)));
let calls = 0;
subscribe(store, () => calls++, {sync: true});
delete store.missing;
out('sync calls after delete store.missing', calls);
```

Output:

```text

# current: findings 29, 30, 31 and 41
start, live                                                keyCount=2 hasB=true isDict=true
start, snapshot                                            keyCount=0 hasB=false isDict=false
after store.a = 10, live                                   keyCount=2 hasB=true isDict=true
after store.a = 10, snapshot                               keyCount=0 hasB=false isDict=false
after delete store.b, live                                 keyCount=2 hasB=true isDict=true
after delete store.b, snapshot                             keyCount=0 hasB=false isDict=false
after adding c and b, live                                 keyCount=2 hasB=true isDict=true
after adding c and b, snapshot                             keyCount=0 hasB=false isDict=false
sync calls after delete store.missing                      1

# patched: findings 29, 30, 31 and 41
start, live                                                keyCount=2 hasB=true isDict=true
start, snapshot                                            keyCount=5 hasB=true isDict=true
after store.a = 10, live                                   keyCount=2 hasB=true isDict=true
after store.a = 10, snapshot                               keyCount=5 hasB=true isDict=true
after delete store.b, live                                 keyCount=1 hasB=false isDict=true
after delete store.b, snapshot                             keyCount=4 hasB=false isDict=true
after adding c and b, live                                 keyCount=3 hasB=true isDict=true
after adding c and b, snapshot                             keyCount=6 hasB=true isDict=true
sync calls after delete store.missing                      0
```

### Port 14: a getter that lists the keys of `this`, before and after sketch A

`14-snapshot-keys.ts`:

```ts
// API question 3: what a getter sees when it lists the keys of `this`.
import {reactive} from '@vue/reactivity';
import {attempt, out, section} from './helpers';

const variant = process.argv[2];
const {createClassyStore, snapshot} = await import(
  variant === 'patched'
    ? '../ours-copy/src/index.ts'
    : '<repo>/packages/classy-store/src/index.ts'
);

class Dict {
  a = 1;
  b = 2;
  get entryCount() {
    return Object.entries(this).length;
  }
}
section(variant);
const store = createClassyStore(new Dict());
out('Object.keys(store)', Object.keys(store).join(','));
out('Object.keys(snapshot(store))', Object.keys(snapshot(store)).join(','));
out(
  'live store.entryCount',
  attempt(() => store.entryCount),
);
out(
  'snapshot(store).entryCount',
  attempt(() => snapshot(store).entryCount),
);
if (variant === 'current') {
  const vue = reactive(new Dict());
  out('vue   Object.keys(reactive(new Dict()))', Object.keys(vue).join(','));
  out('vue   reactive(new Dict()).entryCount', vue.entryCount);
  out(
    'JSON.stringify(snapshot(store))',
    attempt(() => JSON.stringify(snapshot(store))),
  );
  out('vue   JSON.stringify(reactive(new Dict()))', JSON.stringify(vue));
}
```

Output:

```text

# current
Object.keys(store)                                         a,b
Object.keys(snapshot(store))                               a,b,entryCount
live store.entryCount                                      2
snapshot(store).entryCount                                 0
vue   Object.keys(reactive(new Dict()))                    a,b
vue   reactive(new Dict()).entryCount                      2
JSON.stringify(snapshot(store))                            {"a":1,"b":2,"entryCount":0}
vue   JSON.stringify(reactive(new Dict()))                 {"a":1,"b":2}

# patched
Object.keys(store)                                         a,b
Object.keys(snapshot(store))                               a,b,entryCount
live store.entryCount                                      2
snapshot(store).entryCount                                 throws RangeError: Maximum call stack size exceeded.
```

### Sketch B: raw values on write, nodes found by raw object, functions left alone

`patch-copy-raw.py`:

```python
import sys
from pathlib import Path

path = Path(sys.argv[1]) / "core/core.ts"
text = path.read_text()

def swap(old, new):
    global text
    if text.count(old) != 1:
        raise SystemExit(f"expected one match for {old[:50]!r}, found {text.count(old)}")
    text = text.replace(old, new)

# 1. Store the raw object, never a store proxy (Vue: `value = toRaw(value)` in `set`).
swap(
    "      const descriptor = findPropertyDescriptor(_target, prop);\n      if (descriptor && !('value' in descriptor)) {",
    "      const given = typeof value === 'object' && value !== null ? internalsMap.get(value) : undefined;\n"
    "      if (given) return Reflect.set(receiver, prop, given.target);\n"
    "      const descriptor = findPropertyDescriptor(_target, prop);\n      if (descriptor && !('value' in descriptor)) {",
)

# 2. Find an existing node by raw object as well as by proxy (Vue: the proxy
#    map is keyed by raw object and consulted before the type check).
swap(
    "  const existing = internalsMap.get(value);\n  if (!existing) {\n"
    "    // An immutable value is held by reference, like a `Date`. Opaque types are\n"
    "    // ruled out first: they are read far more often than they are frozen.\n"
    "    if (!canProxy(value) || isImmutableValue(value)) return;\n",
    "  const viaProxy = internalsMap.get(value);\n"
    "  const existing = viaProxy ?? targetNodes.get(value);\n"
    "  if (!viaProxy) {\n"
    "    if (isImmutableValue(value)) return;\n"
    "    if (!existing && !canProxy(value)) return;\n",
)

# 3. Leave alone what is not a method: an array element that is a function, a
#    class, and `constructor`. Identity-sensitive searches compare identities.
swap(
    "        // Array prototype methods should not be cached the same way as class methods.\n"
    "        if (Array.isArray(_target)) return transactional(method, receiver);\n",
    "        if (Array.isArray(_target)) {\n"
    "          if (Object.hasOwn(_target, prop)) return value;\n"
    "          if (prop === 'includes' || prop === 'indexOf' || prop === 'lastIndexOf') {\n"
    "            return (wanted: unknown, ...rest: unknown[]) =>\n"
    "              Reflect.apply(method, (_target as unknown[]).map(identityOf), [identityOf(wanted), ...rest]);\n"
    "          }\n"
    "          return transactional(method, receiver);\n"
    "        }\n"
    "        if (\n"
    "          prop === 'constructor' ||\n"
    "          Object.getOwnPropertyDescriptor(method, 'prototype')?.writable === false\n"
    "        )\n"
    "          return value;\n",
)
path.write_text(text)
print("patched")
```

### Port 15: findings 5, 6, 7, 9, 10 and 42, before and after sketch B

`15-patched-raw.ts`:

```ts
// Runs against a throwaway copy of our source: raw values on write, nodes found
// by raw object, and functions that are not methods left alone.
import {attempt, out, section} from './helpers';

const variant = process.argv[2];
const {createClassyStore, snapshot, subscribe} = await import(
  variant === 'patched'
    ? '../ours-copy-raw/src/index.ts'
    : '<repo>/packages/classy-store/src/index.ts'
);
const {reactiveSet} = await import(
  variant === 'patched'
    ? '../ours-copy-raw/src/collections/index.ts'
    : '<repo>/packages/classy-store/src/collections/index.ts'
);

section(`${variant}: findings 7 and 10`);
{
  const raw = {id: 1};
  const store = createClassyStore({list: [raw], other: [] as {id: number}[]});
  out(
    'list.includes(raw), indexOf(raw), lastIndexOf(raw)',
    `${store.list.includes(raw)}, ${store.list.indexOf(raw)}, ${store.list.lastIndexOf(raw)}`,
  );
  out(
    'list.includes(list[0]), includes(snapshot row)',
    `${store.list.includes(store.list[0])}, ${store.list.includes(snapshot(store).list[0])}`,
  );
  const rawTo: {row?: {id: number}} = {};
  const to = createClassyStore(rawTo);
  to.row = store.list[0];
  out('raw target holds the raw row after to.row = list[0]', rawTo.row === raw);
  out('to.row === list[0] (one proxy for the row)', to.row === store.list[0]);
  let calls = 0;
  subscribe(to, () => calls++, {sync: true});
  store.list[0].id = 2;
  out('a write through list[0] notifies the second owner', calls);
  const rawList = [{id: 1}, {id: 2}];
  const reversed = createClassyStore({list: rawList});
  reversed.list.reverse();
  out(
    'raw list holds only raw rows after reverse()',
    rawList.every((row) => row !== reversed.list[rawList.indexOf(row)]),
  );
  out('snapshot after reverse()', JSON.stringify(snapshot(reversed).list));
}

section(`${variant}: finding 9`);
{
  class Inner {
    n = 0;
    inc() {
      this.n++;
    }
  }
  const raw = new Inner();
  const inner = createClassyStore(raw);
  const outer = createClassyStore({inner: raw});
  out('outer.inner === inner', outer.inner === inner);
  let outerCalls = 0;
  let innerCalls = 0;
  subscribe(outer, () => outerCalls++, {sync: true});
  subscribe(inner, () => innerCalls++, {sync: true});
  outer.inner.inc();
  out(
    'calls after outer.inner.inc(): outer, inner',
    `${outerCalls}, ${innerCalls}`,
  );
  out('snapshot(outer).inner.n', snapshot(outer).inner.n);
}

section(`${variant}: findings 5, 6 and 42`);
{
  const first = () => 1;
  const second = () => 2;
  const store = createClassyStore({callbacks: [first, second]});
  out(
    'callbacks[0] === callbacks[0], === first',
    `${store.callbacks[0] === store.callbacks[0]}, ${store.callbacks[0] === first}`,
  );
  store.callbacks.splice(store.callbacks.indexOf(first), 1);
  out(
    'after splice(indexOf(first), 1): kept second',
    store.callbacks.length === 1 && store.callbacks[0] === second,
  );
  class Model {
    static label = 'model';
    count = 0;
    inc() {
      this.count++;
    }
  }
  const holder = createClassyStore({Model});
  out(
    'store.Model === Model, label, instanceof',
    attempt(
      () =>
        `${holder.Model === Model}, ${holder.Model.label}, ${new holder.Model() instanceof holder.Model}`,
    ),
  );
  const model = createClassyStore(new Model());
  out('store.constructor === Model', model.constructor === Model);
  const {inc} = model;
  inc();
  out('a destructured method still works: count', model.count);
}

section(`${variant}: finding 34, by add`);
{
  const row = {id: 1};
  const holder = createClassyStore({row});
  const store = createClassyStore({set: reactiveSet<object>()});
  store.set.add(row);
  store.set.add(holder.row);
  out('add(raw) then add(proxy): size', store.set.size);
}
```

Output:

```text

# current: findings 7 and 10
list.includes(raw), indexOf(raw), lastIndexOf(raw)         false, -1, -1
list.includes(list[0]), includes(snapshot row)             true, false
raw target holds the raw row after to.row = list[0]        false
to.row === list[0] (one proxy for the row)                 true
a write through list[0] notifies the second owner          1
raw list holds only raw rows after reverse()               false
snapshot after reverse()                                   [{"id":2},{"id":1}]

# current: finding 9
outer.inner === inner                                      false
calls after outer.inner.inc(): outer, inner                0, 0
snapshot(outer).inner.n                                    1

# current: findings 5, 6 and 42
callbacks[0] === callbacks[0], === first                   false, false
after splice(indexOf(first), 1): kept second               false
store.Model === Model, label, instanceof                   false, undefined, false
store.constructor === Model                                false
a destructured method still works: count                   1

# current: finding 34, by add
add(raw) then add(proxy): size                             1

# patched: findings 7 and 10
list.includes(raw), indexOf(raw), lastIndexOf(raw)         true, 0, 0
list.includes(list[0]), includes(snapshot row)             true, true
raw target holds the raw row after to.row = list[0]        true
to.row === list[0] (one proxy for the row)                 true
a write through list[0] notifies the second owner          1
raw list holds only raw rows after reverse()               true
snapshot after reverse()                                   [{"id":2},{"id":1}]

# patched: finding 9
outer.inner === inner                                      true
calls after outer.inner.inc(): outer, inner                1, 1
snapshot(outer).inner.n                                    1

# patched: findings 5, 6 and 42
callbacks[0] === callbacks[0], === first                   true, true
after splice(indexOf(first), 1): kept second               true
store.Model === Model, label, instanceof                   true, model, true
store.constructor === Model                                true
a destructured method still works: count                   1

# patched: finding 34, by add
add(raw) then add(proxy): size                             1
```
