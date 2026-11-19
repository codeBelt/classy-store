# Stage 2: Solid 2's store (`@solidjs/signals`)

Read-only comparison for the pre-1.0 review, 2026-11-18. Nothing in the
repository was changed except this file.

## Library, version and commit

- Library: the store in `@solidjs/signals`, which `solid-js` 2.0.0 re-exports.
- Version: `@solidjs/signals` 2.0.0, the version `solid-js` 2.0.0 depends on
  and the one installed in this repository under
  `node_modules/.bun/@solidjs+signals@2.0.0`.
- Source: `https://github.com/solidjs/solid`, tag `@solidjs/signals@2.0.0`,
  commit `a8186e6738b3a6a3341c561f66e9325432d6759b` (2026-11-16).
- The package ships bundles only (`dist/dev.js`, `dist/prod/`,
  `dist/observe/`), so the source was cloned into a scratch folder and read
  there. Solid paths below are relative to `packages/signals/` in that
  repository. Our paths are relative to `packages/classy-store/src/`.
- The ported tests ran on Node 24.21.0 against `@solidjs/signals@2.0.0`
  installed from npm in the scratch folder, and on Bun 1.4.4 against our
  source imported by absolute path. Machine: Apple M1 Max, macOS 26.6.2.

## Files read

Solid:

- `src/store/types.ts`, `src/store/target.ts`, `src/store/reconcile.ts`,
  `src/store/index.ts` (whole files)
- `src/store/store.ts` (3,003 lines), these parts: the header, `TargetShape`,
  `createTarget`, `wrap`, `unwrapValue`, `getNode`, `getHasNode`,
  `isOwnAccessor`, `cloneRaw`, `scanAccessorsOnce`, `ensurePB`,
  `notifyWrites`, `inDraft`, `nodeValue`, `serveDataKey`, the `traps` object,
  `warnWriteOutsideSetter`, `devGuardStoreSetterWrite`,
  `devGuardStoreSetterResult`, `storeSetter`, `createStore`, `deep`,
  `snapshot`, `snapshotWalk`, `snapshotRecord`
- `src/core/dev.ts`: the diagnostic types, `emitDiagnostic`,
  `reportDiagnostic`, `assertInvariant`
- `src/globals.d.ts`, `src/index.ts`, `rollup.config.js`, `package.json`
- `packages/solid/package.json`, and the `diagnostics.json` that `solid-js`
  ships
- Two upstream test files, for what the authors intend with class instances:
  `tests/store/createStore.test.ts` ("Nested Classes") and
  `tests/store/native-collections.test.ts`

Ours: `core/core.ts`, `core/ownership.ts`, `snapshot/snapshot.ts`,
`utils/internal/internal.ts`, `frameworks/solid/solid.ts`, and
`applySnapshot` in `utils/history/history.ts`.

Not read: Solid's `store/utils.ts` (it holds `merge` and `omit` for props, not
store internals), `optimistic.ts`, `projection.ts`, `storePath.ts`, the
scheduler, and the attribution engine behind the performance diagnostics.

## Summary

Solid 2.0.0's store is a different machine from the one the first comparison
described. Three facts shape everything below:

- **Writes happen only inside `setStore(draft => ...)`.** A write anywhere
  else is ignored. The development build says so; production is silent.
- **It never writes to the object it was given.** The first write clones the
  record (copy-on-write), and the store reads its clone from then on.
- **A write is not visible until the flush.** After a setter returns, a plain
  read still gives the old value until a microtask or `flush()` (port 7).

The three findings I would act on first:

1. **The per-prototype getter cache does not exist** (finding 1). Solid
   caches _wrappability_ per prototype, and _accessor-ness_ per subscribed
   key. It never classifies a prototype getter, and its class getters go stale
   over nested data because of it (finding 2). A cache shaped for our needs
   cut a field read by 18% on Node and 53% on Bun in a scratch spike.
2. **Functions are never wrapped, and class instances wrap without an
   opt-in** (findings 3 and 4). The first removes the cause of stage 1
   findings 5, 6, 42 and 62. The second removes a third silent failure the
   plan does not list: a method called on a nested class instance that lacks
   `PROXYABLE` changes state and notifies no one.
3. **`defineProperty` is an ordinary write, `has` and `ownKeys` are tracked,
   and diagnostics have stable codes in a build of their own** (findings 6 to
   9). The first two fix stage 1 findings 1, 30, 31, 45, 61, 66, 67 and 71.
   Solid has no answer for arrow-function methods: there the write is lost
   outright.

## Findings

### 1. The read path: what Solid caches, and what "per prototype" means there

**What they do.** There is no per-prototype getter cache in 2.0.0. I also
searched the 2.0.0-rc.18 and 2.0.0-rc.23 bundles installed in this repository
and found none. Three smaller caches answer related questions:

- **Wrappability, per prototype.** `wrappableProtos` in `src/store/types.ts`
  (line 153) is a `WeakMap` from a prototype object to a boolean, read and
  filled by `isWrappable` (lines 157 to 171).
  - _Keyed_ by `Object.getPrototypeOf(obj)`.
  - _Filled_ the first time an object with that prototype is tested, unless
    the prototype is `Object.prototype`, `null` or the object is an array,
    which are answered without the map. The verdict is "its
    `Object.prototype.toString` tag is `[object Object]`, and it is not a DOM
    `Node`".
  - _Never invalidated._
  - _Assumes_ every instance of one prototype gives the same answer. The
    frozen test is not cached: `Object.isFrozen(obj)` runs first on every
    call (line 159).
- **Accessor-ness, per record and key.** Each subscribed key has a slot node,
  and the node carries an `acc` flag.
  - _Keyed_ by the record's internal target and the property key
    (`target.n[key]`).
  - _Filled_ when the node is created, in `getNode` (`src/store/store.ts`
    lines 368 to 410, the flag at line 389), which happens on the first
    _tracked_ read of the key (lines 2252 to 2259). The probe is
    `isOwnAccessor` (lines 578 to 583): `hasOwnProperty`, then
    `__lookupGetter__` and `__lookupSetter__`. No descriptor object is
    allocated.
  - _Refreshed_ in `notifyWrites` (line 1162), when a setter writes a key
    that was an own accessor or has become one.
  - _Assumes_ every change comes through the setter, and covers **own**
    accessors only.
- **Accessors seen, per record.** `a` (sticky: an own accessor was seen) and
  `sc` (scan grade) on the target, filled by `scanAccessorsOnce` (lines 641
  to 656) on the first write to the record. They choose the clone strategy
  and decide whether a write may visit only the keys it wrote.

A read of a key that has no node, outside a computation, checks nothing: it
is `src[key]` on the backing object (line 2285). A getter found that way runs
with the raw backing as `this`. Only when the result is `undefined` and the
key is not own does the trap read again with the proxy as receiver (lines
2286 to 2290).

**What we do.** The `get` trap calls `findPropertyDescriptor(_target, prop)`
on every read (`core/core.ts:464`). That walks the prototype chain with
`Object.getOwnPropertyDescriptor` until it finds the key
(`utils/internal/internal.ts:88-99`): one allocated descriptor for an own
field, two or more calls for a class method, the whole chain for a missing
key. The `set` trap does the same (`core/core.ts:413`).

**Difference in behaviour.** Timing only. Port 6 below, median of seven
rounds of two million reads, nanoseconds per read. "Spike" is a scratch copy
of our core with the change proposed here.

| Read                                       | Node 24.21.0 | Bun 1.4.4 |
| ------------------------------------------ | -----------: | --------: |
| Forwarding Proxy, field                    |         21.7 |       2.5 |
| classy-store today, field                  |         46.5 |      25.4 |
| classy-store with the spike, field         |         38.2 |      11.9 |
| Solid, class field, nobody subscribed      |         28.3 |      22.2 |
| Solid, class field, an effect subscribed   |         33.1 |      16.9 |
| classy-store today, cached getter          |         79.9 |      58.2 |
| classy-store with the spike, cached getter |         74.6 |      34.3 |
| Solid, prototype getter, nobody subscribed |         40.7 |      23.1 |
| classy-store today, method lookup          |         64.5 |      49.8 |
| classy-store with the spike, method lookup |         60.1 |      30.9 |
| Solid, method lookup                       |         39.8 |      15.4 |

The "today" figures are close to the stage 1 baseline (45.1 ns on Node, 31.8
on Bun, from a different harness).

**Proposal: adapt.** Solid's own mechanism cannot be copied, because it never
sees a prototype getter and our memoization depends on finding one (finding
2). The two ideas inside it can:

1. _Decide an own key without a descriptor._ `hasOwnProperty`, plus one flag
   per node, "this object has an own accessor". `createNode` already reads
   every own descriptor when it indexes a node (`core/core.ts:537-541`), so
   the flag is free there; the `defineProperty` trap sets it later.
2. _Answer an inherited key from a table per prototype_: a
   `WeakMap<prototype, Map<key, descriptor | null>>`, filled on the first
   miss by the existing `findPropertyDescriptor`. The prototype is read with
   `Object.getPrototypeOf(target)` on each inherited read, so
   `Object.setPrototypeOf` on a store still works.

The spike is 30 lines (its diff is under port 6). It assumes two things the
library already does not handle: a prototype is not given a new getter after
its first read through a store (stage 1 findings 44 and 47), and an accessor
is not defined on the raw object behind the proxy (finding 11). **The spike
was not run against the unit suite.** What remains on Node after it, about 16
ns over a bare Proxy, is the rest of the trap: `resumeScope()`, the
`childInternals` lookup and `linkChild` on every read.

**Kind:** performance.

**Cost:** `core/core.ts` (`get` and `set` traps), one field in
`core/ownership.ts`. Not breaking. Risk low to medium; stage 3 lists this as
a spike already and can start from this one.

### 2. Class getters: Solid's shortcut goes stale, ours does not

**What they do.** A prototype getter is treated as data.

- A tracked read runs it with the raw backing as `this` (`src[key]`,
  `src/store/store.ts` line 2285) and stores the result in a slot node made
  for that key (`serveDataKey`, lines 1759 to 1802). Later reads are served
  from the node (lines 2187 to 2203) and do not run the getter.
- Nothing records what the getter read. Instead, when a setter writes a
  record whose prototype is not plain, `notifyWrites` gives up on visiting
  only the written keys (lines 1136 to 1138), visits every node of the
  record, and reads each key again from the new backing (line 1176). That
  re-runs every observed prototype getter of the record on every write to it.
- An **own** accessor (a getter in an object literal) takes another path: it
  runs with the proxy as `this` on every read (lines 2260 to 2266), so
  everything it reads is tracked. It is not memoized.

**What we do.** Every getter, own or inherited, runs with the proxy as
`this`, records its dependencies and is memoized (`core/core.ts:160-196` and
`464-477`). A child object it reads is a version dependency
(`core/core.ts:93-101`).

**Difference in behaviour.** Port 2. A class getter that sums nested rows:

```text
Solid:  write a nested row the getter reads: s.inner.items[0].price = 10
        -> {"seenTotal":5,"untrackedRead":5,"totalRuns":0}
ours:   write a nested row the getter reads
        -> {"total":13,"again":13,"totalRuns":2}
```

In Solid the effect never re-runs and even a plain read keeps answering 5,
because the write touched the row's record, not the instance's. A getter over
the instance's own fields does update, by the re-read described above; in the
same port a write to `count` re-ran both observed getters once each.

The upstream test for this (`tests/store/native-collections.test.ts`, "user
class instances still wrap") reads one own field, and its comment says the
getter "kept the proxy receiver". For a prototype getter that is not what the
code does.

**Proposal: reject.** Keep detecting prototype getters and tracking what
they read. This is the reason finding 1 adapts Solid's cache instead of
adopting it.

**Kind:** API design (confirms ours).

**Cost:** none.

### 3. Functions are never wrapped

**What they do.** The `get` trap separates two cases by where the function
lives (`src/store/store.ts`):

- _Inherited from the prototype chain_: a method. It is returned as it is
  (lines 2291 and 2310 to 2315). `this` is the proxy because the caller wrote
  `proxy.method()`. Nothing is bound, cached or wrapped.
- _An own property_: data. It goes through `serveDataKey` like any value, and
  since a function is not wrappable (`NotWrappable` in `src/store/types.ts`
  lines 97 to 106) the function itself comes back.
- `constructor` is a special case: a plain read answers the source's class
  (lines 2277 to 2284).

**What we do.** Any function read through a store is wrapped by
`transactional(method, receiver)` (`core/core.ts:483-492`): a new wrapper on
every read for an array (line 486), one cached per property otherwise (lines
487 to 491). The wrapper forwards `new` (line 269) and has none of the
function's own properties.

**Difference in behaviour.** Ports 3 and 8:

```text
                                               Solid             ours
store.callbacks[0] === store.callbacks[0]      true              false
store.callbacks.indexOf(first)                 0                 -1
remove the first callback by indexOf           second is left    wrong one removed
store.Model === Model, store.Model.label       [true,"model"]    [false,null]
new store.Model("x") instanceof store.Model    true              false
constructor is the class (port 2)              true              false
```

Solid pays for it in one place: a destructured method loses `this` (port 7,
"Methods are not bound"), where ours keeps it.

**Proposal: adapt.** Solid can leave every function alone because all its
writes happen inside a setter. We need the wrapper for methods, to bind
`this` and to open the transaction. So keep the wrapper, and narrow what gets
it:

- A function **inherited** from the prototype chain is a method: wrap it as
  today. This covers class methods and `Array.prototype` methods.
- An **own** function in an **array** is data: return it untouched.
- A function whose own `prototype` property is **not writable** is a class or
  a built-in constructor: return it untouched. That test is exact: it is
  `false` for `class A {}` and for `Map`, `true` for `function () {}`, and the
  property is absent on arrows, shorthand methods and async functions
  (checked on Node 24).
- `constructor` is returned untouched.
- An own function on a non-array object stays wrapped and cached, as today.
  An object-literal store (`{count: 0, increment() {...}}`) holds its methods
  as own properties, so they must keep the transaction.

With finding 1 in place the trap already knows "own or inherited" before it
gets here. This fixes stage 1 findings 5, 6 and 42, and the `holder.fn ===
fn` part of 62. Not spiked.

**Kind:** bug.

**Cost:** `core/core.ts` (`get` trap). Breaking only for code that relied on
a function stored in an array being bound to that array. Risk low.

### 4. Class instances wrap by default; opting out is explicit

**What they do.** `isWrappable` (`src/store/types.ts` lines 157 to 171) wraps
plain objects, null-prototype objects, arrays, and any other object whose tag
is `[object Object]`, which is every ordinary class instance. Leaves are:

- platform objects, by that tag check: `Date`, `Map`, `Set`, typed arrays,
  promises (verified);
- DOM nodes;
- frozen objects;
- anything passed through `markRaw()` (lines 119 to 125), kept in a
  `WeakSet` and checked in `wrap` (`src/store/store.ts` line 219).

The header comment of `tests/store/native-collections.test.ts` gives the
reason for the tag check: native code checks internal slots and throws when
called with a proxy as `this`.

One sharp edge, verified: a class that defines `Symbol.toStringTag` is a
leaf.

**What we do.** `canProxy` (`utils/internal/internal.ts:70-82`) wraps arrays,
plain objects, and class instances whose constructor sets
`static [PROXYABLE] = true`. Everything else is kept by reference. The root
given to `createClassyStore` is always wrapped.

**Difference in behaviour.** Port 2, the same class nested in a store with
and without the opt-in:

```text
ours:   store.inner.increment() notifies -> {"count":2,"subscriberCalls":0}
        store.opted.increment() notifies -> {"count":2,"subscriberCalls":1}
Solid:  call a prototype method on the draft: s.inner.increment()
        -> {"count":6,"seenDouble":12,"rawCount":1}
```

Ours changes the state and tells no subscriber. This is a third silent
failure mode next to the two the plan names, and the commonest shape for it
is a class-based store that holds another class instance.

**Proposal: adopt the default, adapt the test.** Wrap an object unless it is
a platform object, and cache the verdict per prototype as Solid does. Keep
two ways out: freezing, which we have, and one explicit marker (a
`markRaw`-style function, or `PROXYABLE` turned into an opt-out). API
question 6 below.

**Kind:** API design.

**Cost:** `utils/internal/internal.ts` (`canProxy`), the collections' use of
`PROXYABLE`, docs. **Breaking, so before 1.0**: a third-party class instance
held in a store becomes a proxy. One whose methods use `#private` fields then
throws when called through the store (port 9: both libraries throw a
`TypeError` there), and would need the marker. Risk medium.

### 5. The proxy target is an empty shell, not the raw object

**What they do.** `createTarget` (`src/store/store.ts` lines 197 to 209)
builds the proxy over an empty `[]` or `{}` (line 205). The handler is the
internal record itself; the traps sit on its prototype (line 2513). Because
the shell has no properties, no `get` invariant can ever fire, whatever
happens to the raw object. The price:

- `has`, `ownKeys`, `getOwnPropertyDescriptor` and `getPrototypeOf` become
  mandatory, and every descriptor is reported configurable (line 2399).
- `preventExtensions` is refused (line 2510), so `Object.freeze(store)`
  throws.
- A non-configurable property defined inside a setter is applied to the
  backing, and then the engine throws from the `defineProperty` invariant
  (port 4). That looks like a bug in Solid.

**What we do.** The proxy wraps the raw object (`core/core.ts:405`).
Invariants are handled one by one: `isReadOnly` (`core/core.ts:345-347`), its
use in `linkChild` (lines 369 to 374), and the `defineProperty` trap (lines
502 to 513).

**Difference in behaviour.** Port 1:

```text
                                                    Solid     ours
freeze the raw child behind the store, read below   1         THROWS TypeError
Object.freeze(store)                                THROWS    works (CLAUDE.md)
```

**Proposal: reject for 1.0.** It would fix stage 1 finding 46 and delete
`isReadOnly` and the freeze branch. It would also make four more traps
mandatory, give up `Object.freeze(store)`, and change what a descriptor read
reports. Document instead that the raw object must not be frozen or redefined
behind the store, which finding 11 of stage 1 already implies. It stays the
fallback if invariant bugs keep appearing after finding 7.

**Kind:** simplification.

**Cost:** large: every trap in `core/core.ts`, and `snapshot.ts` where it
reads descriptors. Breaking.

### 6. `has`, `ownKeys` and descriptor reads are tracked, each on its own

**What they do.** Three structures, so that each kind of reader re-runs only
for its own kind of change (`src/store/store.ts`):

- `has` (lines 2319 to 2352) subscribes to a **presence node** for that one
  key (`getHasNode`, lines 412 to 424).
- `ownKeys` (lines 2354 to 2362) subscribes to the record's **container
  node**, which `notifyWrites` tells only when membership changed (lines 1228
  to 1248).
- `getOwnPropertyDescriptor` (lines 2364 to 2401) tracks presence.
- Reading a key that does not exist subscribes to that key (lines 2295 to
  2306).

**What we do.** No `has` or `ownKeys` trap. A getter records `get` reads only
(`core/core.ts:80-105`). The proxy used to compute snapshot getters has a
`get` trap over an empty object and nothing else
(`snapshot/snapshot.ts:80-93`).

**Difference in behaviour.** Port 4, section 7: adding an unrelated key
re-ran the `Object.keys` effect and not the `'c' in bag` effect; changing a
value re-ran neither. And a getter that reads its own keys (ports 4 and 8):

```text
Solid:  delete s.b -> {"seenCount":3,"seenHasB":false,"snapshotCount":3}
ours:   delete store.b
        -> {"count":4,"hasB":true,"snapshotCount":0,"snapshotHasB":false}
```

Ours is stale on the live store and wrong in another way on the snapshot
(stage 1 findings 30 and 31).

**Proposal: adapt.** We have no observers outside getters, so we need no
nodes, only two more kinds of getter dependency:

- a `has` trap that records `{prop, present}` while a getter of that node is
  being tracked;
- an `ownKeys` trap that records the node's "shape" while a getter is being
  tracked: a counter the `set` (new key), `deleteProperty` and
  `defineProperty` traps bump.

Both are a plain `Reflect` forward when no getter is running. On the snapshot
side, give the tracking proxy `has`, `ownKeys`, `getOwnPropertyDescriptor`
and `getPrototypeOf` traps that forward to the frozen snapshot and record the
key list as a dependency. That also answers stage 1 finding 41 (no own keys,
not an instance of the class).

**Kind:** bug.

**Cost:** `core/core.ts`, `core/core.types.ts`, `snapshot/snapshot.ts`. Not
breaking. Risk low. Stage 3 lists these traps as a spike.

### 7. `defineProperty` is an ordinary write

**What they do.** The `defineProperty` trap (`src/store/store.ts` lines 2458
to 2475) passes the same gate as `set`, unwraps a proxy given as the value,
records the key as written, updates the accessor flags and defines the
property on the pending backing. The notification leaves with the rest of the
setter's writes; `notifyWrites` re-reads the key's accessor-ness (line 1162)
and compares old and new descriptors (lines 1163 to 1171).

**What we do.** The trap forwards the definition and then only detaches a
child whose property became read-only (`core/core.ts:502-513`). It does not
resume a suspended subtree, link a new object value, drop the cached bound
method, bump a version or notify.

**Difference in behaviour.** Port 4, section 6, and the same on ours (port
8):

```text
Solid, in a setter: Object.defineProperty(s, "b", {value: 2, ...})
        -> {"storeB":2,"seenB":2,"keyRuns":2,"snapshotB":2}
ours:   Object.defineProperty(store, "b", {value: 2, ...})
        -> {"storeB":2,"subscriberCalls":0,"snapshotB":"undefined"}

Solid, in a setter: redefine a property that holds an object
        -> {"childN":99,"snapshotChildN":99}
ours:   redefine a property that holds an object -> {"childN":1}
```

**Proposal: adopt the principle.** Make the trap follow the steps of `set`:
`resumeScope()` first (this is the one-line remedy stage 1 proposed for
finding 66), then, after a successful definition, link or detach the child
from the property's new own descriptor, drop the cached bound method, set the
own-accessor flag of finding 1, and notify. Stay silent when nothing a
snapshot can show has changed (value, getter, setter, enumerability), so
`Object.freeze(store)`, which arrives as one definition per property, does
not notify once per field.

This covers stage 1 findings 1, 45, 61, 66, 67 and 71. Our design handles
one case better than Solid's: a non-configurable definition, which Solid
applies and then throws on (finding 5).

**Kind:** bug.

**Cost:** `core/core.ts` only. Not breaking. Risk low to medium; the freeze
path needs its tests.

### 8. Diagnostics: stable codes, once per object and key

**What they do.** Every diagnostic has a code from one union
(`DiagnosticCode`, `src/core/dev.ts` lines 63 to 140), a kind and a severity.
The message starts with `[CODE]`. An event (lines 165 to 190) goes to two
places: `emitDiagnostic` (lines 966 to 1006) hands it to listeners and
captures, and `reportDiagnostic` (lines 1073 to 1081) prints it with
`console.warn` or `console.error`. `solid-js` ships a `diagnostics.json`
with 75 codes, each with a trigger, a repair text and a documentation URL.

The codes that concern the store. Line numbers are in `src/store/store.ts`
unless a file is named.

| Code                            | Severity | Reports                                                                     | Where                                           | What happens                                                                             |
| ------------------------------- | -------- | --------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `STORE_WRITE_OUTSIDE_SETTER`    | warn     | A `set`, `defineProperty` or `delete` on a store while its setter is closed | `warnWriteOutsideSetter`, 2068 to 2104          | The write is ignored in every build. The trap returns `true`, so strict code keeps going |
| `ASYNC_STORE_SETTER`            | error    | The setter callback returned a thenable                                     | `devGuardStoreSetterResult`, 2565 to 2582       | Development throws, after the synchronous writes were applied. Later writes are ignored  |
| `REACTIVE_WRITE_IN_OWNED_SCOPE` | error    | `setStore` called inside a memo or a component body                         | `devGuardStoreSetterWrite`, 2541 to 2559        | Development throws. Production writes                                                    |
| `STORE_WRITE_THROUGH_LOADING`   | warn     | A write inside a child that is another store still loading                  | `devWriteThroughLoading`, 2110 to 2126          | Dropped. Derived stores only                                                             |
| `STRICT_READ_UNTRACKED`         | warn     | An untracked store read in a component body                                 | `get` trap, 2231 to 2244                        | Not a write                                                                              |
| `UNTRACKED_READ_AFTER_AWAIT`    | warn     | A first read after an `await` in an async computation                       | `get` trap, 2211 to 2225                        | Not a write                                                                              |
| `IMMUTABLE_UPDATE_IN_STORE`     | warn     | A container replaced by a mostly equal copy                                 | The attribution engine (catalogue entry only)   | Performance advice                                                                       |
| `UNSTABLE_LIST_IDENTITY`        | warn     | List rows recreated for equal items                                         | The attribution engine (catalogue entry only)   | Performance advice                                                                       |
| `INVARIANT_VIOLATION`           | error    | An internal consistency check failed                                        | `assertInvariant`, `src/core/dev.ts` 828 to 841 | Throws under the test flag, logs in development                                          |

The outside-setter warning is remembered per record and key in a `WeakMap`
of sets (lines 2059 and 2074 to 2078), so a loop does not flood the console.
The same memory hid the write after the `await` in port 5, because that key
had been warned about earlier.

**What we do.** No diagnostics module and no development build. Errors are
ad hoc `Error`s with a package prefix (`core/core.ts:180-182` and `207`,
`snapshot/snapshot.ts:247-249`), and a subscriber's exception goes to
`console.error` (`core/core.ts:322-326`).

**Difference in behaviour.** Port 5 in the development build and in
production:

```text
dev:   store.count = 5 -> {"storeCount":0,"rawCount":0}
         [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Writing store property "count"
          outside its setter was ignored. ...]
prod:  store.count = 5 -> {"storeCount":0,"rawCount":0}

dev:   setStore(async s => { s.count = 1; await 0; s.count = 2; })
         -> THROWS Error: [ASYNC_STORE_SETTER] ...
prod:  -> no throw; after the await settled -> {"storeCount":1,"events":[]}
```

Our own two silent cases, ports 2 and 8:

```text
store.opted.arrow() notifies -> {"count":3,"snapshotCount":3,"subscriberCalls":0}
sync notifications for one async method that writes three times -> 3
sync notifications for batch(async () => ...) with three writes -> 3
```

Solid has no diagnostic for an arrow-function method. Its write lands on the
original instance, which the store stopped reading at its first write, so it
is lost (port 2: `{"count":6,"seenDouble":12,"rawCount":2}`).

**Proposal: adapt, small.** Take the shape and not the size: a `[CODE]`
prefix, one stable string code per diagnostic, once per object and key, a
reporter that exists only in the development build, and the codes listed in
the API reference. Leave out the event channel, owner paths and the catalogue
file until something reads them. Candidates, with the detector each needs:

1. **`batch()` got a promise back** (`core/core.ts:299-306`). Exact, one
   line, and the direct counterpart of `ASYNC_STORE_SETTER`. A warning, not a
   throw: our later writes are not lost, only delivered one by one.
2. **A store method returned a promise** (`transactional`,
   `core/core.ts:263-277`). The same detector, but an async method is a
   normal thing to write here. I would document it and not warn.
3. **A write went around the proxy** (arrow-function and bound methods).
   Nothing to copy from Solid. A possible detector for the development build:
   when a function that is an own property of a class instance is called
   through the store, compare the raw object's own data values before and
   after with the node's version; a changed value under an unchanged version
   is such a write. Exact for direct field writes, one pass over own keys per
   call. Needs a spike.
4. **A write inside a getter** (stage 1 finding 39): a `set` while a getter
   of the same node is being tracked. One check in the `set` trap.
5. **A subscriber that keeps writing** (finding 18): a depth counter in
   `deliver`.

**Kind:** diagnostics.

**Cost:** one small module and its call sites in `core/core.ts`. Not
breaking. Depends on finding 9.

### 9. How the development build is split from production

**What they do.** One source, two compile-time flags, three builds:

- `__DEV__` and `__OBSERVE__` are declared in `src/globals.d.ts` and replaced
  with literals by `@rollup/plugin-replace` (`flags` in `rollup.config.js`).
  A check is an ordinary `if (__DEV__)` at the call site, so it folds away.
- The outputs are `dist/dev.js` (checks and wiring), `dist/observe/` (wiring
  only) and `dist/prod/` (neither).
- `package.json` selects one with export conditions: `development` and
  `test` give the development build, `observe` gives observe, `default` gives
  production. `solid-js` nests the same conditions under `browser`, `node`,
  `worker` and `deno`.
- The `DEV` export is `undefined` outside the development build
  (`src/index.ts` line 68).

Verified: no file under `dist/prod` or `dist/observe` contains the string
`STORE_WRITE_OUTSIDE_SETTER`; plain `node` resolves production, `node
--conditions=development` the development build, `node --conditions=observe`
the observe build (port 5). So a runtime that sets no condition gets
production and no diagnostics, silently.

**What we do.** One build per module format with no flag
(`tsdown.config.ts`), no `development` condition in `package.json`, and no
read of `NODE_ENV` anywhere in `src` (searched).

**Proposal: adapt, and choose between two shapes.**

- **A. Export conditions and a build-time flag**, as Solid does. Production
  stays byte for byte what it is, so no size budget in `CONSTRAINTS.md`
  moves. It costs a second build per format (four trees with ESM and CJS),
  and the single shared runtime (`#store-runtime`) must hold within each
  tier. Diagnostics are invisible wherever `development` is not set.
- **B. `process.env.NODE_ENV !== 'production'` guards in one build**, left to
  the consumer's bundler to remove. One artifact, and diagnostics are on by
  default in tests and scripts. The bytes stay for a consumer whose bundler
  does not replace the expression, `process` must be guarded for a browser
  without a bundler, and the size script must measure with the replacement
  applied.

I would take A while the diagnostics stay few, because it leaves the
production bundle and its budget alone. Stage 3 should spike it with tsdown
and check which of Vite, Next.js, Vitest, Bun and Node select `development`.
I verified Node only.

**Kind:** diagnostics.

**Cost:** `tsdown.config.ts`, `package.json` exports, the package checks and
the size script. Not breaking. Risk medium, in packaging.

### 10. `snapshot` and `deep`: a data export, not a render value

**What they do.**

- `snapshot` (`src/store/store.ts` lines 2864 to 2867, through `snapshotWalk`
  at 2885 to 2906 and `snapshotRecord` at 2909 to 2964) does not track. For a
  subtree the store has never written it returns **the source object
  itself**; for a record the store owns it returns a fresh copy. Nothing is
  frozen and nothing is cached. A `seen` map keeps shared children shared and
  makes cycles end. Accessors are copied as accessors (lines 2929 to 2932).
- `deep` (lines 2778 to 2857) is the tracking form. It subscribes to one
  "deep witness" node per reachable record and returns a snapshot. Write
  paths bump a witness only if one exists (lines 1211 to 1223).

**What we do.** `snapshot()` returns a frozen object, cached by version
(`snapshot/snapshot.ts:241-244`), sharing unchanged subtrees with the
previous snapshot, and throws on a cycle (lines 246 to 250).

**Difference in behaviour.** Port 7, port 3 section 9, and port 8:

```text
Solid:  before any write: snapshot(store) === raw -> true
        after a write: two snapshots are the same object -> false
        a snapshot is frozen -> [false,false]
        writing to a snapshot changes the store -> {"touched":2,"untouched":88}
        s.self = s, then snapshot(store) -> {"selfIsSnapshot":true,"name":"root"}
ours:   snapshot(store) after store.self = store
        -> THROWS Error: @codebelt/classy-store: circular reference detected in snapshot
```

**Proposal: reject the semantics, adapt the cycle handling.** Ours gives the
guarantees a render needs; theirs is a way to get plain data out. The one
thing worth taking is that a cycle is not an error. `createSnapshotRecursive`
could keep a map from target to the snapshot under construction, in place of
the `inProgress` set, hand that object out when the walk meets the same
target again, and freeze each object once its own fields are set. Version
propagation already copes with cycles (`ancestors()` keeps a visited set,
`core/ownership.ts:159-169`). Today `store.self = store` succeeds and
notifies, and every later `snapshot()` throws, which inside an adapter means
the subscriber throws (stage 1 finding 8). Not spiked.

A note for the redesign of `ownership.ts`, **from reading, not a proposal**.
Solid has nothing like it. A record knows one parent (`u` in
`src/store/target.ts` line 95), used only to copy the path on a write. A
child's identity is a global map from raw object to record (`storeLookup`,
line 157), so the parent keeps pointing at the raw child and reads resolve it
to its current backing. Nothing is propagated upward: whoever observes a
subtree subscribes downward, record by record. So there are no owner counts,
no weak parent references, no suspend or resume, and one child under two keys
still reads and snapshots correctly (port 5, section 17). What we buy with
the upward walk is a cached snapshot in constant time and subtree
`subscribe`. Finding 72 of stage 1 says which parts of our walk can be seen
to matter.

**Kind:** bug (cycles), API design (the rest).

**Cost:** `snapshot/snapshot.ts`. Not breaking. Risk medium.

### 11. `reconcile`: keeping identity when state is replaced wholesale

**What they do.** `reconcile(value, key = "id")` (`src/store/index.ts` lines
110 to 115) is a setter transform. `reconcileState`
(`src/store/reconcile.ts` lines 46 to 88) and `applyAdopt` (lines 93 to 297)
adopt the incoming plain data as the new backing and notify only the nodes
whose value changed. For a list, the aligned prefix is walked by position;
from the first misalignment rows are matched by key (lines 156 to 185).
`descend` (lines 312 to 349) goes into a changed pair only where something
below is observed. Surviving rows keep their proxies.

**What we do.** Nothing in the core. `withHistory` restores by top-level key:
an unchanged branch is left alone, a changed one is replaced by a deep clone
(`utils/history/history.ts:92-109`).

**Difference in behaviour.** Port 7, section 20, and port 10:

```text
Solid:  reconcile a reordered, edited copy by id
        -> {"order":"2,1,3","sameProxyForId1":true,"sameProxyForId2":true,
            "editedValue":100,"rowEffectRuns":1}
ours, after undoing an edit to one row of three:
        the untouched rows keep their snapshots -> [false,false]
        the untouched row keeps its live proxy -> false
```

After one undo every row of the list is a new object, so every row component
renders again and anything holding a row proxy holds a detached one.

**Proposal: adapt, inside the utilities.** A recursive apply that goes down
while both sides are containers of the same kind and writes only the leaves
that differ. Our snapshots already say which subtrees are unchanged, by
reference, so the same-position case needs no key function. Matching
reordered rows by key could follow. I did not read `persist.ts` or
`devtools.ts`; if they replace state the same way, they would share it.

**Kind:** performance.

**Cost:** `utils/history/history.ts`, possibly `persist.ts` and
`devtools.ts`. Not breaking. Risk medium. Can follow 1.0 unless a public
`reconcile` is wanted.

### 12. Copy-on-write, and why it does not suit us

**What they do.** The first write to a record clones it (`ensurePB`,
`src/store/store.ts` lines 705 to 749, and `cloneRaw`, lines 587 to 622),
along with its chain of ancestors. Until then the store reads the object it
was given.

**What we do.** The object given to `createClassyStore` is the state. A write
lands on it (`core/core.ts:432`).

**Difference in behaviour.** Port 5, section 11:

```text
a write through the setter leaves the raw object alone
  -> {"storeN":2,"rawN":1,"rawChildM":1,"snapshotIsRaw":false}
before any setter write the store reads the raw object itself
  -> {"storeN":7,"snapshotIsRaw":true}
```

**Proposal: reject.** "State is a plain class wrapped in a proxy" is fixed by
the plan. The comparison is still useful for the Solid adapter's docs: a
Solid user will expect the object they passed in to stay untouched, and here
it is the store.

**Kind:** docs.

**Cost:** a paragraph in the Solid adapter's page.

## Stage 1 findings with a counterpart in Solid 2's store

"Verified" means a ported test below shows it. "Read" means it rests on the
source only.

| Stage 1 finding                                                 | What Solid 2 does                                                                                                                                          | Basis                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1. `Object.defineProperty` on a store is silent                 | Inside a setter it is an ordinary write. Outside it is ignored, with a development warning                                                                 | Verified, port 4         |
| 2. A snapshot after one row costs time per row                  | No better: `snapshot` copies every owned record on every call and has no cache; `deep` walks every record                                                  | Verified, port 7         |
| 3. A getter over many rows is slow to recompute                 | The store does not memoize getters. A class getter is re-run on every write to its instance                                                                | Verified, port 2         |
| 5. A function in an array is a new wrapper per read             | Functions are returned as they are                                                                                                                         | Verified, port 3         |
| 6. A class held in a store is a bound wrapper                   | The class itself comes back                                                                                                                                | Verified, port 3         |
| 7. `list.includes(raw)` misses                                  | The same: `false` for the raw object, `true` for the proxy. No array method is instrumented                                                                | Verified, port 3         |
| 8. A store that refers to itself cannot be snapshotted          | Works for writes, `snapshot` and `deep`                                                                                                                    | Verified, port 3         |
| 9. A class instance that is already a store is not connected    | One record per raw object, across all stores. A write through one store reaches an effect reading through the other                                        | Verified, port 3         |
| 10. Raw objects end up holding proxies                          | The `set` trap unwraps a store proxy before storing it (`store.ts` 2417 to 2420)                                                                           | Verified, extra check    |
| 11. A write through the raw object is invisible                 | Before the first setter write the raw object is the backing, so the write shows, untracked. After it the store reads its clone                             | Verified, port 5         |
| 12. A native `Set` or `Map` holds raw members                   | The same. Native collections are leaves                                                                                                                    | Verified, port 2         |
| 18. A sync subscriber that writes recurses                      | A setter called inside a computation throws `REACTIVE_WRITE_IN_OWNED_SCOPE` in development. Production performs the write                                  | Verified, port 5         |
| 29. A delete that removes nothing counts as a write             | No notification. A write of the value already held is silent too                                                                                           | Verified, port 4         |
| 30. A getter reading `Object.keys(this)` goes stale             | Tracked through the `has` and `ownKeys` traps                                                                                                              | Verified, port 4         |
| 31, 41. A snapshot getter sees no keys; `this` is a bare proxy  | No tracking proxy. A snapshot is a copy with the same prototype and the accessor copied onto it                                                            | Verified, port 2         |
| 32. A getter reading a missing property recomputes on each read | Reading an absent key subscribes to that key                                                                                                               | Verified, port 4         |
| 36. A getter misses some of what it reads                       | An own accessor tracks everything it reads. A prototype getter tracks nothing and goes stale over nested data                                              | Verified, port 2         |
| 42. `constructor` through a store is a bound wrapper            | A plain read answers the class                                                                                                                             | Verified, port 2         |
| 44. A redefined getter keeps the old result                     | Accessor-ness is read again when the key is written (`store.ts` 1162). A getter defined in a setter was tracked                                            | Verified in part, port 4 |
| 45. `defineProperty` leaves the old child in place              | The new object is read and snapshotted                                                                                                                     | Verified, port 4         |
| 46. Freezing a raw object behind the store makes reads throw    | Reads keep working, because the proxy target is an empty shell. The frozen object becomes a leaf: a later write below it lands on the raw object, silently | Verified, port 1         |
| 47. A cached getter survives a prototype change                 | `setPrototypeOf` is refused (`store.ts` 2511). The wrappability verdict is cached per prototype for good                                                   | Read                     |
| 48. `Object.assign` with a `__proto__` key swaps the prototype  | The `set` trap ignores `__proto__` (`store.ts` 2410), and an inherited `__proto__` or `prototype` is never served (2277 to 2284)                           | Read                     |
| 50. A descriptor read hands out the raw object                  | The same                                                                                                                                                   | Verified, port 4         |
| 51. `structuredClone(store)` throws                             | The same. `JSON.stringify` and spread work                                                                                                                 | Verified, port 4         |
| 61, 66 to 69, 72. Suspending and resuming detached subtrees     | No counterpart. See the note in finding 10                                                                                                                 | Read                     |
| 63. A typed-array store                                         | A typed array is a leaf                                                                                                                                    | Verified, extra check    |

Two rows are cheap to copy and not covered by a finding above:

- **29.** Check `Object.hasOwn(_target, prop)` before deleting in the
  `deleteProperty` trap (`core/core.ts:515-524`), and stay silent when the
  key is not there.
- **48.** Solid refuses `__proto__` as a written key outright. Whether we
  should is a question for the security report.

## The eight API questions, from Solid 2's point of view

1. **Should synchronous notification be the default for `subscribe()`?**
   No. Solid 2 goes further the other way: a write is staged, and nothing
   sees it until the flush, not even a plain read outside a computation (port
   7: 1 before `flush()`, 2 after). There is no synchronous subscription in
   the store's public API. Batched by default, with `flush()` for imperative
   code, is its position. Our Solid adapter subscribes synchronously and
   lets Solid schedule (`frameworks/solid/solid.ts:29-36`), which fits:
   synchronous delivery is a tool for adapter authors.
2. **Should writes outside a store method be allowed, warned about, or
   grouped automatically? Does `batch()` belong in the API?** Not allowed:
   ignored, with a development warning (finding 8). Grouping is automatic and
   total: the setter is the transaction, and every setter before a flush
   lands together. `@solidjs/signals` 2.0.0 exports no `batch` (checked);
   `flush` is the only control, and it pushes the other way. For us that
   reads as: `batch()` exists only because synchronous subscribers do.
3. **Should snapshot getters stay enumerable own accessors?** Solid keeps a
   property where it was. An own accessor is copied as the same accessor,
   with its own enumerability (`store.ts` 2929 to 2932); a prototype getter
   stays on the prototype, because the copy is made with the source's
   prototype (line 2918). It never turns an inherited getter into an own
   property. It also does not memoize, which is why it has no need to.
4. **Can arrow-function methods and `#private` fields be made to work?**
   Solid makes neither work and has no device for it. An arrow-function
   method's write is lost (port 2). A method that touches a `#private` field
   throws a `TypeError` when called through the store (port 9). A prototype
   getter that reads one works, only because Solid runs it against the raw
   object (finding 2). No position on a base class or a constructor that
   returns the proxy.
5. **Should native `Map` and `Set` be reactive directly?** No. They are
   leaves by a tag check, served raw; only the property that holds one is
   tracked. The stated reason is that native methods check internal slots
   and throw on a proxy. The package has no reactive collection of its own.
6. **Opt-in or opt-out for nested class instances?** Opt-out. Class
   instances wrap; `markRaw`, freezing and being a platform object keep one
   out (finding 4).
7. **Are entry points, export names and adapter names consistent?** Three
   observations, none strong:
   - `snapshot` means two things. Solid's is an unfrozen copy that shares
     objects with the source; ours is frozen and cached. A Solid app that
     uses our adapter can import both.
   - Solid names a primitive that creates reactive state `create*`
     (`createStore`, `createMemo`). `useClassyStore` returns an accessor,
     which is what a Solid user expects to get, and `createClassyStore` is
     taken by the core.
   - A Solid user expects per-property updates from a store. Our adapter
     hands out one accessor for the whole snapshot. This is reasoning, not
     tested, and belongs to the adapters report.
8. **What development-only diagnostics would catch our silent failure
   modes?** Finding 8 lists five with their detectors. Solid's lessons are
   about form: a stable code in the message, once per object and key, in a
   build of its own. It catches the write after an `await` because it
   forbids every write outside the setter, which we cannot copy; and it does
   not catch the arrow-function write at all.

## Ported tests

Every port prints what happened and never stops on a throw. Biome reformatted
the code blocks when this file was formatted, so they are longer here than the
scratch files they came from; the code is the same. The output blocks were
produced by running those scratch files on `825ba2d`, whose library source is
identical to `9ab9744`, where the work started. The helper the ports share:

```js
// Shared by every port: run a case, print what happened, never stop on a throw.
const logs = [];
for (const level of ['warn', 'error']) {
  const original = console[level];
  console[level] = (...args) => {
    const first = String(args[0]).split('\n')[0];
    logs.push(
      `console.${level}: ${first.length > 230 ? first.slice(0, 230) + '…' : first}`,
    );
  };
  console[`_${level}`] = original;
}
export function show(label, fn) {
  let out;
  try {
    const value = fn();
    out = typeof value === 'string' ? value : JSON.stringify(value);
  } catch (error) {
    out = `THROWS ${error?.constructor?.name}: ${String(error?.message).split('\n')[0].slice(0, 200)}`;
  }
  console.log(`  ${label} -> ${out}`);
  while (logs.length) console.log(`    [${logs.shift()}]`);
}
export function title(text) {
  console.log(`\n${text}`);
}
```

Solid ports were run with `node --conditions=development <file>` unless a
section says otherwise. Ours were run with `bun <file>`.

### Port 1: a frozen object held in a store; freezing through and behind it

Solid:

```js
import {
  createStore,
  snapshot,
  createRoot,
  createEffect,
  flush,
} from '@solidjs/signals';
import {show, title} from './helper.mjs';

title('1. A frozen object held in a store');
const frozen = Object.freeze({nested: {n: 1}, list: [1, 2]});
const [store, setStore] = createStore({config: frozen, live: {n: 1}});
show(
  'store.config === frozen (kept by reference)',
  () => store.config === frozen,
);
show('store.config.nested.n', () => store.config.nested.n);
show(
  'store.config.nested is the raw nested object',
  () => store.config.nested === frozen.nested,
);
show(
  'store.live is a proxy',
  () => store.live !== snapshot(store).live || 'same object',
);
let runs = 0;
createRoot(() =>
  createEffect(
    () => store.config.nested.n,
    () => void runs++,
  ),
);
flush();
show('write inside the frozen value, in a setter', () => {
  setStore((s) => {
    s.config.nested.n = 2;
  });
  flush();
  return {
    storeReads: store.config.nested.n,
    rawReads: frozen.nested.n,
    effectRuns: runs,
  };
});
show('replace the frozen value', () => {
  setStore((s) => {
    s.config = Object.freeze({nested: {n: 9}});
  });
  flush();
  return {storeReads: store.config.nested.n, effectRuns: runs};
});

title('1b. Freezing through the store, and behind it');
const raw = {config: {nested: {n: 1}}};
const [s2, setS2] = createStore(raw);
show('Object.freeze(store)', () => {
  Object.freeze(s2);
  return Object.isFrozen(s2);
});
show('Object.preventExtensions(store)', () => {
  Object.preventExtensions(s2);
  return Object.isExtensible(s2);
});
s2.config.nested; // hand out the proxy first, as our finding 46 does
show('freeze the raw child behind the store, then read below it', () => {
  Object.freeze(raw.config);
  return s2.config.nested.n;
});
show('then write below it in a setter', () => {
  setS2((s) => {
    s.config.nested.n = 5;
  });
  flush();
  return {storeReads: s2.config.nested.n, rawReads: raw.config.nested.n};
});
```

```text
$ node --conditions=development 01-frozen.solid.mjs
1. A frozen object held in a store
  store.config === frozen (kept by reference) -> true
  store.config.nested.n -> 1
  store.config.nested is the raw nested object -> true
  store.live is a proxy -> true
  write inside the frozen value, in a setter -> {"storeReads":2,"rawReads":2,"effectRuns":1}
  replace the frozen value -> {"storeReads":9,"effectRuns":2}

1b. Freezing through the store, and behind it
  Object.freeze(store) -> THROWS TypeError: 'preventExtensions' on proxy: trap returned falsish
  Object.preventExtensions(store) -> THROWS TypeError: 'preventExtensions' on proxy: trap returned falsish
  freeze the raw child behind the store, then read below it -> 1
  then write below it in a setter -> {"storeReads":5,"rawReads":5}
```

Ours:

```ts
import {
  createClassyStore,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {show, title} from './helper.mjs';

title('1. A frozen object held in a store');
const frozen = Object.freeze({nested: {n: 1}, list: [1, 2]});
const store = createClassyStore({
  config: frozen as {nested: {n: number}},
  live: {n: 1},
});
show(
  'store.config === frozen (kept by reference)',
  () => store.config === frozen,
);
show('store.config.nested.n', () => store.config.nested.n);
show(
  'store.config.nested is the raw nested object',
  () => store.config.nested === frozen.nested,
);
let calls = 0;
subscribe(store, () => void calls++, {sync: true});
show('write inside the frozen value', () => {
  store.config.nested.n = 2;
  return {
    storeReads: store.config.nested.n,
    rawReads: frozen.nested.n,
    snapshotReads: snapshot(store).config.nested.n,
    subscriberCalls: calls,
  };
});

title('1b. Freezing through the store, and behind it');
const raw = {config: {nested: {n: 1}}};
const s2 = createClassyStore(raw);
s2.config.nested;
show('freeze the raw child behind the store, then read below it', () => {
  Object.freeze(raw.config);
  return s2.config.nested.n;
});
```

```text
$ bun 01-frozen.classy.ts
1. A frozen object held in a store
  store.config === frozen (kept by reference) -> true
  store.config.nested.n -> 1
  store.config.nested is the raw nested object -> true
  write inside the frozen value -> {"storeReads":2,"rawReads":2,"snapshotReads":2,"subscriberCalls":0}

1b. Freezing through the store, and behind it
  freeze the raw child behind the store, then read below it -> THROWS TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
```

### Port 2: a class instance held in a store; getters on a class

Solid:

```js
import {
  createStore,
  snapshot,
  createRoot,
  createEffect,
  createMemo,
  flush,
  isWrappable,
} from '@solidjs/signals';
import {show, title} from './helper.mjs';

class Counter {
  count = 1;
  items = [{price: 2}, {price: 3}];
  static label = 'counter';
  get double() {
    Counter.doubleRuns++;
    return this.count * 2;
  }
  get total() {
    Counter.totalRuns++;
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
  increment() {
    this.count++;
  }
  arrow = () => {
    this.count++;
  };
}
Counter.doubleRuns = 0;
Counter.totalRuns = 0;

title('2. A class instance held in a store, with no opt-in');
const raw = new Counter();
const [store, setStore] = createStore({
  inner: raw,
  when: new Date(0),
  map: new Map([['k', 1]]),
});
show('isWrappable(new Counter())', () => isWrappable(new Counter()));
show('isWrappable(new Date()), isWrappable(new Map())', () => [
  isWrappable(new Date()),
  isWrappable(new Map()),
]);
show('store.inner is a proxy, not the raw instance', () => store.inner !== raw);
show('store.inner instanceof Counter', () => store.inner instanceof Counter);
show('store.inner.constructor === Counter, and its static', () => [
  store.inner.constructor === Counter,
  store.inner.constructor.label,
]);
show('store.when and store.map are the raw objects', () => [
  store.when instanceof Date,
  store.map.get('k'),
]);

title('5. A getter on a class used as store state');
let seenDouble, seenTotal;
Counter.doubleRuns = Counter.totalRuns = 0;
createRoot(() => {
  createEffect(
    () => store.inner.double,
    (v) => {
      seenDouble = v;
    },
  );
  createEffect(
    () => store.inner.total,
    (v) => {
      seenTotal = v;
    },
  );
});
flush();
show('first effect run', () => ({
  seenDouble,
  seenTotal,
  doubleRuns: Counter.doubleRuns,
  totalRuns: Counter.totalRuns,
}));
Counter.doubleRuns = Counter.totalRuns = 0;
show('two untracked reads of store.inner.double', () => {
  store.inner.double;
  store.inner.double;
  return {doubleRuns: Counter.doubleRuns};
});
Counter.doubleRuns = Counter.totalRuns = 0;
show('write the field the getter reads: s.inner.count = 5', () => {
  setStore((s) => {
    s.inner.count = 5;
  });
  flush();
  return {
    seenDouble,
    doubleRuns: Counter.doubleRuns,
    totalRuns: Counter.totalRuns,
  };
});
Counter.doubleRuns = Counter.totalRuns = 0;
show('write a nested row the getter reads: s.inner.items[0].price = 10', () => {
  setStore((s) => {
    s.inner.items[0].price = 10;
  });
  flush();
  return {
    seenTotal,
    untrackedRead: store.inner.total,
    totalRuns: Counter.totalRuns,
  };
});
show('call a prototype method on the draft: s.inner.increment()', () => {
  setStore((s) => {
    s.inner.increment();
  });
  flush();
  return {count: store.inner.count, seenDouble, rawCount: raw.count};
});
show('call an arrow-function method on the draft: s.inner.arrow()', () => {
  setStore((s) => {
    s.inner.arrow();
  });
  flush();
  return {count: store.inner.count, seenDouble, rawCount: raw.count};
});
show(
  'call a prototype method outside a setter: store.inner.increment()',
  () => {
    store.inner.increment();
    flush();
    return {count: store.inner.count, rawCount: raw.count};
  },
);

title('5b. The same getters as own accessors on an object literal');
let ownRuns = 0;
const [lit, setLit] = createStore({
  items: [{price: 2}, {price: 3}],
  get total() {
    ownRuns++;
    return this.items.reduce((sum, item) => sum + item.price, 0);
  },
});
let seenLit;
createRoot(() =>
  createEffect(
    () => lit.total,
    (v) => {
      seenLit = v;
    },
  ),
);
flush();
ownRuns = 0;
show('write a nested row: s.items[0].price = 10', () => {
  setLit((s) => {
    s.items[0].price = 10;
  });
  flush();
  return {seenLit, ownRuns};
});
ownRuns = 0;
show('write an unrelated key, then read the getter in a memo twice', () => {
  const memo = createRoot(() => createMemo(() => lit.total));
  memo();
  memo();
  return {ownRuns};
});
show('snapshot(store) keeps the getter as an accessor', () => {
  const d = Object.getOwnPropertyDescriptor(snapshot(lit), 'total');
  return {
    hasGetter: typeof d.get === 'function',
    frozen: Object.isFrozen(snapshot(lit)),
  };
});
```

```text
$ node --conditions=development 02-class.solid.mjs
2. A class instance held in a store, with no opt-in
  isWrappable(new Counter()) -> true
  isWrappable(new Date()), isWrappable(new Map()) -> [false,false]
  store.inner is a proxy, not the raw instance -> true
  store.inner instanceof Counter -> true
  store.inner.constructor === Counter, and its static -> [true,"counter"]
  store.when and store.map are the raw objects -> [true,1]

5. A getter on a class used as store state
  first effect run -> {"seenDouble":2,"seenTotal":5,"doubleRuns":2,"totalRuns":2}
  two untracked reads of store.inner.double -> {"doubleRuns":0}
  write the field the getter reads: s.inner.count = 5 -> {"seenDouble":10,"doubleRuns":1,"totalRuns":1}
  write a nested row the getter reads: s.inner.items[0].price = 10 -> {"seenTotal":5,"untrackedRead":5,"totalRuns":0}
  call a prototype method on the draft: s.inner.increment() -> {"count":6,"seenDouble":12,"rawCount":1}
  call an arrow-function method on the draft: s.inner.arrow() -> {"count":6,"seenDouble":12,"rawCount":2}
  call a prototype method outside a setter: store.inner.increment() -> {"count":6,"rawCount":2}
    [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Writing store property "count" outside its setter was ignored. Stores are read-only outside the setter's draft: use `setStore(s => { s.count = value })`.]

5b. The same getters as own accessors on an object literal
  write a nested row: s.items[0].price = 10 -> {"seenLit":13,"ownRuns":1}
  write an unrelated key, then read the getter in a memo twice -> {"ownRuns":1}
  snapshot(store) keeps the getter as an accessor -> {"hasGetter":true,"frozen":false}
```

Ours:

```ts
import {
  createClassyStore,
  snapshot,
  subscribe,
  PROXYABLE,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {show, title} from './helper.mjs';

class Counter {
  count = 1;
  items = [{price: 2}, {price: 3}];
  static label = 'counter';
  static doubleRuns = 0;
  static totalRuns = 0;
  get double() {
    Counter.doubleRuns++;
    return this.count * 2;
  }
  get total() {
    Counter.totalRuns++;
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
  increment() {
    this.count++;
  }
  arrow = () => {
    this.count++;
  };
}
class Opted extends Counter {
  static [PROXYABLE] = true;
}

title('2. A class instance held in a store, with no opt-in');
const raw = new Counter();
const store = createClassyStore({inner: raw, opted: new Opted()});
let calls = 0;
subscribe(store, () => void calls++, {sync: true});
show('store.inner is a proxy, not the raw instance', () => store.inner !== raw);
show(
  'store.opted is a proxy (PROXYABLE)',
  () => store.opted !== snapshot(store).opted,
);
show('store.opted.constructor === Opted, and its static', () => [
  store.opted.constructor === Opted,
  (store.opted.constructor as typeof Opted).label,
]);
show('store.inner.increment() notifies', () => {
  store.inner.increment();
  return {count: store.inner.count, subscriberCalls: calls};
});
calls = 0;
show('store.opted.increment() notifies', () => {
  store.opted.increment();
  return {count: store.opted.count, subscriberCalls: calls};
});
calls = 0;
show('store.opted.arrow() notifies', () => {
  store.opted.arrow();
  return {
    count: store.opted.count,
    snapshotCount: snapshot(store).opted.count,
    subscriberCalls: calls,
  };
});

title('5. A getter on a class used as store state');
const root = createClassyStore(new Counter());
Counter.doubleRuns = Counter.totalRuns = 0;
show('two reads of root.double', () => {
  root.double;
  root.double;
  return {doubleRuns: Counter.doubleRuns};
});
Counter.totalRuns = 0;
show('write a nested row the getter reads', () => {
  root.total;
  root.items[0].price = 10;
  return {total: root.total, again: root.total, totalRuns: Counter.totalRuns};
});
```

```text
$ bun 02-class.classy.ts
2. A class instance held in a store, with no opt-in
  store.inner is a proxy, not the raw instance -> false
  store.opted is a proxy (PROXYABLE) -> true
  store.opted.constructor === Opted, and its static -> [false,null]
  store.inner.increment() notifies -> {"count":2,"subscriberCalls":0}
  store.opted.increment() notifies -> {"count":2,"subscriberCalls":1}
  store.opted.arrow() notifies -> {"count":3,"snapshotCount":3,"subscriberCalls":0}

5. A getter on a class used as store state
  two reads of root.double -> {"doubleRuns":1}
  write a nested row the getter reads -> {"total":13,"again":13,"totalRuns":2}
```

### Port 3: function identity, `includes(raw)`, shared objects, cycles

Solid:

```js
import {
  createStore,
  snapshot,
  deep,
  createRoot,
  createEffect,
  flush,
} from '@solidjs/signals';
import {show, title} from './helper.mjs';

title('3. A function held in an array, read twice; a class held in a store');
class Model {
  static label = 'model';
  constructor(name) {
    this.name = name;
  }
}
const first = () => 1;
const second = () => 2;
const [store, setStore] = createStore({
  callbacks: [first, second],
  Model,
  handler: first,
});
show(
  'store.callbacks[0] === store.callbacks[0]',
  () => store.callbacks[0] === store.callbacks[0],
);
show('store.callbacks[0] === first', () => store.callbacks[0] === first);
show('store.callbacks.indexOf(first)', () => store.callbacks.indexOf(first));
show('remove the first callback by indexOf, in a setter', () => {
  setStore((s) => {
    s.callbacks.splice(s.callbacks.indexOf(first), 1);
  });
  flush();
  return store.callbacks.length === 1 && store.callbacks[0] === second
    ? 'second is left'
    : 'wrong one removed';
});
show('store.Model === Model, store.Model.label', () => [
  store.Model === Model,
  store.Model.label,
]);
show(
  'new store.Model("x") instanceof store.Model',
  () => new store.Model('x') instanceof store.Model,
);
show('store.handler === store.handler', () => store.handler === store.handler);
show(
  'a prototype method read twice is the same function',
  () =>
    store.callbacks.push === store.callbacks.push &&
    store.callbacks.push === Array.prototype.push,
);

title('4. list.includes(raw)');
const row = {id: 1};
const other = {id: 2};
const [rows, setRows] = createStore({list: [row, other]});
show(
  'rows.list[0] === row (the list hands out proxies)',
  () => rows.list[0] === row,
);
show('rows.list.includes(row)', () => rows.list.includes(row));
show('rows.list.indexOf(row), lastIndexOf(other)', () => [
  rows.list.indexOf(row),
  rows.list.lastIndexOf(other),
]);
show('rows.list.includes(rows.list[0])', () =>
  rows.list.includes(rows.list[0]),
);
show('rows.list.indexOf(rows.list[1])', () => rows.list.indexOf(rows.list[1]));
show('inside a setter: s.list.includes(row), s.list.indexOf(s.list[1])', () => {
  let out;
  setRows((s) => {
    out = [s.list.includes(row), s.list.indexOf(s.list[1])];
  });
  return out;
});
show('after a write to the row: rows.list.includes(row)', () => {
  setRows((s) => {
    s.list[0].id = 10;
  });
  flush();
  return {
    includesRaw: rows.list.includes(row),
    rawId: row.id,
    storeId: rows.list[0].id,
  };
});

title('16. One raw object in two places and in two stores');
const shared = {n: 1};
const [a] = createStore({x: shared, y: shared});
const [b, setB] = createStore({z: shared});
show('a.x === a.y', () => a.x === a.y);
show(
  'a.x === b.z (one proxy per raw object, across stores)',
  () => a.x === b.z,
);
show(
  'createStore(raw)[0] === createStore(raw)[0]',
  () => createStore(shared)[0] === createStore(shared)[0],
);
let seen;
createRoot(() =>
  createEffect(
    () => a.x.n,
    (v) => {
      seen = v;
    },
  ),
);
flush();
show('write through store b, read through store a', () => {
  setB((s) => {
    s.z.n = 2;
  });
  flush();
  return {aReads: a.x.n, bReads: b.z.n, effectOnASaw: seen, raw: shared.n};
});

title('9. A self-referencing object');
const [cyc, setCyc] = createStore({name: 'root', child: {n: 1}});
show('s.self = s in a setter', () => {
  setCyc((s) => {
    s.self = s;
  });
  flush();
  return cyc.self === cyc;
});
show('snapshot(store)', () => {
  const snap = snapshot(cyc);
  return {selfIsSnapshot: snap.self === snap, name: snap.self.self.name};
});
show('deep(store) inside an effect', () => {
  let out;
  createRoot(() =>
    createEffect(
      () => deep(cyc),
      (v) => {
        out = v.self === v;
      },
    ),
  );
  flush();
  return out;
});
show('a raw cycle given to createStore', () => {
  const node = {n: 1};
  node.self = node;
  const [c] = createStore(node);
  return [
    c.self === c,
    c.self.self.n,
    snapshot(c).self === snapshot(c).self.self,
  ];
});
```

```text
$ node --conditions=development 03-identity.solid.mjs
3. A function held in an array, read twice; a class held in a store
  store.callbacks[0] === store.callbacks[0] -> true
  store.callbacks[0] === first -> true
  store.callbacks.indexOf(first) -> 0
  remove the first callback by indexOf, in a setter -> second is left
  store.Model === Model, store.Model.label -> [true,"model"]
  new store.Model("x") instanceof store.Model -> true
  store.handler === store.handler -> true
  a prototype method read twice is the same function -> true

4. list.includes(raw)
  rows.list[0] === row (the list hands out proxies) -> false
  rows.list.includes(row) -> false
  rows.list.indexOf(row), lastIndexOf(other) -> [-1,-1]
  rows.list.includes(rows.list[0]) -> true
  rows.list.indexOf(rows.list[1]) -> 1
  inside a setter: s.list.includes(row), s.list.indexOf(s.list[1]) -> [false,1]
  after a write to the row: rows.list.includes(row) -> {"includesRaw":false,"rawId":1,"storeId":10}

16. One raw object in two places and in two stores
  a.x === a.y -> true
  a.x === b.z (one proxy per raw object, across stores) -> true
  createStore(raw)[0] === createStore(raw)[0] -> true
  write through store b, read through store a -> {"aReads":2,"bReads":2,"effectOnASaw":2,"raw":1}

9. A self-referencing object
  s.self = s in a setter -> true
  snapshot(store) -> {"selfIsSnapshot":true,"name":"root"}
  deep(store) inside an effect -> true
  a raw cycle given to createStore -> [true,1,true]
```

### Port 4: `defineProperty`, descriptors, `in` and `Object.keys`, empty writes

Solid:

```js
import {
  createStore,
  snapshot,
  createRoot,
  createEffect,
  createMemo,
  flush,
  untrack,
} from '@solidjs/signals';
import {show, title} from './helper.mjs';

title('6. Object.defineProperty through the proxy');
const [store, setStore] = createStore({a: 1, child: {n: 1}});
let seenB = 'never ran',
  keyRuns = 0;
createRoot(() => {
  createEffect(
    () => store.b,
    (v) => {
      seenB = v;
    },
  );
  createEffect(
    () => Object.keys(store).join(),
    () => void keyRuns++,
  );
});
flush();
show(
  'outside a setter: Object.defineProperty(store, "b", {value: 2, ...})',
  () => {
    const result = Reflect.defineProperty(store, 'b', {
      value: 2,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    flush();
    return {
      trapReturned: result,
      storeB: store.b,
      seenB,
      keys: Object.keys(store),
    };
  },
);
show('inside a setter: Object.defineProperty(s, "b", {value: 2, ...})', () => {
  setStore((s) => {
    Object.defineProperty(s, 'b', {
      value: 2,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });
  flush();
  return {storeB: store.b, seenB, keyRuns, snapshotB: snapshot(store).b};
});
show('inside a setter: redefine a property that holds an object', () => {
  const other = {n: 99};
  setStore((s) => {
    Object.defineProperty(s, 'child', {
      value: other,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });
  flush();
  return {childN: store.child.n, snapshotChildN: snapshot(store).child.n};
});
show(
  'inside a setter: define a non-writable, non-configurable property, then read it',
  () => {
    setStore((s) => {
      Object.defineProperty(s, 'locked', {
        value: {n: 1},
        writable: false,
        enumerable: true,
        configurable: false,
      });
    });
    flush();
    const d = Object.getOwnPropertyDescriptor(store, 'locked');
    return {
      lockedN: store.locked.n,
      isProxy: store.locked !== d.value,
      reportedConfigurable: d.configurable,
      reportedWritable: d.writable,
    };
  },
);
show('then assign to it in a setter', () => {
  setStore((s) => {
    s.locked = {n: 2};
  });
  flush();
  return store.locked.n;
});
show('inside a setter: define a getter', () => {
  setStore((s) => {
    Object.defineProperty(s, 'twice', {
      get() {
        return this.a * 2;
      },
      enumerable: true,
      configurable: true,
    });
  });
  flush();
  let seen;
  createRoot(() =>
    createEffect(
      () => store.twice,
      (v) => {
        seen = v;
      },
    ),
  );
  flush();
  setStore((s) => {
    s.a = 5;
  });
  flush();
  return {twice: store.twice, effectSaw: seen};
});

title('15. What a descriptor read hands out');
show(
  'Object.getOwnPropertyDescriptor(store, "child").value is the proxy',
  () => {
    const d = Object.getOwnPropertyDescriptor(store, 'child');
    return {isStoreChild: d.value === store.child, isObject: typeof d.value};
  },
);
show('structuredClone(store)', () => structuredClone(store).a);
show('JSON.stringify(store)', () => JSON.stringify(store));
show('{...store} and Object.entries(store).length', () => [
  Object.keys({...store}).join(),
  Object.entries(store).length,
]);

title(
  "7. 'key' in store and Object.keys(store) inside a computation, then a key is added",
);
const [bag, setBag] = createStore({a: 1, b: 2});
let hasRuns = 0,
  keysRuns = 0,
  hasC,
  keys,
  forInKeys;
createRoot(() => {
  createEffect(
    () => 'c' in bag,
    (v) => {
      hasRuns++;
      hasC = v;
    },
  );
  createEffect(
    () => Object.keys(bag),
    (v) => {
      keysRuns++;
      keys = v.join();
    },
  );
  createEffect(
    () => {
      const out = [];
      for (const k in bag) out.push(k);
      return out.join();
    },
    (v) => {
      forInKeys = v;
    },
  );
});
flush();
show('first run', () => ({hasC, keys, forInKeys, hasRuns, keysRuns}));
show('change a value only: s.a = 10', () => {
  setBag((s) => {
    s.a = 10;
  });
  flush();
  return {hasRuns, keysRuns};
});
show('add another key: s.d = 4', () => {
  setBag((s) => {
    s.d = 4;
  });
  flush();
  return {hasC, keys, hasRuns, keysRuns};
});
show('add the key: s.c = 3', () => {
  setBag((s) => {
    s.c = 3;
  });
  flush();
  return {hasC, keys, forInKeys, hasRuns, keysRuns};
});
show('delete the key: delete s.c', () => {
  setBag((s) => {
    delete s.c;
  });
  flush();
  return {hasC, keys, hasRuns, keysRuns};
});

title(
  '12. A delete that removes nothing; a write of the value a field already holds',
);
let anyRuns = 0;
createRoot(() =>
  createEffect(
    () => [bag.a, Object.keys(bag).length, 'missing' in bag, bag.missing],
    () => void anyRuns++,
  ),
);
flush();
anyRuns = 0;
show('delete s.missing', () => {
  setBag((s) => {
    delete s.missing;
  });
  flush();
  return {effectRuns: anyRuns};
});
show('s.a = s.a', () => {
  setBag((s) => {
    s.a = untrack(() => bag.a);
  });
  flush();
  return {effectRuns: anyRuns};
});

title('12b. Own getter that reads its own keys');
const [dict, setDict] = createStore({
  a: 1,
  b: 2,
  get count() {
    return Object.keys(this).length;
  },
  get hasB() {
    return 'b' in this;
  },
});
let seenCount, seenHasB;
createRoot(() => {
  createEffect(
    () => dict.count,
    (v) => {
      seenCount = v;
    },
  );
  createEffect(
    () => dict.hasB,
    (v) => {
      seenHasB = v;
    },
  );
});
flush();
show('first run', () => ({seenCount, seenHasB}));
show('delete s.b', () => {
  setDict((s) => {
    delete s.b;
  });
  flush();
  return {seenCount, seenHasB, snapshotCount: snapshot(dict).count};
});
```

```text
$ node --conditions=development 04-traps.solid.mjs
6. Object.defineProperty through the proxy
  outside a setter: Object.defineProperty(store, "b", {value: 2, ...}) -> {"trapReturned":true,"keys":["a","child"]}
    [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Writing store property "b" outside its setter was ignored. Stores are read-only outside the setter's draft: use `setStore(s => { s.b = value })`.]
  inside a setter: Object.defineProperty(s, "b", {value: 2, ...}) -> {"storeB":2,"seenB":2,"keyRuns":2,"snapshotB":2}
  inside a setter: redefine a property that holds an object -> {"childN":99,"snapshotChildN":99}
  inside a setter: define a non-writable, non-configurable property, then read it -> THROWS TypeError: 'defineProperty' on proxy: trap returned truish for defining non-configurable property 'locked' which is either non-existent or configurable in the proxy target
  then assign to it in a setter -> THROWS TypeError: Cannot assign to read only property 'locked' of object '#<Object>'
  inside a setter: define a getter -> {"twice":10,"effectSaw":10}

15. What a descriptor read hands out
  Object.getOwnPropertyDescriptor(store, "child").value is the proxy -> {"isStoreChild":false,"isObject":"object"}
  structuredClone(store) -> THROWS DOMException: #<Object> could not be cloned.
  JSON.stringify(store) -> {"a":5,"child":{"n":99},"b":2,"locked":{"n":1},"twice":10}
  {...store} and Object.entries(store).length -> ["a,child,b,locked,twice",5]

7. 'key' in store and Object.keys(store) inside a computation, then a key is added
  first run -> {"hasC":false,"keys":"a,b","forInKeys":"a,b","hasRuns":1,"keysRuns":1}
  change a value only: s.a = 10 -> {"hasRuns":1,"keysRuns":1}
  add another key: s.d = 4 -> {"hasC":false,"keys":"a,b,d","hasRuns":1,"keysRuns":2}
  add the key: s.c = 3 -> {"hasC":true,"keys":"a,b,d,c","forInKeys":"a,b,d,c","hasRuns":2,"keysRuns":3}
  delete the key: delete s.c -> {"hasC":false,"keys":"a,b,d","hasRuns":3,"keysRuns":4}

12. A delete that removes nothing; a write of the value a field already holds
  delete s.missing -> {"effectRuns":0}
  s.a = s.a -> {"effectRuns":0}

12b. Own getter that reads its own keys
  first run -> {"seenCount":4,"seenHasB":true}
  delete s.b -> {"seenCount":3,"seenHasB":false,"snapshotCount":3}
```

### Port 5: writes outside a setter in three builds; the raw object; a shared child

Solid:

```js
import {
  createStore,
  snapshot,
  createRoot,
  createEffect,
  createMemo,
  flush,
  DEV,
  OBSERVE,
} from '@solidjs/signals';
import {show, title} from './helper.mjs';

title('8. A write outside any setter');
show('which build is this', () => ({
  DEV: DEV !== undefined,
  OBSERVE: OBSERVE !== undefined,
}));
const events = [];
const stop = OBSERVE?.diagnostics.subscribe((event) =>
  events.push(`${event.code}/${event.severity}/${JSON.stringify(event.data)}`),
);
const raw = {count: 0, list: [1], user: {name: 'a'}};
const [store, setStore] = createStore(raw);
show('store.count = 5', () => {
  store.count = 5;
  return {storeCount: store.count, rawCount: raw.count};
});
show('store.count = 6 again (same key)', () => {
  store.count = 6;
  return store.count;
});
show('store.list.push(2)', () => {
  const length = store.list.push(2);
  return {returned: length, storeLength: store.list.length};
});
show('delete store.user', () => {
  const ok = delete store.user;
  return {deleteReturned: ok, stillThere: 'user' in store};
});
show('"use strict" assignment does not throw', () => {
  'use strict';
  store.count = 7;
  return 'no throw';
});
show('structured events on the diagnostics channel', () => events.splice(0));

title('8b. A setter that is async, and a write after an await');
show('setStore(async s => { s.count = 1; await 0; s.count = 2; })', () => {
  setStore(async (s) => {
    s.count = 1;
    await 0;
    s.count = 2;
  });
  return 'no throw';
});
await new Promise((resolve) => setTimeout(resolve, 5));
show('after the await settled', () => ({
  storeCount: store.count,
  events: events.splice(0),
}));
show('a helper that keeps the draft and writes later', () => {
  let kept;
  setStore((s) => {
    kept = s;
  });
  kept.count = 99;
  return {
    storeCount: store.count,
    draftIsStore: kept === store,
    events: events.splice(0),
  };
});

title('8c. A setter inside a computation');
show('setStore inside createMemo', () => {
  createRoot(() => {
    const memo = createMemo(() => {
      setStore((s) => {
        s.count = 3;
      });
      return 1;
    });
    memo();
  });
  return {storeCount: store.count, events: events.splice(0)};
});

title('11. The raw object behind the store');
const source = {n: 1, child: {m: 1}};
const [owned, setOwned] = createStore(source);
let seen;
createRoot(() =>
  createEffect(
    () => owned.n,
    (v) => {
      seen = v;
    },
  ),
);
flush();
show('a write through the setter leaves the raw object alone', () => {
  setOwned((s) => {
    s.n = 2;
    s.child.m = 2;
  });
  flush();
  return {
    storeN: owned.n,
    rawN: source.n,
    rawChildM: source.child.m,
    snapshotIsRaw: snapshot(owned) === source,
  };
});
show('a write to the raw object after the store took its copy', () => {
  source.n = 50;
  flush();
  return {storeN: owned.n, effectSaw: seen};
});
const fresh = {n: 1, child: {m: 1}};
const [unwritten] = createStore(fresh);
show('before any setter write the store reads the raw object itself', () => {
  fresh.n = 7;
  return {storeN: unwritten.n, snapshotIsRaw: snapshot(unwritten) === fresh};
});

title('17. One child under two keys, written through one of them');
const shared = {n: 1};
const [two, setTwo] = createStore({x: shared, y: shared, list: [shared]});
show('write s.x.n = 2', () => {
  setTwo((s) => {
    s.x.n = 2;
  });
  flush();
  const snap = snapshot(two);
  return {
    x: two.x.n,
    y: two.y.n,
    inList: two.list[0].n,
    snapX: snap.x.n,
    snapY: snap.y.n,
    snapList: snap.list[0].n,
    snapShares: snap.x === snap.y,
  };
});
stop?.();
```

Development build:

```text
$ node --conditions=development 05-diagnostics.solid.mjs
8. A write outside any setter
  which build is this -> {"DEV":true,"OBSERVE":true}
  store.count = 5 -> {"storeCount":0,"rawCount":0}
    [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Writing store property "count" outside its setter was ignored. Stores are read-only outside the setter's draft: use `setStore(s => { s.count = value })`.]
  store.count = 6 again (same key) -> 0
  store.list.push(2) -> {"returned":2,"storeLength":1}
    [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Writing store property "1" outside its setter was ignored. Stores are read-only outside the setter's draft: use `setStore(s => { s[1] = value })`.]
    [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Writing store property "length" outside its setter was ignored. Stores are read-only outside the setter's draft: use `setStore(s => { s.length = value })`.]
  delete store.user -> {"deleteReturned":true,"stillThere":true}
    [console.warn: [STORE_WRITE_OUTSIDE_SETTER] Deleting store property "user" outside its setter was ignored. Stores are read-only outside the setter's draft: use `setStore(s => { delete s.user })`.]
  "use strict" assignment does not throw -> no throw
  structured events on the diagnostics channel -> ["STORE_WRITE_OUTSIDE_SETTER/warn/{\"operation\":\"set\",\"property\":\"count\"}","STORE_WRITE_OUTSIDE_SETTER/warn/{\"operation\":\"set\",\"property\":\"1\"}","STORE_WRITE_OUTSIDE_SETTER/warn/{\"operation\":\"set\",\"property\":\"length\"}","STORE_WRITE_OUTSIDE_SETTER/warn/{\"operation\":\"deleteProperty\",\"property\":\"user\"}"]

8b. A setter that is async, and a write after an await
  setStore(async s => { s.count = 1; await 0; s.count = 2; }) -> THROWS Error: [ASYNC_STORE_SETTER] Store setter callback returned a Promise. A store setter is a synchronous transaction: the draft closes when the callback returns, so writes after an `await` are lost. Move the aw
  after the await settled -> {"storeCount":1,"events":["ASYNC_STORE_SETTER/error/{\"operation\":\"setStore\"}"]}
  a helper that keeps the draft and writes later -> {"storeCount":1,"draftIsStore":true,"events":[]}

8c. A setter inside a computation
  setStore inside createMemo -> THROWS StatusError: [REACTIVE_WRITE_IN_OWNED_SCOPE] Writing to reactive state inside an owned scope (component, computation) is not allowed. Move the write outside or set the `ownedWrite` option if this is intentional. (

11. The raw object behind the store
  a write through the setter leaves the raw object alone -> {"storeN":2,"rawN":1,"rawChildM":1,"snapshotIsRaw":false}
  a write to the raw object after the store took its copy -> {"storeN":2,"effectSaw":2}
  before any setter write the store reads the raw object itself -> {"storeN":7,"snapshotIsRaw":true}

17. One child under two keys, written through one of them
  write s.x.n = 2 -> {"x":2,"y":2,"inList":2,"snapX":2,"snapY":2,"snapList":2,"snapShares":true}
```

Production build (plain `node`), the first sections:

```text
$ node 05-diagnostics.solid.mjs | sed -n 1,20p
8. A write outside any setter
  which build is this -> {"DEV":false,"OBSERVE":false}
  store.count = 5 -> {"storeCount":0,"rawCount":0}
  store.count = 6 again (same key) -> 0
  store.list.push(2) -> {"returned":2,"storeLength":1}
  delete store.user -> {"deleteReturned":true,"stillThere":true}
  "use strict" assignment does not throw -> no throw
  structured events on the diagnostics channel -> []

8b. A setter that is async, and a write after an await
  setStore(async s => { s.count = 1; await 0; s.count = 2; }) -> no throw
  after the await settled -> {"storeCount":1,"events":[]}
  a helper that keeps the draft and writes later -> {"storeCount":1,"draftIsStore":true,"events":[]}

8c. A setter inside a computation
  setStore inside createMemo -> {"storeCount":1,"events":[]}

11. The raw object behind the store
  a write through the setter leaves the raw object alone -> {"storeN":2,"rawN":1,"rawChildM":1,"snapshotIsRaw":false}
```

The observe build (`node --conditions=observe`) printed the same as
production, with `{"DEV":false,"OBSERVE":true}` on the first line.

### Port 6: read cost, and the spike

Not the repository's benchmark. The two "classy-store" variants are a copy of
`core/core.ts`, `core/ownership.ts`, `core/core.types.ts`,
`utils/internal/internal.ts` and `types.ts` in the scratch folder, bundled
with `bun build`, once unchanged and once with this diff:

```diff
--- a/core/core.ts
+++ b/core/core.ts
@@ -7,6 +7,31 @@
 import type {DepEntry} from './core.types';
 import {StoreInternal} from './ownership';
 
+
+// SPIKE: per-prototype answer to "which descriptor does this inherited key have".
+const hasOwn = Object.prototype.hasOwnProperty;
+const inheritedCache = new WeakMap<
+  object,
+  Map<string | symbol, PropertyDescriptor | null>
+>();
+function inheritedDescriptor(
+  proto: object | null,
+  prop: string | symbol,
+): PropertyDescriptor | undefined {
+  if (proto === null) return undefined;
+  let table = inheritedCache.get(proto);
+  if (!table) {
+    table = new Map();
+    inheritedCache.set(proto, table);
+  }
+  let found = table.get(prop);
+  if (found === undefined) {
+    found = findPropertyDescriptor(proto, prop) ?? null;
+    table.set(prop, found);
+  }
+  return found ?? undefined;
+}
+
 // ── Global state ──────────────────────────────────────────────────────────────
 
 /** Maps every store proxy → its internal bookkeeping. */
@@ -460,8 +485,15 @@
 
     get(_target, prop, receiver) {
       internal.resumeScope();
-      // 1. Check for getters on the prototype chain (computed values).
-      const getterDesc = findPropertyDescriptor(_target, prop);
+      // SPIKE: an own key of a node with no own accessor is data, with no
+      // descriptor allocated. An inherited key is answered per prototype.
+      let getterDesc: PropertyDescriptor | undefined;
+      if (hasOwn.call(_target, prop)) {
+        if (internal.ownAccessors)
+          getterDesc = Object.getOwnPropertyDescriptor(_target, prop);
+      } else {
+        getterDesc = inheritedDescriptor(Object.getPrototypeOf(_target), prop);
+      }
       if (getterDesc?.get) {
         // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
         const value = evaluateComputed(
@@ -501,6 +533,8 @@
 
     defineProperty(_target, prop, descriptor) {
       const defined = Reflect.defineProperty(_target, prop, descriptor);
+      if (defined && (descriptor.get || descriptor.set))
+        internal.ownAccessors = true;
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
       const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
@@ -538,6 +572,7 @@
         const desc = Object.getOwnPropertyDescriptor(owner.target, key);
         if (desc && 'value' in desc)
           linkChild(owner, key, desc.value, nodes, desc);
+        else if (desc) owner.ownAccessors = true;
       }
     }
   }
--- a/core/ownership.ts
+++ b/core/ownership.ts
@@ -6,6 +6,7 @@
 export class StoreInternal {
   version = 0;
   isStoreRoot = false;
+  ownAccessors = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
   readonly batchedListeners = new Set<() => void>();
```

```js
// Indicative read costs, not the repository's benchmark. Each case reads one
// field in a loop and adds it up so the read cannot be optimised away.
import {createStore, createRoot, createEffect, flush} from '@solidjs/signals';
import * as original from '../spike/orig.mjs';
import * as patched from '../spike/patched.mjs';

class Counter {
  count = 1;
  label = 'a';
  get double() {
    return this.count * 2;
  }
  increment() {
    this.count++;
  }
}

function time(label, read, rounds = 7, iterations = 2_000_000) {
  let sink = 0;
  for (let i = 0; i < 200_000; i++) sink += read();
  const samples = [];
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sink += read();
    samples.push(((performance.now() - start) * 1e6) / iterations);
  }
  samples.sort((a, b) => a - b);
  console.log(
    `  ${label.padEnd(58)} ${samples[rounds >> 1].toFixed(1).padStart(6)} ns  (${samples[0].toFixed(1)} to ${samples[rounds - 1].toFixed(1)})${sink ? '' : ''}`,
  );
}

const forwarding = new Proxy(new Counter(), {
  get: (target, key, receiver) => Reflect.get(target, key, receiver),
});
const ours = original.createClassyStore(new Counter());
const oursPatched = patched.createClassyStore(new Counter());
const [solidFresh] = createStore(new Counter());
const [solidPlain] = createStore({count: 1, label: 'a'});
const [solidObserved] = createStore(new Counter());
createRoot(() =>
  createEffect(
    () => solidObserved.count,
    () => {},
  ),
);
flush();

console.log(
  `${typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Node ${process.version}`}, production build of @solidjs/signals: ${(await import('@solidjs/signals')).DEV === undefined}`,
);
time('forwarding Proxy, field', () => forwarding.count);
time('classy-store today, field', () => ours.count);
time('classy-store patched, field', () => oursPatched.count);
time('Solid, class instance field, nobody subscribed', () => solidFresh.count);
time('Solid, plain object field, nobody subscribed', () => solidPlain.count);
time(
  'Solid, class instance field, an effect subscribed',
  () => solidObserved.count,
);
time('classy-store today, cached getter', () => ours.double);
time('classy-store patched, cached getter', () => oursPatched.double);
time('Solid, prototype getter, nobody subscribed', () => solidFresh.double);
time('classy-store today, method lookup', () => (ours.increment ? 1 : 0));
time('classy-store patched, method lookup', () =>
  oursPatched.increment ? 1 : 0,
);
time('Solid, method lookup', () => (solidFresh.increment ? 1 : 0));
```

```text
$ node 06-read-cost.mjs
Node v24.21.0, production build of @solidjs/signals: true
  forwarding Proxy, field                                      21.7 ns  (21.7 to 22.1)
  classy-store today, field                                    46.5 ns  (46.3 to 47.0)
  classy-store patched, field                                  38.2 ns  (37.8 to 38.8)
  Solid, class instance field, nobody subscribed               28.3 ns  (28.3 to 28.5)
  Solid, plain object field, nobody subscribed                 28.4 ns  (28.3 to 28.6)
  Solid, class instance field, an effect subscribed            33.1 ns  (33.0 to 33.3)
  classy-store today, cached getter                            79.9 ns  (79.9 to 80.7)
  classy-store patched, cached getter                          74.6 ns  (74.4 to 74.9)
  Solid, prototype getter, nobody subscribed                   40.7 ns  (39.6 to 40.7)
  classy-store today, method lookup                            64.5 ns  (63.7 to 66.0)
  classy-store patched, method lookup                          60.1 ns  (59.8 to 62.3)
  Solid, method lookup                                         39.8 ns  (39.8 to 40.1)
```

```text
$ bun 06-read-cost.mjs
Bun 1.4.4, production build of @solidjs/signals: true
  forwarding Proxy, field                                       2.5 ns  (2.5 to 5.0)
  classy-store today, field                                    25.4 ns  (25.1 to 31.5)
  classy-store patched, field                                  11.9 ns  (9.0 to 12.0)
  Solid, class instance field, nobody subscribed               22.2 ns  (21.6 to 22.2)
  Solid, plain object field, nobody subscribed                 20.3 ns  (20.3 to 20.4)
  Solid, class instance field, an effect subscribed            16.9 ns  (16.9 to 17.2)
  classy-store today, cached getter                            58.2 ns  (56.2 to 59.7)
  classy-store patched, cached getter                          34.3 ns  (34.3 to 34.4)
  Solid, prototype getter, nobody subscribed                   23.1 ns  (23.1 to 23.1)
  classy-store today, method lookup                            49.8 ns  (48.6 to 51.1)
  classy-store patched, method lookup                          30.9 ns  (30.8 to 31.3)
  Solid, method lookup                                         15.4 ns  (15.4 to 16.4)
```

### Port 7: `snapshot`, `deep`, `reconcile`, unbound methods

Solid:

```js
import {
  createStore,
  snapshot,
  deep,
  reconcile,
  createRoot,
  createEffect,
  flush,
} from '@solidjs/signals';
import {show, title} from './helper.mjs';

title('18. snapshot(): identity, sharing and freezing');
const raw = {
  touched: {n: 1},
  untouched: {n: 1},
  rows: [
    {id: 1, n: 1},
    {id: 2, n: 1},
  ],
};
const [store, setStore] = createStore(raw);
show(
  'before any write: snapshot(store) === raw',
  () => snapshot(store) === raw,
);
setStore((s) => {
  s.touched.n = 2;
});
show('a read straight after the setter, before flush()', () => store.touched.n);
flush();
show('the same read after flush()', () => store.touched.n);
const one = snapshot(store);
const two = snapshot(store);
show('after a write: two snapshots are the same object', () => one === two);
show('the unchanged subtree is the raw object in both', () => [
  one.untouched === raw.untouched,
  two.untouched === raw.untouched,
]);
show(
  'the changed subtree is the same object in both',
  () => one.touched === two.touched,
);
show('a snapshot is frozen', () => [
  Object.isFrozen(one),
  Object.isFrozen(one.touched),
]);
show('writing to a snapshot changes the store', () => {
  one.touched.n = 77;
  one.untouched.n = 88;
  return {touched: store.touched.n, untouched: store.untouched.n};
});

title('19. deep(): one subscription for a whole subtree');
let runs = 0;
createRoot(() =>
  createEffect(
    () => deep(store),
    () => void runs++,
  ),
);
flush();
runs = 0;
show('write a nested row', () => {
  setStore((s) => {
    s.rows[1].n = 5;
  });
  flush();
  return {effectRuns: runs};
});
show('write a value it already holds', () => {
  setStore((s) => {
    s.rows[1].n = 5;
  });
  flush();
  return {effectRuns: runs};
});

title('20. reconcile(): keep row identity across a replaced list');
const firstRow = store.rows[0];
const secondRow = store.rows[1];
let rowRuns = 0;
createRoot(() =>
  createEffect(
    () => store.rows[0].n,
    () => void rowRuns++,
  ),
);
flush();
rowRuns = 0;
show('reconcile a reordered, edited copy by id', () => {
  setStore((s) => {
    reconcile(
      [
        {id: 2, n: 5},
        {id: 1, n: 100},
        {id: 3, n: 0},
      ],
      'id',
    )(s.rows);
  });
  flush();
  return {
    order: store.rows.map((row) => row.id).join(),
    sameProxyForId1: store.rows[1] === firstRow,
    sameProxyForId2: store.rows[0] === secondRow,
    editedValue: store.rows[1].n,
    rowEffectRuns: rowRuns,
  };
});
show('a plain assignment of a fresh list instead', () => {
  const before = store.rows[0];
  setStore((s) => {
    s.rows = [
      {id: 2, n: 5},
      {id: 1, n: 100},
      {id: 3, n: 0},
    ];
  });
  flush();
  return {sameProxyForId2: store.rows[0] === before};
});

title('21. Methods are not bound');
class Counter {
  count = 0;
  increment() {
    this.count++;
  }
}
const [counter, setCounter] = createStore(new Counter());
show('const {increment} = draft; increment()', () => {
  setCounter((s) => {
    const {increment} = s;
    increment();
  });
  flush();
  return counter.count;
});
show(
  'store.increment === Counter.prototype.increment',
  () => counter.increment === Counter.prototype.increment,
);
```

```text
$ node --conditions=development 07-snapshot.solid.mjs
18. snapshot(): identity, sharing and freezing
  before any write: snapshot(store) === raw -> true
  a read straight after the setter, before flush() -> 1
  the same read after flush() -> 2
  after a write: two snapshots are the same object -> false
  the unchanged subtree is the raw object in both -> [true,true]
  the changed subtree is the same object in both -> false
  a snapshot is frozen -> [false,false]
  writing to a snapshot changes the store -> {"touched":2,"untouched":88}

19. deep(): one subscription for a whole subtree
  write a nested row -> {"effectRuns":1}
  write a value it already holds -> {"effectRuns":1}

20. reconcile(): keep row identity across a replaced list
  reconcile a reordered, edited copy by id -> {"order":"2,1,3","sameProxyForId1":true,"sameProxyForId2":true,"editedValue":100,"rowEffectRuns":1}
  a plain assignment of a fresh list instead -> {"sameProxyForId2":false}

21. Methods are not bound
  const {increment} = draft; increment() -> THROWS TypeError: Cannot read properties of undefined (reading 'count')
  store.increment === Counter.prototype.increment -> true
```

### Port 8: the cases of ports 3 and 4 on our library, and async writes

```ts
import {
  createClassyStore,
  snapshot,
  subscribe,
  batch,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {show, title} from './helper.mjs';

title('3. A function held in an array, read twice; a class held in a store');
class Model {
  static label = 'model';
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}
const first = () => 1;
const second = () => 2;
const store = createClassyStore({
  callbacks: [first, second],
  Model,
  handler: first,
});
show(
  'store.callbacks[0] === store.callbacks[0]',
  () => store.callbacks[0] === store.callbacks[0],
);
show('store.callbacks.indexOf(first)', () => store.callbacks.indexOf(first));
show('remove the first callback by indexOf', () => {
  store.callbacks.splice(store.callbacks.indexOf(first), 1);
  return store.callbacks.length === 1 && store.callbacks[0]() === 2
    ? 'second is left'
    : 'wrong one removed';
});
show('store.Model === Model, store.Model.label', () => [
  store.Model === Model,
  (store.Model as typeof Model).label,
]);
show(
  'new store.Model("x") instanceof store.Model',
  () => new store.Model('x') instanceof store.Model,
);

title('4. list.includes(raw)');
const row = {id: 1};
const rows = createClassyStore({list: [row, {id: 2}]});
show('rows.list.includes(row), indexOf(row)', () => [
  rows.list.includes(row),
  rows.list.indexOf(row),
]);
show('rows.list.includes(rows.list[0])', () =>
  rows.list.includes(rows.list[0]),
);

title('6. Object.defineProperty through the proxy');
const s6 = createClassyStore<{a: number; b?: number; child: {n: number}}>({
  a: 1,
  child: {n: 1},
});
let calls = 0;
subscribe(s6, () => void calls++, {sync: true});
snapshot(s6);
show('Object.defineProperty(store, "b", {value: 2, ...})', () => {
  Object.defineProperty(s6, 'b', {
    value: 2,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return {
    storeB: s6.b,
    subscriberCalls: calls,
    snapshotB: snapshot(s6).b ?? 'undefined',
  };
});
show('redefine a property that holds an object', () => {
  s6.child.n;
  Object.defineProperty(s6, 'child', {
    value: {n: 99},
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return {childN: s6.child.n};
});

title(
  "7. 'key' in store and Object.keys(store) inside a getter, then a key is removed",
);
const dict = createClassyStore({
  a: 1,
  b: 2,
  get count() {
    return Object.keys(this).length;
  },
  get hasB() {
    return 'b' in this;
  },
} as {a: number; b?: number; readonly count: number; readonly hasB: boolean});
show('first read', () => ({count: dict.count, hasB: dict.hasB}));
show('delete store.b', () => {
  delete dict.b;
  return {
    count: dict.count,
    hasB: dict.hasB,
    snapshotCount: snapshot(dict).count,
    snapshotHasB: snapshot(dict).hasB,
  };
});

title('9. A self-referencing object');
const cyc = createClassyStore<{name: string; self?: unknown}>({name: 'root'});
show('store.self = store', () => {
  cyc.self = cyc;
  return cyc.self === cyc;
});
show('snapshot(store)', () => snapshot(cyc).name);

title('12. A delete that removes nothing');
const bag = createClassyStore<{a: number; missing?: number}>({a: 1});
let bagCalls = 0;
subscribe(bag, () => void bagCalls++, {sync: true});
show('delete store.missing', () => {
  delete bag.missing;
  return {subscriberCalls: bagCalls};
});

title('8b. An async method, and batch() around an await');
class Loader {
  a = 0;
  b = 0;
  async load() {
    this.a = 1;
    await 0;
    this.a = 2;
    this.b = 2;
  }
}
const loader = createClassyStore(new Loader());
let loaderCalls = 0;
subscribe(loader, () => void loaderCalls++, {sync: true});
await loader.load();
show(
  'sync notifications for one async method that writes three times',
  () => loaderCalls,
);
loaderCalls = 0;
await batch(async () => {
  loader.a = 3;
  await 0;
  loader.a = 4;
  loader.b = 4;
});
show(
  'sync notifications for batch(async () => ...) with three writes',
  () => loaderCalls,
);
```

```text
$ bun 08-all.classy.ts
3. A function held in an array, read twice; a class held in a store
  store.callbacks[0] === store.callbacks[0] -> false
  store.callbacks.indexOf(first) -> -1
  remove the first callback by indexOf -> wrong one removed
  store.Model === Model, store.Model.label -> [false,null]
  new store.Model("x") instanceof store.Model -> false

4. list.includes(raw)
  rows.list.includes(row), indexOf(row) -> [false,-1]
  rows.list.includes(rows.list[0]) -> true

6. Object.defineProperty through the proxy
  Object.defineProperty(store, "b", {value: 2, ...}) -> {"storeB":2,"subscriberCalls":0,"snapshotB":"undefined"}
  redefine a property that holds an object -> {"childN":1}

7. 'key' in store and Object.keys(store) inside a getter, then a key is removed
  first read -> {"count":4,"hasB":true}
  delete store.b -> {"count":4,"hasB":true,"snapshotCount":0,"snapshotHasB":false}

9. A self-referencing object
  store.self = store -> true
  snapshot(store) -> THROWS Error: @codebelt/classy-store: circular reference detected in snapshot

12. A delete that removes nothing
  delete store.missing -> {"subscriberCalls":1}

8b. An async method, and batch() around an await
  sync notifications for one async method that writes three times -> 3
  sync notifications for batch(async () => ...) with three writes -> 3
```

### Port 9: `#private` fields

Solid:

```js
import {createStore, flush} from '@solidjs/signals';
import {show, title} from './helper.mjs';

title('22. #private fields');
class Vault {
  #secret = 1;
  open = 1;
  get doubled() {
    return this.#secret * 2;
  }
  bump() {
    this.#secret++;
    this.open++;
  }
}
const [vault, setVault] = createStore(new Vault());
show('a prototype getter that reads a #private field', () => vault.doubled);
show('a prototype method that writes a #private field, on the draft', () => {
  setVault((s) => {
    s.bump();
  });
  flush();
  return vault.open;
});
show('the public field after that', () => vault.open);
```

```text
$ node --conditions=development 09-private.solid.mjs
22. #private fields
  a prototype getter that reads a #private field -> 2
  a prototype method that writes a #private field, on the draft -> THROWS TypeError: Cannot read private member #secret from an object whose class did not declare it
  the public field after that -> 1
```

Ours:

```ts
import {createClassyStore} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {show, title} from './helper.mjs';

title('22. #private fields');
class Vault {
  #secret = 1;
  open = 1;
  get doubled() {
    return this.#secret * 2;
  }
  bump() {
    this.#secret++;
    this.open++;
  }
}
const vault = createClassyStore(new Vault());
show('a prototype getter that reads a #private field', () => vault.doubled);
show('a prototype method that writes a #private field', () => {
  vault.bump();
  return vault.open;
});
```

```text
$ bun 09-private.classy.ts
22. #private fields
  a prototype getter that reads a #private field -> THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
  a prototype method that writes a #private field -> THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
```

### Port 10: row identity after an undo

```ts
import {
  createClassyStore,
  snapshot,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {withHistory} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/utils/index.ts';
import {show, title} from './helper.mjs';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

title('20. Row identity after an undo (our counterpart of reconcile)');
const store = createClassyStore({
  rows: [
    {id: 1, n: 1},
    {id: 2, n: 1},
    {id: 3, n: 1},
  ],
  other: {n: 1},
});
const history = withHistory(store);
await flush();
const before = snapshot(store);
const liveRowBefore = store.rows[0];
store.rows[2].n = 2;
await flush();
history.undo();
await flush();
const after = snapshot(store);
show(
  'the untouched top-level branch keeps its snapshot',
  () => after.other === before.other,
);
show('the untouched rows keep their snapshots', () => [
  after.rows[0] === before.rows[0],
  after.rows[1] === before.rows[1],
]);
show(
  'the untouched row keeps its live proxy',
  () => store.rows[0] === liveRowBefore,
);
show('the restored value', () => after.rows[2].n);
```

```text
$ bun 10-history.classy.ts
20. Row identity after an undo (our counterpart of reconcile)
  the untouched top-level branch keeps its snapshot -> true
  the untouched rows keep their snapshots -> [false,false]
  the untouched row keeps its live proxy -> false
  the restored value -> 1
```

## What was verified by running code, and what was only read

Verified by running, in the scratch folder:

- Every line of output quoted in the findings and printed under "Ported
  tests", on `@solidjs/signals` 2.0.0 from npm and on our source at
  `825ba2d`.
- Which build each Node invocation resolves, and that the production and
  observe trees contain no diagnostic text.
- The timings in finding 1, on Node and on Bun: one run of seven rounds each,
  on a machine that was not otherwise idle. Treat them as indicative. The
  spread within a run is in the port's output.
- That `@solidjs/signals` exports no `batch`; that a typed array, a promise
  and a class with `Symbol.toStringTag` are not wrappable; that `markRaw`
  keeps a value unwrapped; that a store proxy assigned into another store is
  stored unwrapped.
- That a class's `prototype` property is not writable and a plain
  function's is (finding 3).

Only read, not run:

- How each cache is filled and refreshed (finding 1), beyond what the ports
  show from outside.
- The keyed part of `reconcile` beyond the one reorder in port 7.
- `STORE_WRITE_THROUGH_LOADING`, `STRICT_READ_UNTRACKED`,
  `UNTRACKED_READ_AFTER_AWAIT` and the two performance codes. The last two
  are from the catalogue entry alone.
- The rows marked "Read" in the table.

Not done:

- The spike in finding 1 was not run against our unit suite, and nothing
  else proposed here was spiked.
- No bundler or test runner was checked for which export condition it sets
  (finding 9). Node only.
- `persist.ts` and `devtools.ts` were not read for finding 11.
- Solid's `optimistic.ts`, `projection.ts`, `storePath.ts` and
  `store/utils.ts` were not read. They cover derived and optimistic stores
  and props helpers, which have no counterpart here.
- Nothing was run in a browser.
