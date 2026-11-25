# Stage 2: Valtio

## Library, version and commit

- Library: Valtio, `https://github.com/pmndrs/valtio`.
- Version: 2.3.2, the latest stable tag on 2026-11-18.
- Commit: `15c64d4d7a7a9bd55d750fa6a317b440978a2b25` (2026-05-01), cloned at
  tag `v2.3.2` into a scratch folder and read there.
- `proxy-compare` 3.0.1, read from this repository's
  `node_modules/.bun/proxy-compare@3.0.1`. Valtio 2.3.2 depends on `^3.0.1`,
  and the scratch install resolved the same 3.0.1.
- The ported tests ran on Bun 1.4.4 against `valtio@2.3.2` installed from npm
  in the scratch folder, and against our source imported by absolute path.

## Files read

Valtio, all whole files, paths relative to `src/`:

- `vanilla.ts` (459 lines)
- `react.ts` (174 lines)
- `vanilla/utils/subscribeKey.ts`, `devtools.ts`, `proxyMap.ts`,
  `proxySet.ts`, `watch.ts`, `deepClone.ts`, `deepProxy.ts`
- `react/utils/useProxy.ts`

`proxy-compare`: `src/index.ts` (whole file).

Ours: `core/core.ts`, `core/ownership.ts`, `core/core.types.ts`,
`snapshot/snapshot.ts`, `collections/collections.ts`,
`utils/subscribe-key/subscribe-key.ts`, `utils/devtools/devtools.ts`,
`utils/internal/internal.ts`, `types.ts`,
`frameworks/react/hooks/useClassyStore/useClassyStore.ts` and
`frameworks/react/utils/trackedProxyCache/trackedProxyCache.ts`.

Not read: Valtio's tests, documentation and website; our `persist`, `history`,
the four non-React adapters, and the React tracking caches other than the one
named above.

## Summary

Valtio is our design with three parts left out: it has no `get` trap, no
getter memoization and no transactions. Its `vanilla.ts` is 459 lines with
types and comments; our `core.ts`, `ownership.ts` and `snapshot.ts` are 1,092.

**Where we are more complicated for the same result:**

- Ownership. Valtio has no weak references, no suspend and resume and no
  pointer to a detached parent, and it gives the same answers in every
  detached-subtree case I ported. It also returns from the read that hangs us
  (stage 1 finding 66). See V1.
- Functions. Valtio returns a stored function as it is. We wrap it on read,
  which is the single cause of stage 1 findings 5, 6 and 42. See V2.
- Snapshot getters. We define an accessor per getter on every snapshot; Valtio
  leaves them on the prototype. See V4.
- `subscribeKey`. We snapshot the whole store on every notification to compare
  one key. See V8.

**Where our extra code buys something Valtio does not have** (each measured or
reproduced below): transactions (one notification for a `sort`, where Valtio's
sync mode gives one per row), memoized getters, frozen snapshots, one identity
for raw object, proxy and snapshot in collections, isolation of a throwing
subscriber, deep input without recursion, and a snapshot that survives a
getter that throws.

**Where both fail in the same way:** stage 1 findings 1, 7, 11, 18, 19, 22,
25, 26 and 29, arrow-function methods, and `#private` fields.

**New, not in stage 1:** a subscription on a container that has left the
store stops being called once the garbage collector runs, if the caller kept
only one of its rows (V1). In a snapshot, `has()` on a collection of 10,000
members costs about 245 microseconds, because reading a frozen array is the
slow path in both engines (V10).

## Findings

### V1. Ownership without weak references, suspend or resume

- **What they do.** Each proxy keeps `propProxyStates`, a map from property
  to the child's state (`vanilla.ts`, `proxy()`, lines 228-231). That is a
  strong link from parent to child and nothing the other way. A child learns
  of a parent only through a listener the parent adds to it, and the parent
  adds one only while it has a listener itself (`addPropListener`, 232-246;
  `addListener`, 254-264). When its last listener goes, the parent takes its
  listeners off every child (265-275). Deleting or replacing a property drops
  that listener at once (`removePropListener`, 247-253). So an upward link
  exists only on a path that ends in a subscriber. Versions come from one
  global counter (`versionHolder`, 171 and 198). A proxy nobody listens to
  finds out about its children by asking: `ensureVersion` (206-217) walks them
  when the global counter has moved since it last looked.
- **What we do.** Every child holds a weak reference to every owner, always
  (`ownership.ts:15-17`, `46-54`), and a `FinalizationRegistry` prunes dead
  ones (`59-76`). Each write walks `ancestors()` and bumps every owner
  (`core.ts:221-224`). A detached, unobserved container is suspended: its
  links are cut and its children's versions saved (`ownership.ts:89-114`),
  then compared on resume (`116-144`). A suspended child points at its
  detached parent, and every trap walks that chain first (`22-23`, `147-156`;
  `core.ts:407`, `462`, `516`).
- **Difference in behaviour.** All verified by running; code under "Ported
  tests", ports 4, 4b and 4d.
  - The reproduction of stage 1 finding 66 prints `inner.x: 1` on Valtio. On
    ours the process was killed by the 8-second timeout.
  - New. `subscribe(store.list, cb)`, then `store.list = []`, keeping one row
    and dropping the unsubscribe function. A write to the row calls `cb` on
    both libraries. After a garbage collection Valtio still calls it (5 rounds
    of 5); ours does not, because the list was collected (5 rounds of 5). Our
    child holds its owner weakly, and nothing else holds a node that has a
    listener. When the subscriber stops is decided by the collector.
  - The same on both: a child written while its container is out of the
    store shows in the snapshot after the container is put back; a subscriber
    on a detached container still hears its children; the root no longer
    does; a retained row does not keep a replaced list alive (collected in
    most rounds on both; the misses are sporadic and on both).
  - What Valtio pays for it. A snapshot of an unchanged 1,000-row store after
    a write to another store costs 95 microseconds against our 231
    nanoseconds, because the global counter moved and the whole tree is
    asked. Writing one row and taking a snapshot costs 259 to 284
    microseconds against our 124 to 129. The first subscribe and last
    unsubscribe on that store cost 375 microseconds against our 84
    nanoseconds, because listeners are added to and removed from every node.
- **Proposal: adapt.**
  1. Remove the detached-parent pointer and the walk in `resumeScope()`.
     Stage 1 finding 72 found that it adds nothing to correct behaviour and
     causes findings 66 to 68. Valtio is a working store of the same shape
     with no link from a detached child to its former parent.
  2. Do not take the pull. Our eager bump along `ancestors()` is what makes a
     snapshot of an unchanged store a cache hit. It is the better half of our
     design.
  3. Choose one mechanism against "a retained row keeps removed lists alive",
     not two. We have weak links and suspension. Valtio has neither, and gets
     the same result from a third rule (links only while observed). With weak
     links alone, suspension and its three corrections (finding 72) can go;
     what is left to measure is the cost of a write to a row that has many
     dead owners not yet collected. This is reasoning from reading, not
     measured.
  4. Decide what keeps a subscribed node alive. Either say in the docs that a
     subscription lasts while the caller holds the store, the node or the
     unsubscribe function, or hold a node strongly for as long as it has a
     listener (a module-level set, added on the first listener and removed on
     the last). The second makes the collector invisible, and a forgotten
     unsubscribe then keeps that node for good, as with any event emitter.
- **Kind:** simplification, bug.
- **Cost:** `ownership.ts` and the three `resumeScope()` calls in `core.ts`.
  Not breaking. Medium risk: the memory tests and the owner-order tests
  (finding 69) pin today's behaviour.

### V2. A stored function is returned as it is

- **What they do.** The proxy handler has two traps, `deleteProperty` and
  `set` (`vanilla.ts`, `createHandlerDefault`, 122-158). A read runs no
  library code. That works because a child is stored in the object as its
  proxy (151-154), and `proxy()` assigns every own writable data property
  through the proxy at creation (289-297). A method runs with `this` as the
  proxy because it is called on the proxy; nothing is bound.
- **What we do.** The `get` trap (`core.ts:461-500`) looks the descriptor up
  the prototype chain (`464`), wraps every function in a transaction closure
  (`483-492`), and for an array makes a new wrapper on every read (`486`).
- **Difference in behaviour.** Ports 1 and 6, and the timings.
  - A function in an array: `callbacks[0] === callbacks[0]` is `true` on
    Valtio and `false` on ours; `splice(indexOf(first), 1)` removes `first`
    on Valtio and the last callback on ours (finding 5).
  - A class held as data: `store.Model === Model`, its static is readable and
    `instanceof` holds on Valtio; none of the three on ours (finding 6).
  - A destructured method throws on Valtio (`this` is `undefined`) and works
    on ours. That is what the wrapper is for.
  - A field read costs 1.6 ns on Valtio and 30.5 ns on ours; three objects
    deep, 12 ns and 141 ns.
  - Valtio writes proxies into the object it was given: after
    `proxy(raw)`, `raw.child` is the proxy. Ours leaves the raw graph alone at
    creation (finding 10 lists where it does not).
- **Proposal: adapt.** Keep the trap: binding, transactions and getter
  memoization live in it, and they are the class-based design. Wrap only what
  is a method:
  - An own element of an array is data. Only a function found on the array's
    prototype chain is an array method.
  - A class is data. It can be told apart without calling it: the `prototype`
    property of a class is not writable, that of a function declaration is,
    and arrows and methods have none (checked on Bun; the table is under
    "Ported tests", port 7).
  - Cache the array-method wrappers as the others are.

  This removes findings 5, 6 and 42 and keeps destructured methods working.
  Do not copy "the raw object holds proxies": it changes the caller's object
  graph. The per-prototype descriptor cache the Solid report proposes is the
  answer to the read cost; Valtio's answer is to have no trap.
- **Kind:** bug, performance.
- **Cost:** the `get` trap in `core.ts`. A function read from an array
  becomes equal to the function stored, which is a behaviour change in the
  expected direction. Low risk.

### V3. A cycle can be snapshotted

- **What they do.** `createSnapshotDefault` puts the new snapshot object in
  the cache before it fills it in (`vanilla.ts:90`), so a reference back to
  an object being built resolves to that object. `useSnapshot` passes a fresh
  `WeakMap` to proxy-compare's `isChanged` as its cycle guard
  (`react.ts:146-151`).
- **What we do.** A repeat visit throws (`snapshot.ts:246-250`), and the
  cache is written after the freeze (`285`). The React hook calls `isChanged`
  with no cycle guard (`useClassyStore.ts:100`).
- **Difference in behaviour.** Port 1, case 8: after `store.self = store`,
  Valtio gives `snapshot(store).self === snapshot(store)`; ours throws at the
  next snapshot, wherever that is taken (finding 8). Valtio's way has a cost
  of its own, port 6: when an own getter throws while the snapshot is built,
  the half-built object stays in the cache, and the next `snapshot()` returns
  it with only the keys filled in before the throw. Ours is not affected.
- **Proposal: adapt, if the owner wants parent pointers in class models to
  work.** Keep our per-call `inProgress`, make it a map from target to the
  unfinished snapshot, return that for a repeat visit, and freeze after
  filling. An object can be referenced before it is frozen. Do not use the
  shared cache for this, for the reason above. Then pass a cycle guard to
  `isChanged`, and check `cloneSnapshot`, `shallowEqual`, `persist` and
  `devtools` for recursion without end. If cycles stay unsupported, throw at
  the write that makes one, not at a later snapshot.
- **Kind:** bug, API design.
- **Cost:** about ten lines in `snapshot.ts`, one in `useClassyStore.ts`, and
  a check of four utilities. Not breaking. Medium risk. Reasoning from
  reading; not prototyped.

### V4. Snapshot getters stay on the prototype

- **What they do.** A snapshot is created with the object's own prototype
  (`vanilla.ts:86-88`) and nothing is defined for a class getter. It is
  inherited, not enumerable, and runs on every read with the snapshot as
  `this`. An own accessor (an object-literal getter) is evaluated once while
  the snapshot is built and stored as a data property (`96-103`).
- **What we do.** For every snapshot of every class instance,
  `installMemoizedGetters` walks the prototype chain and defines an own
  accessor per getter, with a new closure each (`snapshot.ts:196-221`). An
  inherited getter is defined enumerable (`215`).
- **Difference in behaviour.** Port 2.
  - `Object.keys(store)` is `["items"]` on both. `Object.keys(snapshot)` is
    `["items"]` on Valtio and `["items","total"]` on ours. `JSON.stringify`
    and a spread of our snapshot run every getter and carry its value.
  - Three reads of a getter run it three times on Valtio, live and on one
    snapshot. Ours runs it once, and not at all for a new snapshot after an
    unrelated write.
  - Writing a field and taking a snapshot costs 672 ns for a class with no
    getter and 1,938 ns for one with eight: about 160 ns per getter per
    snapshot. Valtio: 339 and 338.
  - Valtio's own-accessor rule is wrong for a getter that derives a list:
    `snapshot.open[0]` is the live proxy, in an unfrozen array. Ours keeps the
    accessor and answers with snapshot rows.
- **Proposal: adapt.** Keep the memoization; it is the point of class
  getters. Stop defining accessors per snapshot. Build, once per class, an
  object that inherits from the class prototype and carries the memoizing
  accessors, not enumerable, as the class's own are. Cache it by class
  prototype and create snapshots from it. The keys of store and snapshot then
  agree, the per-snapshot cost goes, and `instanceof` still holds. Own
  accessors stay as they are now. This is reasoning from reading; it is not
  prototyped. If the owner would rather keep getter values in a spread and in
  JSON, keep today's shape and document that a snapshot has more keys than
  its store.
- **Kind:** API design, performance.
- **Cost:** `installMemoizedGetters` and what calls it, and the users of
  `originalSnapshotAccessor`. Breaking for code that enumerates a snapshot
  (`Object.keys`, spread, `JSON.stringify`, `shallowEqual`, the DevTools
  payload), and `Object.getPrototypeOf(snapshot)` becomes the derived object.
  Medium risk. It is an API shape, so it is cheaper to decide before 1.0.

### V5. What a getter can ask of `this`

- **What they do.** Valtio's getters run on the snapshot itself, so
  `Object.keys(this)`, `key in this` and `this instanceof C` are answered by
  the real object. proxy-compare, for render tracking, records four kinds of
  read, not one: `get`, `has`, `getOwnPropertyDescriptor` and `ownKeys`
  (`proxy-compare/src/index.ts:128`, `140`, `148`, `152`), and `isChanged`
  compares each kind (`288` on).
- **What we do.** A snapshot getter runs on a Proxy over an empty object with
  a `get` trap only (`snapshot.ts:80-93`). The store proxy has no `has` or
  `ownKeys` trap (`core.ts:405-525`).
- **Difference in behaviour.** Port 2, case 30/31: for a class with fields
  `a` and `b`, a getter returning `Object.keys(this).length`, one returning
  `'b' in this` and one returning `this instanceof Bag` give `2, true, true`
  on a Valtio snapshot and `0, false, false` on ours (findings 31 and 41).
  After `delete store.b` the live getters give `1, false` on Valtio and still
  `2, true` on ours (finding 30).
- **Proposal: adapt, in our own tracker. Do not call proxy-compare for
  this.** I tried both on real snapshots of ours ("Ported tests", prototype
  A/B/C):
  - A, proxy-compare's `createProxy(snapshot)` as `this`: the three questions
    are answered correctly, but every object read through it is a tracking
    proxy (`this.rows[0] !== snapshot.rows[0]`), so a getter that returns
    rows would hand out proxies.
  - B, a Proxy over the frozen snapshot itself with `get`, `has` and
    `ownKeys` traps: the questions are answered correctly, values are the
    real snapshot values, and the three reads are recorded. The `get` trap
    already returns the property's own value, which is what the Proxy rule
    for a frozen target asks for.

  So: in `computeWithTracking`, proxy the snapshot, and record `has` and
  `ownKeys` as dependencies. On the store, add `has` and `ownKeys` traps that
  record the same for an active tracker; a per-node counter bumped when a key
  is added or deleted is enough to validate them.
- **Kind:** bug.
- **Cost:** about fifteen lines in `snapshot.ts`; two traps and one
  dependency kind in `core.ts`. Not breaking. Low risk. Prototype B had data
  properties only; a snapshot with accessors was reasoned, not run.

### V6. Each subscription knows whether it is still active

- **What they do.** `subscribe()` keeps a flag per subscription,
  `isListenerActive`, set false by the unsubscribe function and checked when
  the batched callback runs (`vanilla.ts:325`, `337`, `346`). Each
  subscription has its own pending promise (`334-341`). Sync listeners are
  called straight from the live `Set` (`202`), with no `try`.
- **What we do.** `deliver()` copies the listeners of every pending node, then
  calls each inside `try`/`catch` (`core.ts:314-328`). What is pending is the
  node, not the listener (`241`, `308-312`).
- **Difference in behaviour.** Port 3.

  | Case                                                       | Valtio                                           | Ours                                 |
  | ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
  | A unsubscribes B during delivery, sync and batched (20)    | B is not called                                  | B is called once                     |
  | Batched subscriber added after the write (21)              | not called                                       | called                               |
  | Sync subscriber added by another during delivery           | called in that delivery                          | not called                           |
  | First sync subscriber throws (23)                          | the writer gets the error, the second is skipped | logged, the second is called         |
  | Sync subscriber writes on every call (18)                  | `RangeError` reaches the writer                  | `RangeError` goes to `console.error` |
  | Subscriber writes until a limit, a second one watches (22) | sees `3, 3, 3`                                   | sees `3, 3, 3`                       |
  | Batched subscriber writes, a timer is due (19)             | three callbacks, then the timer                  | the same                             |

- **Proposal.** Adopt the flag: in `subscribe()`, a boolean the unsubscribe
  function clears and the listener checks. One line, and it fixes finding 20
  in both modes and across nodes. Adapt for finding 21: queue the listeners
  that exist at the write, not the node, which is what a promise per
  subscription amounts to. Reject Valtio's error handling and its iteration of
  the live set; ours is better on both. Neither library stops a subscriber
  that writes for ever, so Valtio has nothing to offer for 18 and 19.
- **Kind:** bug.
- **Cost:** `subscribe`, `notifyMutation` and `flushNotifications` in
  `core.ts`. Changes what the tests of findings 20 and 21 pin. Low risk.

### V7. The `sync` option, and why we do not need one

- **What they do.** `useSnapshot(proxy, {sync: true})` passes a flag through
  to `subscribe` (`react.ts:42-44`, `123`, `134`). The default is batched.
  There is no transaction: every `set` trap notifies (`vanilla.ts:155`,
  `196-204`).
- **What we do.** Every adapter subscribes sync (`useClassyStore.ts:144-147`),
  and a method or an array operation is one transaction (`core.ts:245-306`,
  `483-492`).
- **Difference in behaviour.** Port 3 and the timings. Sync notifications for
  one operation on 100 rows:

  | Operation          | Valtio | Ours |
  | ------------------ | -----: | ---: |
  | `push(row)`        |      1 |    1 |
  | `unshift(row)`     |    102 |    1 |
  | `sort()`           |    100 |    1 |
  | `reverse()`        |    102 |    1 |
  | `splice(0, 1)`     |    103 |    1 |
  | A two-field method |      2 |    1 |
  | A two-field setter |      3 |    2 |

  Sorting 1,000 rows with one sync subscriber that takes a snapshot costs 248
  milliseconds on Valtio and 0.9 on ours. This is why Valtio's default is
  batched and `sync` is an opt-in for controlled inputs.
- **Proposal: reject the option.** One mode is the better API, and the
  transaction code (about 60 lines) is what pays for it. The one thing to fix
  on our side is finding 43: run an accessor's setter inside a transaction
  (`core.ts:414-418`), so a setter notifies once, as a method does.
- **Kind:** API design.
- **Cost:** three lines in `core.ts`. Changes what the test of finding 43
  pins. Low risk.

### V8. `subscribeKey` without a snapshot of the whole store

- **What they do.** It reads the live value once, and again on every
  notification, and compares with `Object.is`
  (`vanilla/utils/subscribeKey.ts:14-31`). The callback gets the new live
  value.
- **What we do.** It takes a snapshot of the whole store on every
  notification and compares `snapshot[key]`; the callback gets the new and
  the previous snapshot value (`subscribe-key.ts:26-41`).
- **Difference in behaviour.** Port 7.
  - A key that holds an object: a nested write does not call Valtio's
    callback (the live proxy is the same object) and does call ours, with a
    snapshot. Ours is the more useful contract.
  - Cost. A store with `count` and 1,000 rows, `subscribeKey(store, 'count',
    …, {sync: true})`, then writes to rows: 122 microseconds per write on
    ours, against 1.0 with a plain sync subscriber. Valtio: 0.4. Every row
    write rebuilds the root and list snapshots to learn that `count` did not
    change. Where a mounted component takes the same snapshot anyway, the
    work is shared; where `subscribeKey` is used alone, it is all extra.
- **Proposal: adapt.** Keep our callback contract and compare without the
  root snapshot: read the live value; if it is a store node, compare the node
  and its version, and call `snapshot()` on that node only when one of them
  changed; otherwise compare with `Object.is`. A key that is a getter keeps
  today's path, because a live getter and a snapshot getter return different
  objects.
- **Kind:** performance.
- **Cost:** about fifteen lines in `subscribe-key.ts`. Not breaking. Low
  risk.

### V9. `devtools`

- **What they do** (`vanilla/utils/devtools.ts`).
  1. `enabled` defaults to "not a production build" (`45-47`), and it warns
     when enabled with no extension (`52-54`).
  2. Every other option is passed on to `connect` (`41`, `60`).
  3. An action is named from the operations in it, `set:count, delete:todos.1`
     (`58`, `62-65`).
  4. It handles a dispatched action (`93-102`), `JUMP_TO_ACTION` and
     `JUMP_TO_STATE` (`103-113`), `COMMIT` (`114-118`) and `IMPORT_STATE`
     (`119-140`).
  5. It sends a shallow copy of the snapshot's own data (`74`).
  6. The time-travel flag is cleared by the next notification (`71-72`,
     `108`). If a jump changes nothing, the flag stays set and the next real
     change is not sent. Read, not run.
- **What we do** (`utils/devtools/devtools.ts`). `enabled` defaults to `true`
  everywhere (`57`). Only `name` reaches `connect` (`66`). Every action is
  `STORE_UPDATE` (`78`). Only the two jumps are handled, skipping getters and
  methods (`83-100`). The flag is cleared in a microtask (`104-110`). The
  payload is the snapshot, so every getter is run and sent (V4). It returns a
  handle with `dispose()`.
- **Proposal.**
  - Adapt 1: we have no production build to key on, so either require
    `enabled` or default it from `process.env.NODE_ENV`. It belongs with the
    stage 3 question of a development build.
  - Adopt 2: pass unknown options through to `connect`.
  - Adapt 3: we can do better than Valtio. The outermost transaction knows
    which method was called, so the action can be `Cart.addItem`. That needs
    a small internal hook in `transactional()`.
  - Adopt `COMMIT` from 4; `IMPORT_STATE` is optional.
  - Reject 6: ours is sounder. Keep our handle.
- **Kind:** API design, diagnostics.
- **Cost:** `devtools.ts`, and a hook in `core.ts` for the action name. The
  `enabled` default is the only breaking part. Low risk.

### V10. Reactive collections

- **What they do.** `proxyMap` and `proxySet` keep a native `Map` from key to
  index beside a `data` array (`proxyMap.ts:58`, `83-86`), and an `epoch`
  counter that reads touch so that they are tracked (`98`, `105`). The index
  is cloned once per snapshot (`60-69`, `87-93`). A deleted slot is left as a
  hole (`130`). Mutators throw on a snapshot (`109-111`). The return type
  names the snapshot's type, without mutators (`200-202`), through a hook in
  `Snapshot` (`vanilla.ts:47-48`). Both are built on
  `unstable_getInternalStates` (`proxyMap.ts:3`).
- **What we do.** A dense array and a linear scan with `identityOf`
  (`collections.ts:16-33`). The constructors drop duplicates with a native
  `Map` or `Set` on the values as given (`57-71`, `212-223`).
- **Difference in behaviour.** Port 5.

  | Case                                                            | Valtio                                   | Ours                                                   |
  | --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
  | `set.has` by raw, proxy, snapshot row                           | true, true, false                        | true, true, true                                       |
  | `map.get` by raw, proxy, snapshot row                           | found, missing, missing                  | found, found, found                                    |
  | `map.set(raw)` then `map.set(proxy)`: size                      | 2                                        | 1                                                      |
  | `+0` then `-0`: size when added, when constructed (33)          | 1, 1                                     | 2, 1                                                   |
  | Constructed from `[raw, proxy]`: size (34)                      | 1                                        | 2                                                      |
  | Mutator on a snapshot (16)                                      | `Cannot perform mutations on a snapshot` | `TypeError: Attempted to assign to readonly property.` |
  | Backing array after 10,000 set and delete pairs, one entry left | length 10,000                            | length 1                                               |
  | 1,000 `has()` on 10,000 numbers, live                           | 0.2 ms                                   | 22 ms                                                  |
  | The same on a snapshot                                          | 0.07 ms                                  | 245 ms                                                 |

  Our snapshot lookup is eleven times slower than our live one because it
  scans a frozen array. Reading a frozen array of 10,000 was 28 times slower
  than an unfrozen one on Bun and 2.7 times on Node 24 (micro-benchmark under
  "Ported tests"). Valtio's snapshot arrays are not frozen, but their
  elements are non-writable, which measured as slow or slower; its lookups
  are fast because of the index, not the array.
- **Proposal.**
  - Reject Valtio's structure for live state: holes that never close, an
    extra counter, weaker identity, and a dependence on internals.
  - Adapt its per-snapshot index. For a frozen backing array, build a `Map`
    from identity to index on the first lookup and keep it in a `WeakMap`
    keyed by the array. It cannot go stale, because the array cannot change.
    In a prototype over real snapshots of ours, 1,000 lookups in 10,000
    members took about 0.8 ms with the index build included, against 101 ms
    (numbers) and 251 ms (objects) today.
  - Adopt one membership rule everywhere: the constructors should compare as
    `add` and `set` do, by `identityOf`, and all of them should treat `+0`
    and `-0` as one, as a native `Set` does. That closes findings 33 and 34.
  - Adopt the type hook: let a class name its own snapshot type, and give
    `ReactiveMap` and `ReactiveSet` one without `set`, `add`, `delete` and
    `clear`. That closes finding 16 at compile time; a check in each mutator
    can give Valtio's clearer message at run time.
- **Kind:** performance, bug, API design.
- **Cost:** `collections.ts` and `types.ts`. The type change breaks code that
  calls a mutator on a snapshot, which already throws. Low risk.

### V11. `Snapshot` keeps a tuple a tuple

- **What they do.** `Snapshot<T>` has no branch for arrays
  (`vanilla.ts:47-53`). The mapped type handles arrays and tuples.
- **What we do.** `T extends Array<infer U> ? ReadonlyArray<Snapshot<U>>`
  comes first (`types.ts:38-44`).
- **Difference in behaviour.** Type-checked in the scratch folder with
  TypeScript 7.0.2, with a deliberately wrong assertion as a control:
  Valtio's `Snapshot<[string, number]>` is `readonly [string, number]`, ours
  is `readonly (string | number)[]` (finding 14). Our type with the array
  branch deleted gives the tuple, and still gives
  `readonly {readonly id: number}[]` for an array of objects.
- **Proposal: adopt.** Delete the array branch.
- **Kind:** bug (types).
- **Cost:** one line in `types.ts` and the type tests that pin finding 14. I
  did not run the repository's 54 type tests against the change.

### V12. Opt-out with `ref()`, and snapshots that are not frozen

- **What they do.** Every object is proxied unless it is iterable (arrays
  excepted) or one of nine listed built-in types (`vanilla.ts`,
  `canProxyDefault`, 64-76). A class instance is proxied. `ref(obj)` opts one
  object out (`369-372`). A snapshot is not frozen: its properties are
  non-writable but configurable, and it stays extensible (`101-107`, `118`).
  The comment gives the reason: a frozen object forces proxy-compare to copy
  it before wrapping it (`proxy-compare/src/index.ts:43`).
- **What we do.** Opt-in: arrays, plain objects and classes marked
  `PROXYABLE` (`internal.ts:70-82`). A frozen object is a value
  (`core.ts:336-342`). Snapshots are frozen (`snapshot.ts:282`).
- **Difference in behaviour.** Port 6.
  - A nested class instance with no marker: Valtio proxies it and notifies.
    Ours holds it as it is, so a write to it notifies no one and an earlier
    snapshot shows the later value (`before.point.x` is 5).
  - `#private`: a method that reads one throws a `TypeError` on both, on the
    store and on the snapshot.
  - On a Valtio snapshot, `snapshot.extra = 1`, `snapshot.list.push(3)` and
    `delete snapshot.child` all succeed, and the next `snapshot()` returns
    that changed object. Ours throws on each.
  - To hold a plain object untracked, Valtio has `ref()` and its owner can
    still change it. Our only way is to freeze it, which stops the owner too.
- **Proposal.** Reject opt-out as the default: opt-in is the safer rule for
  host objects and for `#private`. Reject unfrozen snapshots: immutability is
  a ground rule, and Valtio's snapshot can be changed in three ways. A
  `ref()`-like marker for a plain object can be added after 1.0 without
  breaking anything, so it need not be decided now. Say in the docs that an
  unmarked class instance is shared between the store and every snapshot.
- **Kind:** API design, docs.
- **Cost:** none now.

### V13. Things we do that Valtio shows are needed

No change proposed. Each was reproduced (ports 6 and 3).

- **Our registry of tracking proxies** (`trackedProxyCache.ts`,
  `core.ts:19-30`, `409-412`). Valtio unwraps a tracked value with
  proxy-compare's `getUntracked` (`vanilla.ts:149`). That function returns
  `null` for a tracking proxy over a class-instance snapshot, on both
  libraries' proxy-compare, because it tests the proxy's prototype
  (`proxy-compare/src/index.ts:28`, `367`). Our registry does not have that
  hole.
- **The work list at creation** (`core.ts:530-543`). An object nested 20,000
  deep overflows the stack in `proxy()`; ours accepts it.
- **`createClassyStore(store) === store`** (`core.ts:396-397`). Valtio wraps
  the proxy again.
- **A getter that throws does not poison the snapshot.** See V3.
- **A subscriber that throws does not stop the others.** See V6.

## Stage 1 findings that have a counterpart in Valtio

"Run" means a port below shows it. "Read" means it follows from the source
and was not run.

| Finding | What Valtio does                                                                                                          | Basis     |
| ------: | ------------------------------------------------------------------------------------------------------------------------- | --------- |
|       1 | The same. No `defineProperty` trap: the value is set, nobody is told, the snapshot is stale until the next write.         | Run       |
|       5 | No wrapper. A function in an array is itself on every read; `indexOf` finds it.                                           | Run       |
|       6 | No wrapper. A class read from the store is the class: statics and `instanceof` work.                                      | Run       |
|       7 | The same miss. `includes(raw)` is `false`, also right after `push(row)`.                                                  | Run       |
|       8 | Works. `snapshot(store).self === snapshot(store)`.                                                                        | Run       |
|       9 | Connected. A raw object that is already a proxy's target is given that proxy, marked class or not.                        | Run       |
|      10 | By design, and from creation: the raw object holds the child proxies.                                                     | Run       |
|      11 | The same. A write through the raw object is invisible to subscribers and snapshots.                                       | Run       |
|      12 | The same. Iterables other than arrays are not proxied.                                                                    | Read      |
|      14 | A tuple stays a tuple.                                                                                                    | Run       |
|      16 | The snapshot's type has no mutators, and calling one throws a named error.                                                | Run       |
|      18 | The same recursion. The `RangeError` reaches the writer.                                                                  | Run       |
|      19 | The same. Back-to-back microtasks run before a timer that is due.                                                         | Run       |
|      20 | Not called, in both modes.                                                                                                | Run       |
|      21 | A late batched subscriber never hears an earlier write. A sync one added during delivery is called in that delivery.      | Run       |
|      22 | The same. A second subscriber sees the final state three times.                                                           | Run       |
|      23 | Sync: the error reaches the writer and later subscribers are skipped. Batched: the subscription's own promise rejects.    | Run, read |
|      24 | Depth first through each listener set in subscription order. Not inside out either.                                       | Read      |
|      25 | The same. `store.slot.n` is 2 and `snapshot(store).slot.n` is 1.                                                          | Run       |
|      26 | The same, and the hook's comment documents it (`react.ts:79-98`).                                                         | Read      |
|      27 | A child holds a parent that has a listener, strongly. A removed list with no listener is collectable.                     | Run       |
|      29 | The same. A delete of a missing key notifies and replaces the snapshot.                                                   | Run       |
|      30 | No live memoization, so the getter is right after the delete.                                                             | Run       |
|  31, 41 | `this` in a snapshot getter is the snapshot: own keys, `in` and `instanceof` are right.                                   | Run       |
|      32 | Every getter runs on every read.                                                                                          | Run       |
|  33, 34 | One member in each case.                                                                                                  | Run       |
|  36, 37 | Nothing is memoized, so nothing is stale and nothing is lost.                                                             | Run       |
|      40 | Nothing is frozen at all.                                                                                                 | Run       |
|      42 | No wrapper, as for 5 and 6.                                                                                               | Read      |
|      43 | Worse: a two-field setter notifies three times, a two-field method twice.                                                 | Run       |
|      45 | Different and also wrong: the new object is held raw, a write to it tells nobody, and the snapshot holds the live object. | Run       |
|      46 | Reading works. A strict-mode write throws a Proxy `TypeError`, after one notification.                                    | Run       |
|      50 | The descriptor's value is the proxy, because the raw object holds proxies.                                                | Run       |
|  61, 66 | No suspension and no `defineProperty` trap. The read returns 1.                                                           | Run       |
|      72 | See V1.                                                                                                                   | Run       |

## The eight API questions, from Valtio's point of view

1. **Should synchronous notification be the default for `subscribe()`?**
   Valtio's default is batched, for `subscribe` (third positional argument,
   `vanilla.ts:316`, `330-341`) and for `useSnapshot` (`sync` option). It has
   to be: with no transactions, sync mode gives one notification per element
   written (V7). So Valtio shows that sync without grouping cannot be a
   default. It says nothing against a sync default where writes are grouped.
2. **Writes outside a store method: allowed, warned about, or grouped?
   Does `batch()` belong?** Allowed, and the normal idiom: the hook's own
   example is `++state.count` in a click handler (`react.ts:60`). Never
   warned about. Grouped by the microtask only. There is no `batch()`: batched
   mode does not need one and sync mode has none. No position on `batch()`
   itself.
3. **Should snapshot getters stay enumerable own accessors?** No. A class
   getter is not an own property of a Valtio snapshot and is not enumerable;
   store and snapshot list the same keys. See V4.
4. **Can arrow-function methods and `#private` fields be made to work?**
   Valtio does not try. Run on both libraries: an arrow method changes the
   raw object and tells nobody; a method that reads a `#private` field throws
   a `TypeError`. Valtio adds one failure we do not have: a destructured
   method loses `this`. No position on a remedy.
5. **Should native `Map` and `Set` be reactive directly?** No. Valtio leaves
   them alone (the iterable rule, `vanilla.ts:67`) and offers `proxyMap` and
   `proxySet` as separate factories, with `unstable_deepProxy` to convert the
   native ones in an input tree (`deepProxy.ts:38-55`) and `isProxyMap` and
   `isProxySet` to test for them. The same choice as ours.
6. **Opt-in or opt-out for nested class instances?** Opt-out, with `ref()`.
   Two signs that it costs something: the list of built-in types it has to
   exclude by name (`vanilla.ts:64-76`), and a hook that lets an application
   replace the rule (`unstable_replaceInternalFunction('canProxy', …)`,
   `409-447`). See V12.
7. **Are entry points, export names and adapter names consistent across the
   five frameworks?** No position: the package has one adapter. Its entries
   are `valtio`, `valtio/vanilla`, `valtio/react`, `valtio/utils`,
   `valtio/vanilla/utils` and `valtio/react/utils`. Two observations. The hook
   is named for what it returns, `useSnapshot`, not for the library. And
   Valtio is inconsistent where we are not: `subscribe(p, cb, true)` and
   `subscribeKey(p, key, cb, true)` take a positional boolean, while the hook
   takes `{sync: true}`. Our `{sync}` object everywhere is the better shape.
8. **What development-only diagnostics would catch our silent failures?**
   Valtio has none for them: arrow methods, raw writes, `#private` and writes
   after an `await` are as silent there. What it does have:
   - The switch: `import.meta.env?.MODE !== 'production'` in the ESM build
     and `process.env.NODE_ENV !== 'production'` in the CommonJS build
     (checked in the published `esm/vanilla.mjs` and `vanilla.js`).
   - A warning when `subscribe` or `snapshot` is given something that is not
     a proxy (`vanilla.ts:319-321`, `356-358`). Ours throws, which is better.
   - The paths a component tracked, shown in React DevTools through
     `useDebugValue` and proxy-compare's `affectedToPathList`
     (`react.ts:24-35`, `169-171`). We have no equivalent, and it answers
     "why did this component re-render". Worth adopting in a development
     build.
   - A named error for a mutator called on a collection snapshot (V10).

## Rough timings

One process on Bun 1.4.4, an Apple M1 Max that other agents were using, three
rounds per case, best round. These are my own scripts (`bench.ts`,
`bench2.ts`), not the repository's benchmark, and they show orders of
magnitude only. Where rows are mentioned, the store holds 1,000 of
`{id, done, meta: {tags: {a}}}`, which is 3,002 nodes.

| Operation                                                          | Valtio 2.3.2 |     Ours |
| ------------------------------------------------------------------ | -----------: | -------: |
| Read a field                                                       |       1.6 ns |  30.5 ns |
| Read a field three objects deep                                    |      12.1 ns | 141.0 ns |
| Write a field, no subscriber                                       |      93.8 ns | 148.5 ns |
| Write a field, one sync subscriber                                 |     132.8 ns | 155.1 ns |
| Call a method that writes one field                                |     104.0 ns | 167.6 ns |
| Take a cached snapshot                                             |      27.6 ns |  22.9 ns |
| Write one of 1,000 rows, then snapshot (unobserved)                |     283.7 us | 124.1 us |
| Write one of 1,000 rows, then snapshot (observed)                  |     258.8 us | 128.7 us |
| Write to another store, then snapshot an unchanged 1,000-row store |      95.0 us | 231.1 ns |
| Create a store of 1,000 rows                                       |      2.51 ms |  1.52 ms |
| Create a store of 1,000 rows and snapshot it                       |      4.55 ms |  4.36 ms |
| Sort 1,000 rows, one sync subscriber that snapshots                |    247.92 ms | 884.9 us |
| Read a getter that sums 1,000 rows, nothing changed                |      23.2 us | 112.0 ns |
| Subscribe and unsubscribe, the only subscriber                     |       375 us |    84 ns |
| Subscribe and unsubscribe, a second subscriber                     |        83 ns |    66 ns |

Reading and writing are where Valtio is cheaper, and both come from having no
`get` trap and no walk on write. Everything that involves a snapshot, a
getter or a subscription is cheaper on ours.

## What was verified by running, and what was only read

Run, on Bun 1.4.4, with the code and output below:

- Every behaviour in V1 to V8 and V10 to V13 that is stated as a difference,
  and every table row marked "Run".
- The timings above and the ones quoted in V4, V8 and V10.
- The two prototypes: tracking a snapshot getter's reads (V5) and a lazy
  index for a frozen array (V10).
- The type assertions in V11, with a control that fails.

Only read:

- V9 (`devtools`) in full. No extension was mocked.
- Valtio's batched subscriber that throws (finding 23, second half), the
  notification order across owners (finding 24), and finding 42.
- Valtio's React hook. Nothing was rendered.

Reasoning, not tested:

- The proposals in V1 (dropping suspension, holding a listened-to node
  strongly), V3 (an in-progress map with freeze after filling) and V4 (one
  derived prototype per class). Each needs a spike in stage 3.

Not done:

- Nothing was run on Node except the frozen-array micro-benchmark.
- The memory checks use `Bun.gc(true)` and a `WeakRef`. JavaScriptCore scans
  the stack conservatively, so a single "not collected" is noise; only the
  results that were the same in all five rounds are relied on.

## Ported tests

Everything here was written and run in the scratch folder, with
`valtio@2.3.2` installed there. Each scenario runs once on Valtio and once on
our source, imported by absolute path. `[valtio]` and `[classy]` mark the two
runs in the output. A number in a heading is the stage 1 finding the scenario
was ported from.

### The harness, `libs.ts`

```ts
// Shared harness: the same scenario runs against Valtio and against our source.
import * as v from 'valtio/vanilla';
import * as vu from 'valtio/vanilla/utils';
import * as c from '<repo>/packages/classy-store/src/index.ts';
import * as cc from '<repo>/packages/classy-store/src/collections/index.ts';
import * as cu from '<repo>/packages/classy-store/src/utils/index.ts';

export type Lib = {
  name: string;
  create<T extends object>(o: T): T;
  snapshot<T extends object>(o: T): any;
  subscribe(o: object, cb: () => void, sync?: boolean): () => void;
};

export const valtio: Lib = {
  name: 'valtio',
  create: (o) => v.proxy(o),
  snapshot: (o) => v.snapshot(o),
  subscribe: (o, cb, sync) => v.subscribe(o, () => cb(), sync),
};
export const classy: Lib = {
  name: 'classy',
  create: (o) => c.createClassyStore(o),
  snapshot: (o) => c.snapshot(o),
  subscribe: (o, cb, sync) => c.subscribe(o, cb, {sync}),
};
export const libs = [valtio, classy];
export {v, vu, c, cc, cu};

export const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Run one labelled expression, print its value or the error it throws. */
export function show(label: string, fn: () => unknown): void {
  try {
    const value = fn();
    console.log(`  ${label}: ${format(value)}`);
  } catch (error) {
    console.log(
      `  ${label}: THROWS ${(error as Error).name}: ${(error as Error).message.slice(0, 90)}`,
    );
  }
}
function format(value: unknown): string {
  if (typeof value === 'function') return `[function ${value.name}]`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
export async function each(
  title: string,
  run: (lib: Lib) => void | Promise<void>,
) {
  console.log(`\n## ${title}`);
  for (const lib of libs) {
    console.log(` [${lib.name}]`);
    try {
      await run(lib);
    } catch (error) {
      console.log(
        `  scenario THROWS ${(error as Error).name}: ${(error as Error).message.slice(0, 120)}`,
      );
    }
  }
}
```

### Port 1: identity (findings 5, 6, 7, 8, 10)

```ts
import {each, show} from './libs';

// Stage 1 finding 5: a function held in an array.
await each('5. function held in an array', (lib) => {
  const first = () => 'first';
  const second = () => 'second';
  const store = lib.create({callbacks: [first, second]});
  show(
    'callbacks[0] === callbacks[0]',
    () => store.callbacks[0] === store.callbacks[0],
  );
  show('callbacks[0] === first', () => store.callbacks[0] === first);
  show('indexOf(first)', () => store.callbacks.indexOf(first));
  store.callbacks.splice(store.callbacks.indexOf(first), 1);
  show('after splice(indexOf(first), 1), names left', () =>
    store.callbacks.map((f) => f()),
  );
});

// Stage 1 finding 6: a class held as data.
await each('6. class held in a store', (lib) => {
  class Model {
    static label = 'model';
    constructor(public id: string) {}
  }
  const store = lib.create({Model});
  show('store.Model === Model', () => store.Model === Model);
  show('store.Model.label', () => store.Model.label);
  show(
    'new store.Model("x") instanceof store.Model',
    () => new store.Model('x') instanceof store.Model,
  );
});

// Stage 1 finding 7: searching a list for a raw object.
await each('7. list.includes(raw)', (lib) => {
  const raw = {id: 1};
  const store = lib.create({list: [raw]});
  show('list.includes(raw)', () => store.list.includes(raw));
  show('list.indexOf(raw)', () => store.list.indexOf(raw));
  show('list.includes(list[0])', () => store.list.includes(store.list[0]));
  const row = {id: 2};
  store.list.push(row);
  show('after push(row): list.includes(row)', () => store.list.includes(row));
});

// Stage 1 finding 8: a store that refers to itself, then a snapshot.
await each('8. self-reference, then snapshot', (lib) => {
  const store = lib.create({n: 1} as {n: number; self?: unknown});
  let calls = 0;
  lib.subscribe(store, () => calls++, true);
  show('store.self = store', () => {
    store.self = store;
    return 'ok';
  });
  show('sync calls after the write', () => calls);
  show('snapshot(store).self === snapshot(store)', () => {
    const snap = lib.snapshot(store);
    return snap.self === snap;
  });
  store.n = 2;
  show(
    'after n = 2: snapshot(store).self.self.n',
    () => lib.snapshot(store).self.self.n,
  );
  show('sync calls after the second write', () => calls);
});

// Stage 1 finding 10: what the raw object holds afterwards.
await each('10. raw object after wrapping', (lib) => {
  const child = {n: 1};
  const raw = {child};
  const store = lib.create(raw);
  void store.child;
  show('raw.child === child (raw graph untouched)', () => raw.child === child);
  show(
    'store.child === raw.child (raw holds the proxy)',
    () => store.child === raw.child,
  );
});
```

Output:

```text

## 5. function held in an array
 [valtio]
  callbacks[0] === callbacks[0]: true
  callbacks[0] === first: true
  indexOf(first): 0
  after splice(indexOf(first), 1), names left: ["second"]
 [classy]
  callbacks[0] === callbacks[0]: false
  callbacks[0] === first: false
  indexOf(first): -1
  after splice(indexOf(first), 1), names left: ["first"]

## 6. class held in a store
 [valtio]
  store.Model === Model: true
  store.Model.label: "model"
  new store.Model("x") instanceof store.Model: true
 [classy]
  store.Model === Model: false
  store.Model.label: undefined
  new store.Model("x") instanceof store.Model: false

## 7. list.includes(raw)
 [valtio]
  list.includes(raw): false
  list.indexOf(raw): -1
  list.includes(list[0]): true
  after push(row): list.includes(row): false
 [classy]
  list.includes(raw): false
  list.indexOf(raw): -1
  list.includes(list[0]): true
  after push(row): list.includes(row): false

## 8. self-reference, then snapshot
 [valtio]
  store.self = store: "ok"
  sync calls after the write: 1
  snapshot(store).self === snapshot(store): true
  after n = 2: snapshot(store).self.self.n: 2
  sync calls after the second write: 2
 [classy]
  store.self = store: "ok"
  sync calls after the write: 1
  snapshot(store).self === snapshot(store): THROWS Error: @codebelt/classy-store: circular reference detected in snapshot
  after n = 2: snapshot(store).self.self.n: THROWS Error: @codebelt/classy-store: circular reference detected in snapshot
  sync calls after the second write: 2

## 10. raw object after wrapping
 [valtio]
  raw.child === child (raw graph untouched): false
  store.child === raw.child (raw holds the proxy): true
 [classy]
  raw.child === child (raw graph untouched): true
  store.child === raw.child (raw holds the proxy): false
```

### Port 2: `defineProperty`, deletes and getters (findings 1, 45, 29, 30, 31; question 3)

```ts
import {each, flush, show} from './libs';

// Stage 1 findings 1 and 45: Object.defineProperty through the proxy.
await each('1. Object.defineProperty(store, "b", {value: 2})', (lib) => {
  const store = lib.create({a: 1} as {a: number; b?: number});
  let calls = 0;
  lib.subscribe(store, () => calls++, true);
  lib.snapshot(store);
  Object.defineProperty(store, 'b', {
    value: 2,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  show('store.b', () => store.b);
  show('sync calls', () => calls);
  show('snapshot(store).b', () => lib.snapshot(store).b);
  store.a = 5;
  show(
    'after an ordinary write: snapshot(store).b',
    () => lib.snapshot(store).b,
  );
});

await each('45. defineProperty over a property that holds an object', (lib) => {
  const store = lib.create({child: {n: 1}} as {child: {n: number}});
  const other = {n: 99};
  let calls = 0;
  lib.subscribe(store, () => calls++, true);
  Object.defineProperty(store, 'child', {
    value: other,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  show('store.child.n', () => store.child.n);
  store.child.n = 100;
  show('sync calls after store.child.n = 100', () => calls);
  show('snapshot(store).child.n', () => lib.snapshot(store).child.n);
  show('other.n', () => other.n);
});

// Stage 1 finding 29: a delete that removes nothing.
await each('29. delete of a missing key', async (lib) => {
  const store = lib.create({dict: {} as Record<string, number>, list: [1, 2]});
  let sync = 0;
  let batched = 0;
  lib.subscribe(store, () => sync++, true);
  lib.subscribe(store, () => batched++);
  const before = lib.snapshot(store);
  delete store.dict.missing;
  await flush();
  show('sync calls', () => sync);
  show('batched calls', () => batched);
  show(
    'snapshot unchanged (same object)',
    () => lib.snapshot(store) === before,
  );
  delete store.list[5];
  await flush();
  show('after delete list[5]: sync calls', () => sync);
  store.dict.x = 1;
  const mid = sync;
  store.dict.x = 1;
  show(
    'writing the value a field already holds: extra sync calls',
    () => sync - mid,
  );
});

// Stage 1 findings 30 and 31: a getter that asks which keys `this` has.
await each('30/31. getter reading Object.keys(this) and "b" in this', (lib) => {
  class Bag {
    a = 1;
    b?: number = 2;
    get count() {
      return Object.keys(this).length;
    }
    get hasB() {
      return 'b' in this;
    }
    get isBag() {
      return this instanceof Bag;
    }
  }
  const store = lib.create(new Bag());
  show('live count, hasB', () => [store.count, store.hasB]);
  show('snapshot count, hasB, isBag', () => {
    const snap = lib.snapshot(store);
    return [snap.count, snap.hasB, snap.isBag];
  });
  delete store.b;
  show('after delete store.b: live count, hasB', () => [
    store.count,
    store.hasB,
  ]);
  show('after delete store.b: snapshot count, hasB', () => {
    const snap = lib.snapshot(store);
    return [snap.count, snap.hasB];
  });
});

// API question 3: what a snapshot lists as its own keys.
await each('Q3. own keys of a snapshot of a class with getters', (lib) => {
  class Cart {
    items = [{price: 2}, {price: 3}];
    get total() {
      return this.items.reduce((sum, item) => sum + item.price, 0);
    }
  }
  const store = lib.create(new Cart());
  const snap = lib.snapshot(store);
  show('Object.keys(store)', () => Object.keys(store));
  show('Object.keys(snapshot)', () => Object.keys(snap));
  show('JSON.stringify(snapshot)', () => JSON.stringify(snap));
  show('{...snapshot}.total', () => ({...snap}).total);
  show('Object.getOwnPropertyDescriptor(snapshot, "total") kind', () => {
    const d = Object.getOwnPropertyDescriptor(snap, 'total');
    return d
      ? 'get' in d
        ? 'own accessor'
        : 'own data'
      : 'not own (on the prototype)';
  });
  show('snap.total === snap.total', () => snap.total === snap.total);
});

// Getter memoization: how often a getter body runs.
await each('getter runs: live reads and snapshot reads', (lib) => {
  let runs = 0;
  class Cart {
    items = [{price: 2}, {price: 3}];
    other = 0;
    get total() {
      runs++;
      return this.items.reduce((sum, item) => sum + item.price, 0);
    }
  }
  const store = lib.create(new Cart());
  store.total;
  store.total;
  store.total;
  show('runs after 3 live reads', () => runs);
  runs = 0;
  const snap = lib.snapshot(store);
  snap.total;
  snap.total;
  snap.total;
  show('runs after 3 reads of one snapshot', () => runs);
  runs = 0;
  store.other = 1;
  lib.snapshot(store).total;
  show('runs after an unrelated write, new snapshot, one read', () => runs);
});

// Valtio only: an object-literal getter in a snapshot.
await each('own (object-literal) getter in a snapshot', (lib) => {
  const store = lib.create({
    items: [{done: false}, {done: true}],
    get open() {
      return this.items.filter((item) => !item.done);
    },
  });
  const snap = lib.snapshot(store);
  show('descriptor kind of snapshot.open', () => {
    const d = Object.getOwnPropertyDescriptor(snap, 'open');
    return d ? ('get' in d && d.get ? 'own accessor' : 'own data') : 'not own';
  });
  show(
    'snapshot.open[0] is the live proxy',
    () => snap.open[0] === store.items[0],
  );
  show(
    'snapshot.open[0] is the snapshot row',
    () => snap.open[0] === snap.items[0],
  );
  show('Object.isFrozen(snapshot.open)', () => Object.isFrozen(snap.open));
});
```

Output:

```text

## 1. Object.defineProperty(store, "b", {value: 2})
 [valtio]
  store.b: 2
  sync calls: 0
  snapshot(store).b: undefined
  after an ordinary write: snapshot(store).b: 2
 [classy]
  store.b: 2
  sync calls: 0
  snapshot(store).b: undefined
  after an ordinary write: snapshot(store).b: 2

## 45. defineProperty over a property that holds an object
 [valtio]
  store.child.n: 99
  sync calls after store.child.n = 100: 0
  snapshot(store).child.n: 100
  other.n: 100
 [classy]
  store.child.n: 1
  sync calls after store.child.n = 100: 1
  snapshot(store).child.n: 100
  other.n: 99

## 29. delete of a missing key
 [valtio]
  sync calls: 1
  batched calls: 1
  snapshot unchanged (same object): false
  after delete list[5]: sync calls: 2
  writing the value a field already holds: extra sync calls: 0
 [classy]
  sync calls: 1
  batched calls: 1
  snapshot unchanged (same object): false
  after delete list[5]: sync calls: 2
  writing the value a field already holds: extra sync calls: 0

## 30/31. getter reading Object.keys(this) and "b" in this
 [valtio]
  live count, hasB: [2,true]
  snapshot count, hasB, isBag: [2,true,true]
  after delete store.b: live count, hasB: [1,false]
  after delete store.b: snapshot count, hasB: [1,false]
 [classy]
  live count, hasB: [2,true]
  snapshot count, hasB, isBag: [0,false,false]
  after delete store.b: live count, hasB: [2,true]
  after delete store.b: snapshot count, hasB: [0,false]

## Q3. own keys of a snapshot of a class with getters
 [valtio]
  Object.keys(store): ["items"]
  Object.keys(snapshot): ["items"]
  JSON.stringify(snapshot): "{\"items\":[{\"price\":2},{\"price\":3}]}"
  {...snapshot}.total: undefined
  Object.getOwnPropertyDescriptor(snapshot, "total") kind: "not own (on the prototype)"
  snap.total === snap.total: true
 [classy]
  Object.keys(store): ["items"]
  Object.keys(snapshot): ["items","total"]
  JSON.stringify(snapshot): "{\"items\":[{\"price\":2},{\"price\":3}],\"total\":5}"
  {...snapshot}.total: 5
  Object.getOwnPropertyDescriptor(snapshot, "total") kind: "own accessor"
  snap.total === snap.total: true

## getter runs: live reads and snapshot reads
 [valtio]
  runs after 3 live reads: 3
  runs after 3 reads of one snapshot: 3
  runs after an unrelated write, new snapshot, one read: 1
 [classy]
  runs after 3 live reads: 1
  runs after 3 reads of one snapshot: 1
  runs after an unrelated write, new snapshot, one read: 0

## own (object-literal) getter in a snapshot
 [valtio]
  descriptor kind of snapshot.open: "own data"
  snapshot.open[0] is the live proxy: true
  snapshot.open[0] is the snapshot row: false
  Object.isFrozen(snapshot.open): false
 [classy]
  descriptor kind of snapshot.open: "own accessor"
  snapshot.open[0] is the live proxy: false
  snapshot.open[0] is the snapshot row: true
  Object.isFrozen(snapshot.open): false
```

### Port 3: notifications (findings 18 to 23, 43; the `sync` option)

```ts
import {each, flush, show} from './libs';

const quiet = async (run: () => void | Promise<void>) => {
  const original = console.error;
  const errors: string[] = [];
  console.error = (e: unknown) => errors.push((e as Error)?.name ?? String(e));
  try {
    await run();
  } finally {
    console.error = original;
  }
  return errors;
};

// Stage 1 finding 18: a sync subscriber that writes to the store it listens to.
await each(
  '18. sync subscriber writes to its own store on every call',
  async (lib) => {
    const store = lib.create({n: 0});
    let calls = 0;
    lib.subscribe(
      store,
      () => {
        calls++;
        store.n++;
      },
      true,
    );
    let thrown = 'nothing';
    const errors = await quiet(() => {
      try {
        store.n = 1;
      } catch (error) {
        thrown = (error as Error).name;
      }
    });
    show('the writer sees', () => thrown);
    show('console.error received', () => [...new Set(errors)]);
    show('subscriber calls > 1000', () => calls > 1000);
    show('store.n > 1000 (the writes were kept)', () => store.n > 1000);
  },
);

// The bounded form: a subscriber that writes until a limit.
await each(
  '18b. sync subscriber writes until n reaches 3; second subscriber watches',
  (lib) => {
    const store = lib.create({n: 0});
    const seen: number[] = [];
    lib.subscribe(
      store,
      () => {
        if (store.n < 3) store.n++;
      },
      true,
    );
    lib.subscribe(store, () => seen.push(lib.snapshot(store).n), true);
    store.n = 1;
    show('values the second subscriber saw', () => seen);
  },
);

// Stage 1 finding 19, bounded: a batched subscriber that writes.
await each(
  '19. batched subscriber writes until n reaches 3; timer due meanwhile',
  async (lib) => {
    const store = lib.create({n: 0});
    const order: string[] = [];
    lib.subscribe(store, () => {
      order.push(`cb${store.n}`);
      if (store.n < 3) store.n++;
    });
    setTimeout(() => order.push('timer'), 0);
    store.n = 1;
    await flush();
    await flush();
    show('order', () => order);
  },
);

// Stage 1 finding 20: unsubscribing during delivery.
await each('20. A unsubscribes B during delivery (sync)', (lib) => {
  const store = lib.create({n: 0});
  const calls: string[] = [];
  let offB = () => {};
  lib.subscribe(
    store,
    () => {
      calls.push('A');
      offB();
    },
    true,
  );
  offB = lib.subscribe(store, () => calls.push('B'), true);
  store.n = 1;
  show('calls', () => calls);
});
await each('20. A unsubscribes B during delivery (batched)', async (lib) => {
  const store = lib.create({n: 0});
  const calls: string[] = [];
  let offB = () => {};
  lib.subscribe(store, () => {
    calls.push('A');
    offB();
  });
  offB = lib.subscribe(store, () => calls.push('B'));
  store.n = 1;
  await flush();
  show('calls', () => calls);
});
await each(
  '20. unsubscribe after the write, before the microtask (batched)',
  async (lib) => {
    const store = lib.create({n: 0});
    let calls = 0;
    const off = lib.subscribe(store, () => calls++);
    store.n = 1;
    off();
    await flush();
    show('calls', () => calls);
  },
);

// Stage 1 finding 21: a subscriber added after a write.
await each('21. batched subscriber added after the write', async (lib) => {
  const store = lib.create({n: 0});
  let early = 0;
  let late = 0;
  lib.subscribe(store, () => early++);
  store.n = 1;
  lib.subscribe(store, () => late++);
  await flush();
  show('early, late', () => [early, late]);
});
await each(
  '21. sync subscriber added by another sync subscriber during delivery',
  (lib) => {
    const store = lib.create({n: 0});
    let added = 0;
    let done = false;
    lib.subscribe(
      store,
      () => {
        if (!done) {
          done = true;
          lib.subscribe(store, () => added++, true);
        }
      },
      true,
    );
    store.n = 1;
    show('calls of the subscriber added during delivery', () => added);
  },
);

// Stage 1 finding 23 and its sync twin: a subscriber that throws.
await each('23. first sync subscriber throws', async (lib) => {
  const store = lib.create({n: 0});
  let second = 0;
  lib.subscribe(
    store,
    () => {
      throw new TypeError('boom');
    },
    true,
  );
  lib.subscribe(store, () => second++, true);
  let thrown = 'nothing';
  const errors = await quiet(() => {
    try {
      store.n = 1;
    } catch (error) {
      thrown = (error as Error).name;
    }
  });
  show('the writer sees', () => thrown);
  show('console.error received', () => errors);
  show('second subscriber calls', () => second);
  show('store.n', () => store.n);
});

// The sync option: how many sync notifications one array operation makes.
await each('sync notifications per array operation (100 rows)', (lib) => {
  const rows = Array.from({length: 100}, (_, i) => ({id: 100 - i}));
  const store = lib.create({rows});
  let calls = 0;
  lib.subscribe(store, () => calls++, true);
  const count = (label: string, run: () => void) => {
    calls = 0;
    run();
    show(label, () => calls);
  };
  count('push(row)', () => store.rows.push({id: 0}));
  count('unshift(row)', () => store.rows.unshift({id: -1}));
  count('sort()', () => store.rows.sort((a, b) => a.id - b.id));
  count('reverse()', () => store.rows.reverse());
  count('splice(0, 1)', () => store.rows.splice(0, 1));
  count('rows.length = 0', () => {
    store.rows.length = 0;
  });
});

// Stage 1 finding 43: a setter that writes two fields.
await each(
  '43. method and setter that write two fields: sync notifications',
  (lib) => {
    class Pair {
      a = 0;
      b = 0;
      set both(value: number) {
        this.a = value;
        this.b = value;
      }
      setBoth(value: number) {
        this.a = value;
        this.b = value;
      }
    }
    const store = lib.create(new Pair());
    const seen: string[] = [];
    lib.subscribe(store, () => seen.push(`${store.a},${store.b}`), true);
    store.setBoth(1);
    show('method: states seen', () => seen.splice(0));
    store.both = 2;
    show('setter: states seen', () => seen.splice(0));
  },
);
```

Output:

```text

## 18. sync subscriber writes to its own store on every call
 [valtio]
  the writer sees: "RangeError"
  console.error received: []
  subscriber calls > 1000: true
  store.n > 1000 (the writes were kept): true
 [classy]
  the writer sees: "nothing"
  console.error received: ["RangeError"]
  subscriber calls > 1000: true
  store.n > 1000 (the writes were kept): true

## 18b. sync subscriber writes until n reaches 3; second subscriber watches
 [valtio]
  values the second subscriber saw: [3,3,3]
 [classy]
  values the second subscriber saw: [3,3,3]

## 19. batched subscriber writes until n reaches 3; timer due meanwhile
 [valtio]
  order: ["cb1","cb2","cb3","timer"]
 [classy]
  order: ["cb1","cb2","cb3","timer"]

## 20. A unsubscribes B during delivery (sync)
 [valtio]
  calls: ["A"]
 [classy]
  calls: ["A","B"]

## 20. A unsubscribes B during delivery (batched)
 [valtio]
  calls: ["A"]
 [classy]
  calls: ["A","B"]

## 20. unsubscribe after the write, before the microtask (batched)
 [valtio]
  calls: 0
 [classy]
  calls: 0

## 21. batched subscriber added after the write
 [valtio]
  early, late: [1,0]
 [classy]
  early, late: [1,1]

## 21. sync subscriber added by another sync subscriber during delivery
 [valtio]
  calls of the subscriber added during delivery: 1
 [classy]
  calls of the subscriber added during delivery: 0

## 23. first sync subscriber throws
 [valtio]
  the writer sees: "TypeError"
  console.error received: []
  second subscriber calls: 0
  store.n: 1
 [classy]
  the writer sees: "nothing"
  console.error received: ["TypeError"]
  second subscriber calls: 1
  store.n: 1

## sync notifications per array operation (100 rows)
 [valtio]
  push(row): 1
  unshift(row): 102
  sort(): 100
  reverse(): 102
  splice(0, 1): 103
  rows.length = 0: 1
 [classy]
  push(row): 1
  unshift(row): 1
  sort(): 1
  reverse(): 1
  splice(0, 1): 1
  rows.length = 0: 1

## 43. method and setter that write two fields: sync notifications
 [valtio]
  method: states seen: ["1,0","1,1"]
  setter: states seen: ["2,1","2,2","2,2"]
 [classy]
  method: states seen: ["1,1"]
  setter: states seen: ["2,1","2,2"]
```

### Port 4: detached subtrees and memory (findings 25, 27, 72)

```ts
import {each, flush, show, type Lib} from './libs';

// Stage 1 finding 25: a raw object changed while detached, then put back.
await each(
  '25. delete slot; raw.n = 2; slot = raw (snapshot taken before)',
  (lib) => {
    const raw = {n: 1};
    const store = lib.create({slot: raw} as {slot?: {n: number}});
    lib.snapshot(store);
    delete store.slot;
    raw.n = 2;
    store.slot = raw;
    show('store.slot.n', () => store.slot?.n);
    show('snapshot(store).slot.n', () => lib.snapshot(store).slot.n);
  },
);

// What suspend and resume are for: a child written through its proxy while its
// container is out of the store and unobserved, then the container put back.
await each(
  '72. child written while its container is detached, container put back',
  (lib) => {
    const store = lib.create({box: {row: {n: 1}}} as {
      box?: {row: {n: number}};
    });
    lib.snapshot(store);
    const box = store.box!;
    const row = box.row;
    delete store.box;
    lib.snapshot(store);
    row.n = 2;
    store.box = box;
    show('snapshot(store).box.row.n', () => lib.snapshot(store).box.row.n);
    let calls = 0;
    lib.subscribe(store, () => calls++, true);
    row.n = 3;
    show('root subscriber hears a row write after re-attach', () => calls);
  },
);

await each(
  '72. subscriber on a detached container still hears its children',
  (lib) => {
    const store = lib.create({box: {row: {n: 1}}} as {
      box?: {row: {n: number}};
    });
    const box = store.box!;
    let boxCalls = 0;
    let rootCalls = 0;
    lib.subscribe(box, () => boxCalls++, true);
    lib.subscribe(store, () => rootCalls++, true);
    delete store.box;
    rootCalls = 0;
    box.row.n = 2;
    show('box subscriber calls', () => boxCalls);
    show(
      'root subscriber calls (box is no longer in the store)',
      () => rootCalls,
    );
    show('snapshot(box).row.n', () => lib.snapshot(box).row.n);
  },
);

// Memory: one retained row must not keep the list it was removed with alive.
async function collected(ref: WeakRef<object>): Promise<boolean> {
  for (let i = 0; i < 20 && ref.deref(); i++) {
    await flush();
    Bun.gc(true);
  }
  return ref.deref() === undefined;
}
function setUp(lib: Lib, observed: boolean) {
  const store = lib.create({list: Array.from({length: 50}, (_, n) => ({n}))});
  if (observed) lib.subscribe(store, () => {}, true);
  lib.snapshot(store);
  const row = store.list[0];
  const list = new WeakRef(store.list as object);
  store.list = [];
  lib.snapshot(store);
  return {store, row, list};
}
for (const observed of [true, false]) {
  await each(
    `27/72. retained row, replaced list, store ${observed ? 'observed' : 'unobserved'}`,
    async (lib) => {
      const held = setUp(lib, observed);
      const gone = await collected(held.list);
      show('the replaced list was collected', () => gone);
      show('the retained row still works', () => {
        held.row.n = 7;
        return held.row.n;
      });
    },
  );
}
```

Output:

```text

## 25. delete slot; raw.n = 2; slot = raw (snapshot taken before)
 [valtio]
  store.slot.n: 2
  snapshot(store).slot.n: 1
 [classy]
  store.slot.n: 2
  snapshot(store).slot.n: 1

## 72. child written while its container is detached, container put back
 [valtio]
  snapshot(store).box.row.n: 2
  root subscriber hears a row write after re-attach: 1
 [classy]
  snapshot(store).box.row.n: 2
  root subscriber hears a row write after re-attach: 1

## 72. subscriber on a detached container still hears its children
 [valtio]
  box subscriber calls: 1
  root subscriber calls (box is no longer in the store): 0
  snapshot(box).row.n: 2
 [classy]
  box subscriber calls: 1
  root subscriber calls (box is no longer in the store): 0
  snapshot(box).row.n: 2

## 27/72. retained row, replaced list, store observed
 [valtio]
  the replaced list was collected: false
  the retained row still works: 7
 [classy]
  the replaced list was collected: true
  the retained row still works: 7

## 27/72. retained row, replaced list, store unobserved
 [valtio]
  the replaced list was collected: true
  the retained row still works: 7
 [classy]
  the replaced list was collected: true
  the retained row still works: 7
```

### Port 4b: the read that never returns (finding 66)

```ts
// Stage 1 finding 66, run once per library in a child process with a timeout.
import {libs} from './libs';
const lib = libs.find((l) => l.name === process.argv[2])!;
const store = lib.create({outer: {inner: {x: 1}}} as any);
const outer = store.outer;
const inner = outer.inner;
delete store.outer;
Object.defineProperty(outer, 'inner', {writable: false, configurable: false});
lib.snapshot(inner);
lib.snapshot(inner);
inner.back = outer;
lib.subscribe(inner, () => {}, true)();
console.log(`  [${lib.name}] inner.x: ${inner.x}`);
```

Output:

```text
  [valtio] inner.x: 1
  [valtio] exit code: 0 (124 means killed by the 8-second timeout)
  [classy] exit code: 124 (124 means killed by the 8-second timeout)
```

### Port 4c: the memory check, five rounds

```ts
import {flush, libs, type Lib} from './libs';
async function collected(ref: WeakRef<object>): Promise<boolean> {
  for (let i = 0; i < 30 && ref.deref(); i++) {
    await flush();
    Bun.gc(true);
  }
  return ref.deref() === undefined;
}
function setUp(lib: Lib, observed: boolean, snap: boolean) {
  const store = lib.create({list: Array.from({length: 50}, (_, n) => ({n}))});
  if (observed) lib.subscribe(store, () => {}, true);
  if (snap) lib.snapshot(store);
  const row = store.list[0];
  const list = new WeakRef(store.list as object);
  store.list = [];
  if (snap) lib.snapshot(store);
  return {store, row, list};
}
const lib = libs.find((l) => l.name === process.argv[2])!;
const observed = process.argv[3] === 'observed';
const snap = process.argv[4] !== 'nosnap';
const results: boolean[] = [];
for (let round = 0; round < 5; round++) {
  const held = setUp(lib, observed, snap);
  results.push(await collected(held.list));
  held.row.n = 1;
}
console.log(
  `  [${lib.name}] ${process.argv[3]} ${process.argv[4] ?? 'snap'}: collected in 5 rounds: ${results.join(', ')}`,
);
```

Output:

```text
  [valtio] observed snap: collected in 5 rounds: false, true, true, true, true
  [valtio] unobserved snap: collected in 5 rounds: true, true, true, true, true
  [classy] observed snap: collected in 5 rounds: true, true, true, false, true
  [classy] unobserved snap: collected in 5 rounds: true, true, true, false, true
```

### Port 4d: a subscribed container after a garbage collection

```ts
// A container that has a subscriber is removed from the store. The caller keeps
// one of its rows, and drops the unsubscribe function. Does the subscriber
// still hear a write to the row after a garbage collection?
import {flush, libs, type Lib} from './libs';
const calls = {count: 0};
function setUp(lib: Lib) {
  const store = lib.create({list: Array.from({length: 50}, (_, n) => ({n}))});
  lib.subscribe(store.list, () => calls.count++, true); // unsubscribe function dropped
  const row = store.list[0];
  const list = new WeakRef(store.list as object);
  store.list = [];
  return {row, list};
}
const lib = libs.find((l) => l.name === process.argv[2])!;
const out: string[] = [];
for (let round = 0; round < 5; round++) {
  const held = setUp(lib);
  held.row.n = 100; // before any collection
  const before = calls.count;
  for (let i = 0; i < 30 && held.list.deref(); i++) {
    await flush();
    Bun.gc(true);
  }
  held.row.n = 200;
  out.push(
    `${held.list.deref() ? 'alive' : 'collected'}/${before}->${calls.count}`,
  );
  calls.count = 0;
}
console.log(
  `  [${lib.name}] list after gc / subscriber calls before->after: ${out.join('  ')}`,
);
```

Output:

```text
  [valtio] list after gc / subscriber calls before->after: alive/1->2  alive/1->2  alive/1->2  alive/1->2  alive/1->2
  [classy] list after gc / subscriber calls before->after: collected/1->1  collected/1->1  collected/1->1  collected/1->1  collected/1->1
```

### Port 5: reactive collections (findings 16, 33, 34)

```ts
import {cc, each, show, vu, type Lib} from './libs';

const makeSet = (lib: Lib, init?: Iterable<unknown>) =>
  lib.name === 'valtio'
    ? (vu.proxySet(init as never) as any)
    : (cc.reactiveSet(init) as any);
const makeMap = (lib: Lib, init?: Iterable<[unknown, unknown]>) =>
  lib.name === 'valtio'
    ? (vu.proxyMap(init as never) as any)
    : (cc.reactiveMap(init) as any);

// Looking a member up by raw object, by proxy and by snapshot.
await each('collections: one object as raw, proxy and snapshot', (lib) => {
  const raw = {id: 1};
  const store = lib.create({
    rows: [raw],
    picked: makeSet(lib),
    notes: makeMap(lib),
  });
  const proxy = store.rows[0];
  store.picked.add(raw);
  store.notes.set(raw, 'note');
  const snap = lib.snapshot(store);
  show('set.size after add(raw)', () => store.picked.size);
  show('set.has(raw), has(proxy), has(snapshot row)', () => [
    store.picked.has(raw),
    store.picked.has(proxy),
    store.picked.has(snap.rows[0]),
  ]);
  show('map.get(raw), get(proxy), get(snapshot row)', () => [
    store.notes.get(raw),
    store.notes.get(proxy),
    store.notes.get(snap.rows[0]),
  ]);
  show('snapshot: set.has(snapshot row), map.get(snapshot row)', () => [
    snap.picked.has(snap.rows[0]),
    snap.notes.get(snap.rows[0]),
  ]);
  show('snapshot: set.has(proxy), map.get(raw)', () => [
    snap.picked.has(proxy),
    snap.notes.get(raw),
  ]);
  store.picked.add(proxy);
  store.notes.set(proxy, 'again');
  show('after add(proxy), set(proxy, …): set.size, map.size', () => [
    store.picked.size,
    store.notes.size,
  ]);
});

// Stage 1 findings 33 and 34.
await each('33. +0 and -0', (lib) => {
  const added = makeSet(lib, [0]);
  const store = lib.create({added, built: makeSet(lib, [0, -0])});
  store.added.add(-0);
  show('add: size', () => store.added.size);
  show('constructor: size', () => store.built.size);
});
await each('34. constructed from [raw, proxy]', (lib) => {
  const raw = {id: 1};
  const holder = lib.create({rows: [raw]});
  const store = lib.create({set: makeSet(lib, [raw, holder.rows[0]])});
  show('size', () => store.set.size);
  store.set.delete(raw);
  show('after delete(raw): has(raw), size', () => [
    store.set.has(raw),
    store.set.size,
  ]);
});

// Stage 1 finding 16: mutating a snapshot of a collection.
await each('16. mutators on a snapshot of a collection', (lib) => {
  const store = lib.create({
    tags: makeSet(lib, ['a']),
    todos: makeMap(lib, [['k', 1]]),
  });
  const snap = lib.snapshot(store);
  show('snapshot.tags.add("b")', () => snap.tags.add('b'));
  show('snapshot.todos.set("k", 2)', () => snap.todos.set('k', 2));
  show('snapshot.todos.clear()', () => snap.todos.clear());
  show('snapshot.todos.get("k") afterwards', () => snap.todos.get('k'));
});

// Churn: what the backing storage looks like after many set/delete pairs.
await each(
  'backing storage after 10,000 set+delete pairs, one live entry',
  (lib) => {
    const store = lib.create({map: makeMap(lib)});
    for (let i = 0; i < 10_000; i++) {
      store.map.set(`k${i}`, i);
      if (i > 0) store.map.delete(`k${i - 1}`);
    }
    show('size', () => store.map.size);
    show(
      'backing array length',
      () => (store.map.data ?? store.map._entries).length,
    );
  },
);

// Lookup cost in a large collection.
await each('time for 1,000 has() calls on a set of 10,000 numbers', (lib) => {
  const store = lib.create({
    set: makeSet(
      lib,
      Array.from({length: 10_000}, (_, i) => i),
    ),
  });
  const start = performance.now();
  let hits = 0;
  for (let i = 0; i < 1_000; i++)
    if (store.set.has(9_000 + (i % 1_000))) hits++;
  const ms = performance.now() - start;
  show('hits', () => hits);
  console.log(`  milliseconds: ${ms.toFixed(2)}`);
  const snap = lib.snapshot(store);
  const start2 = performance.now();
  for (let i = 0; i < 1_000; i++) snap.set.has(9_000 + (i % 1_000));
  console.log(
    `  milliseconds on a snapshot: ${(performance.now() - start2).toFixed(2)}`,
  );
  const start3 = performance.now();
  for (let i = 0; i < 100; i++) {
    store.set.add(20_000 + i);
    lib.snapshot(store);
  }
  console.log(
    `  milliseconds for 100 x (add one, snapshot): ${(performance.now() - start3).toFixed(2)}`,
  );
});
```

Output:

```text

## collections: one object as raw, proxy and snapshot
 [valtio]
  set.size after add(raw): 1
  set.has(raw), has(proxy), has(snapshot row): [true,true,false]
  map.get(raw), get(proxy), get(snapshot row): ["note",null,null]
  snapshot: set.has(snapshot row), map.get(snapshot row): [false,null]
  snapshot: set.has(proxy), map.get(raw): [true,"note"]
  after add(proxy), set(proxy, …): set.size, map.size: [1,2]
 [classy]
  set.size after add(raw): 1
  set.has(raw), has(proxy), has(snapshot row): [true,true,true]
  map.get(raw), get(proxy), get(snapshot row): ["note","note","note"]
  snapshot: set.has(snapshot row), map.get(snapshot row): [true,"note"]
  snapshot: set.has(proxy), map.get(raw): [true,"note"]
  after add(proxy), set(proxy, …): set.size, map.size: [1,1]

## 33. +0 and -0
 [valtio]
  add: size: 1
  constructor: size: 1
 [classy]
  add: size: 2
  constructor: size: 1

## 34. constructed from [raw, proxy]
 [valtio]
  size: 1
  after delete(raw): has(raw), size: [false,0]
 [classy]
  size: 2
  after delete(raw): has(raw), size: [true,1]

## 16. mutators on a snapshot of a collection
 [valtio]
  snapshot.tags.add("b"): THROWS Error: Cannot perform mutations on a snapshot
  snapshot.todos.set("k", 2): THROWS Error: Cannot perform mutations on a snapshot
  snapshot.todos.clear(): THROWS Error: Cannot perform mutations on a snapshot
  snapshot.todos.get("k") afterwards: 1
 [classy]
  snapshot.tags.add("b"): THROWS TypeError: Attempted to assign to readonly property.
  snapshot.todos.set("k", 2): THROWS TypeError: Attempted to assign to readonly property.
  snapshot.todos.clear(): THROWS TypeError: Unable to delete property.
  snapshot.todos.get("k") afterwards: 1

## backing storage after 10,000 set+delete pairs, one live entry
 [valtio]
  size: 1
  backing array length: 10000
 [classy]
  size: 1
  backing array length: 1

## time for 1,000 has() calls on a set of 10,000 numbers
 [valtio]
  hits: 1000
  milliseconds: 0.20
  milliseconds on a snapshot: 0.07
  milliseconds for 100 x (add one, snapshot): 220.92
 [classy]
  hits: 1000
  milliseconds: 22.06
  milliseconds on a snapshot: 245.15
  milliseconds for 100 x (add one, snapshot): 164.26
```

### Port 6: private fields, class instances, `ref()`, immutability

```ts
import {createProxy, getUntracked} from 'proxy-compare';
import {each, show, v} from './libs';

// API question 4: arrow-function methods and #private fields.
await each(
  'Q4. arrow-function method, #private field, destructured method',
  (lib) => {
    class Counter {
      count = 0;
      #secret = 1;
      arrow = () => {
        this.count++;
      };
      method() {
        this.count++;
      }
      readSecret() {
        return this.#secret;
      }
    }
    const store = lib.create(new Counter());
    let calls = 0;
    lib.subscribe(store, () => calls++, true);
    store.arrow();
    show('after arrow(): store.count, sync calls, snapshot.count', () => [
      store.count,
      calls,
      lib.snapshot(store).count,
    ]);
    store.method();
    show('after method(): store.count, sync calls, snapshot.count', () => [
      store.count,
      calls,
      lib.snapshot(store).count,
    ]);
    show('readSecret() through the store', () => store.readSecret());
    show('readSecret() on a snapshot', () => lib.snapshot(store).readSecret());
    const {method} = store;
    show('destructured method()', () => {
      method();
      return store.count;
    });
  },
);

// API question 6: a nested class instance, by default.
await each('Q6. nested class instance with no marker', (lib) => {
  class Point {
    x = 1;
    move() {
      this.x++;
    }
  }
  const store = lib.create({point: new Point()});
  let calls = 0;
  lib.subscribe(store, () => calls++, true);
  const before = lib.snapshot(store);
  store.point.x = 5;
  show('sync calls after store.point.x = 5', () => calls);
  show('snapshot(store).point.x', () => lib.snapshot(store).point.x);
  show('earlier snapshot.point.x (should stay 1)', () => before.point.x);
  show(
    'snapshot.point is the live instance',
    () => lib.snapshot(store).point === store.point,
  );
});

// ref() and its nearest equivalents.
await each('ref(): a plain object held without tracking', (lib) => {
  const blob = {big: [1, 2, 3]};
  const held = lib.name === 'valtio' ? v.ref(blob) : Object.freeze(blob);
  const store = lib.create({held});
  show('store.held === blob', () => store.held === blob);
  show(
    'snapshot(store).held === blob',
    () => lib.snapshot(store).held === blob,
  );
  show('blob can still be changed by its owner', () => {
    (blob as any).extra = 1;
    return (blob as any).extra;
  });
});

// Snapshot immutability.
await each('is a snapshot immutable?', (lib) => {
  const store = lib.create({n: 1, list: [1, 2], child: {a: 1}} as any);
  const snap = lib.snapshot(store);
  show('Object.isFrozen(snapshot), isFrozen(snapshot.list)', () => [
    Object.isFrozen(snap),
    Object.isFrozen(snap.list),
  ]);
  show('snapshot.n = 2', () => {
    'use strict';
    snap.n = 2;
    return snap.n;
  });
  show('snapshot.extra = 1', () => {
    snap.extra = 1;
    return snap.extra;
  });
  show('snapshot.list.push(3)', () => {
    snap.list.push(3);
    return snap.list;
  });
  show('delete snapshot.child', () => {
    delete snap.child;
    return 'child' in snap;
  });
  show(
    'snapshot(store) is still that changed object',
    () => lib.snapshot(store) === snap && Object.keys(snap),
  );
});

// A getter that throws while a snapshot is being built.
await each('own getter throws during snapshot(), then recovers', (lib) => {
  let fail = true;
  const store = lib.create({
    a: 1,
    get risky() {
      if (fail) throw new Error('not ready');
      return 'ready';
    },
    z: 26,
  });
  show('first snapshot()', () => Object.keys(lib.snapshot(store)));
  fail = false;
  show('second snapshot(): keys', () => Object.keys(lib.snapshot(store)));
  show('second snapshot(): risky, z', () => {
    const s = lib.snapshot(store);
    return [s.risky, s.z];
  });
});

// Deep input.
await each('creating a store from an object nested 20,000 deep', (lib) => {
  let deep: any = {leaf: true};
  for (let i = 0; i < 20_000; i++) deep = {next: deep};
  show('create', () => {
    lib.create(deep);
    return 'ok';
  });
});

// Wrapping twice.
await each('wrapping a store again', (lib) => {
  const store = lib.create({n: 1});
  show('create(store) === store', () => lib.create(store) === store);
});

// A tracked snapshot value handed back to the store. Valtio only here: this
// file's proxy-compare is the instance Valtio uses. The same check against the
// instance our library uses is in proto-getuntracked.ts.
console.log(
  '\n## proxy-compare getUntracked() on a tracked snapshot of a class instance',
);
{
  class Row {
    n = 1;
  }
  const store = v.proxy({plain: {n: 1}, row: new Row()});
  const snap = v.snapshot(store);
  const tracked = createProxy(snap, new WeakMap());
  console.log(' [valtio]');
  show(
    'plain row: is a tracking proxy, getUntracked finds the snapshot',
    () => [
      tracked.plain !== snap.plain,
      getUntracked(tracked.plain) === snap.plain,
    ],
  );
  show(
    'class row: is a tracking proxy, getUntracked finds the snapshot',
    () => [tracked.row !== snap.row, getUntracked(tracked.row) === snap.row],
  );
}
```

Output:

```text

## Q4. arrow-function method, #private field, destructured method
 [valtio]
  after arrow(): store.count, sync calls, snapshot.count: [1,0,1]
  after method(): store.count, sync calls, snapshot.count: [2,1,2]
  readSecret() through the store: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
  readSecret() on a snapshot: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
  destructured method(): THROWS TypeError: undefined is not an object (evaluating 'this.count')
 [classy]
  after arrow(): store.count, sync calls, snapshot.count: [1,0,1]
  after method(): store.count, sync calls, snapshot.count: [2,1,2]
  readSecret() through the store: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
  readSecret() on a snapshot: THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
  destructured method(): 3

## Q6. nested class instance with no marker
 [valtio]
  sync calls after store.point.x = 5: 1
  snapshot(store).point.x: 5
  earlier snapshot.point.x (should stay 1): 1
  snapshot.point is the live instance: false
 [classy]
  sync calls after store.point.x = 5: 0
  snapshot(store).point.x: 5
  earlier snapshot.point.x (should stay 1): 5
  snapshot.point is the live instance: true

## ref(): a plain object held without tracking
 [valtio]
  store.held === blob: true
  snapshot(store).held === blob: true
  blob can still be changed by its owner: 1
 [classy]
  store.held === blob: true
  snapshot(store).held === blob: true
  blob can still be changed by its owner: THROWS TypeError: Attempting to define property on object that is not extensible.

## is a snapshot immutable?
 [valtio]
  Object.isFrozen(snapshot), isFrozen(snapshot.list): [false,false]
  snapshot.n = 2: THROWS TypeError: Attempted to assign to readonly property.
  snapshot.extra = 1: 1
  snapshot.list.push(3): [1,2,3]
  delete snapshot.child: false
  snapshot(store) is still that changed object: ["n","list","extra"]
 [classy]
  Object.isFrozen(snapshot), isFrozen(snapshot.list): [true,true]
  snapshot.n = 2: THROWS TypeError: Attempted to assign to readonly property.
  snapshot.extra = 1: THROWS TypeError: Attempting to define property on object that is not extensible.
  snapshot.list.push(3): THROWS TypeError: Attempted to assign to readonly property.
  delete snapshot.child: THROWS TypeError: Unable to delete property.
  snapshot(store) is still that changed object: ["n","list","child"]

## own getter throws during snapshot(), then recovers
 [valtio]
  first snapshot(): THROWS Error: not ready
  second snapshot(): keys: ["a"]
  second snapshot(): risky, z: [null,null]
 [classy]
  first snapshot(): ["a","z","risky"]
  second snapshot(): keys: ["a","z","risky"]
  second snapshot(): risky, z: ["ready",26]

## creating a store from an object nested 20,000 deep
 [valtio]
  create: THROWS RangeError: Maximum call stack size exceeded.
 [classy]
  create: "ok"

## wrapping a store again
 [valtio]
  create(store) === store: false
 [classy]
  create(store) === store: true

## proxy-compare getUntracked() on a tracked snapshot of a class instance
 [valtio]
  plain row: is a tracking proxy, getUntracked finds the snapshot: [true,true]
  class row: is a tracking proxy, getUntracked finds the snapshot: [true,false]
```

### Port 7: embedded stores, frozen raw objects, `subscribeKey` (findings 9, 46, 50)

```ts
import {c, cu, each, show, v, vu} from './libs';

// Stage 1 finding 9: a raw object that is already a store, placed in another store.
await each(
  '9. raw instance that is already a store, placed in another store',
  (lib) => {
    class Inner {
      static [c.PROXYABLE] = true;
      n = 0;
      bump() {
        this.n++;
      }
    }
    class Plain {
      n = 0;
      bump() {
        this.n++;
      }
    }
    for (const Kind of [Inner, Plain]) {
      const raw = new Kind();
      const innerStore = lib.create(raw);
      const outer = lib.create({
        inner: null as unknown as InstanceType<typeof Kind>,
      });
      outer.inner = raw;
      let outerCalls = 0;
      let innerCalls = 0;
      lib.subscribe(outer, () => outerCalls++, true);
      lib.subscribe(innerStore, () => innerCalls++, true);
      outer.inner.bump();
      show(
        `${Kind.name}: outer.inner === innerStore, outer calls, inner calls`,
        () => [outer.inner === innerStore, outerCalls, innerCalls],
      );
    }
  },
);

// Stage 1 finding 46: freezing the raw object behind the store.
await each(
  '46. Object.freeze(raw.config), then read and write through the store',
  (lib) => {
    const raw = {config: {nested: {a: 1}, n: 1}};
    const store = lib.create(raw);
    let calls = 0;
    lib.subscribe(store, () => calls++, true);
    Object.freeze(raw.config);
    show('store.config.nested.a', () => store.config.nested.a);
    show('store.config.n = 2 (strict mode)', () => {
      'use strict';
      store.config.n = 2;
      return store.config.n;
    });
    show('sync calls', () => calls);
  },
);

// Stage 1 finding 50.
await each(
  '50. Object.getOwnPropertyDescriptor(store, "child").value',
  (lib) => {
    const store = lib.create({child: {n: 0}});
    const value = Object.getOwnPropertyDescriptor(store, 'child')!.value;
    show('is the proxy the store hands out', () => value === store.child);
  },
);

// subscribeKey: what the callback gets, and whether a nested write calls it.
await each('subscribeKey on a key that holds an object', (lib) => {
  const store = lib.create({count: 0, user: {name: 'a'}});
  const got: unknown[] = [];
  if (lib.name === 'valtio')
    vu.subscribeKey(
      store,
      'user',
      (value) => got.push(value === store.user ? 'live proxy' : typeof value),
      true,
    );
  else
    cu.subscribeKey(
      store,
      'user',
      (value, previous) =>
        got.push(
          Object.isFrozen(value)
            ? `snapshot (previous: ${previous.name})`
            : typeof value,
        ),
      {sync: true},
    );
  store.user.name = 'b';
  show('after a nested write', () => got.splice(0));
  store.user = {name: 'c'};
  show('after replacing the object', () => got.splice(0));
});

// subscribeKey: cost of one notification in a store that also holds 1,000 rows.
await each(
  'subscribeKey(store, "count") beside 1,000 rows: cost of a write to a row',
  (lib) => {
    const rows = Array.from({length: 1_000}, (_, id) => ({id, done: false}));
    const time = (store: {rows: typeof rows}) => {
      for (let i = 0; i < 200; i++) store.rows[i].done = !store.rows[i].done;
      const start = performance.now();
      for (let i = 0; i < 2_000; i++)
        store.rows[i % 1_000].done = !store.rows[i % 1_000].done;
      return ((performance.now() - start) * 1e3) / 2_000;
    };
    const plain = lib.create({count: 0, rows: structuredClone(rows)});
    lib.subscribe(plain, () => {}, true);
    const keyed = lib.create({count: 0, rows: structuredClone(rows)});
    if (lib.name === 'valtio') vu.subscribeKey(keyed, 'count', () => {}, true);
    else cu.subscribeKey(keyed, 'count', () => {}, {sync: true});
    console.log(
      `  microseconds per write with a plain sync subscriber: ${time(plain).toFixed(2)}`,
    );
    console.log(
      `  microseconds per write with subscribeKey on "count": ${time(keyed).toFixed(2)}`,
    );
  },
);

// Cost of installing getters on every snapshot (ours only matters; Valtio installs none).
await each(
  'write one field, then snapshot: class with 0 getters and with 8 getters',
  (lib) => {
    class None {
      static [c.PROXYABLE] = true;
      n = 0;
    }
    class Eight {
      static [c.PROXYABLE] = true;
      n = 0;
      get a() {
        return this.n;
      }
      get b() {
        return this.n;
      }
      get c() {
        return this.n;
      }
      get d() {
        return this.n;
      }
      get e() {
        return this.n;
      }
      get f() {
        return this.n;
      }
      get g() {
        return this.n;
      }
      get h() {
        return this.n;
      }
    }
    for (const Kind of [None, Eight]) {
      const store = lib.create(new Kind());
      for (let i = 0; i < 5_000; i++) {
        store.n = i;
        lib.snapshot(store);
      }
      const start = performance.now();
      for (let i = 0; i < 200_000; i++) {
        store.n = i;
        lib.snapshot(store);
      }
      console.log(
        `  ${Kind.name}: ${(((performance.now() - start) * 1e6) / 200_000).toFixed(0)} ns per write + snapshot`,
      );
    }
  },
);

// How to tell a class from a method without calling it.
console.log(
  '\n## telling a class from other functions by its `prototype` property',
);
class K {}
const kinds: [string, unknown][] = [
  ['class', K],
  ['function declaration', function f() {}],
  ['arrow', () => {}],
  ['method', {m() {}}.m],
  ['async function', async () => {}],
  ['built-in Date', Date],
];
for (const [label, fn] of kinds) {
  const d = Object.getOwnPropertyDescriptor(fn as object, 'prototype');
  console.log(
    `  ${label}: prototype ${d ? (d.writable ? 'writable' : 'not writable') : 'absent'}`,
  );
}
void v;
```

Output:

```text

## 9. raw instance that is already a store, placed in another store
 [valtio]
  Inner: outer.inner === innerStore, outer calls, inner calls: [true,1,1]
  Plain: outer.inner === innerStore, outer calls, inner calls: [true,1,1]
 [classy]
  Inner: outer.inner === innerStore, outer calls, inner calls: [true,1,1]
  Plain: outer.inner === innerStore, outer calls, inner calls: [false,0,0]

## 46. Object.freeze(raw.config), then read and write through the store
 [valtio]
  store.config.nested.a: 1
  store.config.n = 2 (strict mode): THROWS TypeError: Proxy handler's 'set' on a non-configurable and non-writable property on 'target' should e
  sync calls: 1
 [classy]
  store.config.nested.a: THROWS TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the
  store.config.n = 2 (strict mode): THROWS TypeError: Proxy object's 'set' trap returned falsy value for property 'n'
  sync calls: 0

## 50. Object.getOwnPropertyDescriptor(store, "child").value
 [valtio]
  is the proxy the store hands out: true
 [classy]
  is the proxy the store hands out: false

## subscribeKey on a key that holds an object
 [valtio]
  after a nested write: []
  after replacing the object: ["live proxy"]
 [classy]
  after a nested write: ["snapshot (previous: a)"]
  after replacing the object: ["snapshot (previous: b)"]

## subscribeKey(store, "count") beside 1,000 rows: cost of a write to a row
 [valtio]
  microseconds per write with a plain sync subscriber: 0.57
  microseconds per write with subscribeKey on "count": 0.38
 [classy]
  microseconds per write with a plain sync subscriber: 1.00
  microseconds per write with subscribeKey on "count": 121.94

## write one field, then snapshot: class with 0 getters and with 8 getters
 [valtio]
  None: 339 ns per write + snapshot
  Eight: 338 ns per write + snapshot
 [classy]
  None: 672 ns per write + snapshot
  Eight: 1938 ns per write + snapshot

## telling a class from other functions by its `prototype` property
  class: prototype not writable
  function declaration: prototype writable
  arrow: prototype absent
  method: prototype absent
  async function: prototype absent
  built-in Date: prototype not writable
```

### Prototype A: proxy-compare as the `this` of a snapshot getter

```ts
// Prototype A: proxy-compare's createProxy(snapshot) as `this`, using the
// proxy-compare instance our library itself loads.
import {
  createProxy,
  isChanged,
} from '<repo>/packages/classy-store/src/storeRuntime.ts';
import {getUntracked} from '<repo>/node_modules/.bun/proxy-compare@3.0.1/node_modules/proxy-compare';
import {c} from './libs';

class Bag {
  static [c.PROXYABLE] = true;
  a = 1;
  b?: number = 2;
  rows = [{id: 1}, {id: 2}];
  child = new (class Row {
    static [c.PROXYABLE] = true;
    n = 1;
  })();
}
const store = c.createClassyStore(new Bag());
const snap = c.snapshot(store) as Bag;
const affected = new WeakMap<object, unknown>();
const tracked = createProxy(snap, affected) as Bag;
console.log(
  'same proxy-compare instance (the root is wrapped):',
  tracked !== snap,
);
console.log('A. proxy-compare createProxy(snapshot) as `this`');
console.log(
  '  Object.keys(this).length:',
  Object.keys(tracked).length,
  '(the snapshot has',
  Object.keys(snap).length,
  ')',
);
console.log('  "b" in this:', 'b' in tracked);
console.log('  this instanceof Bag:', tracked instanceof Bag);
const row = tracked.rows[0];
console.log(
  '  this.rows[0] is the snapshot row:',
  row === snap.rows[0],
  '| getUntracked finds it:',
  getUntracked(row) === snap.rows[0],
);
const open = tracked.rows.filter((r) => r.id > 0);
console.log(
  '  this.rows.filter(...)[0] is the snapshot row:',
  open[0] === snap.rows[0],
);
console.log(
  '  this.child is the snapshot child:',
  tracked.child === snap.child,
  '| getUntracked finds it:',
  getUntracked(tracked.child) === snap.child,
);
delete store.b;
const next = c.snapshot(store);
console.log(
  '  isChanged after delete store.b:',
  isChanged(snap, next, affected),
);
```

Output:

```text
same proxy-compare instance (the root is wrapped): true
A. proxy-compare createProxy(snapshot) as `this`
  Object.keys(this).length: 4 (the snapshot has 4 )
  "b" in this: true
  this instanceof Bag: true
  this.rows[0] is the snapshot row: false | getUntracked finds it: true
  this.rows.filter(...)[0] is the snapshot row: false
  this.child is the snapshot child: false | getUntracked finds it: false
  isChanged after delete store.b: true
```

### Prototypes B and C: hand-written trackers

```ts
// Prototypes B and C: two hand-written trackers for what a snapshot getter
// reads, tried on a real snapshot of ours. Prototype A is in the next file.
import {c} from './libs';

class Bag {
  static [c.PROXYABLE] = true;
  a = 1;
  b?: number = 2;
  rows = [{id: 1}, {id: 2}];
}
const store = c.createClassyStore(new Bag());
const snap = c.snapshot(store) as Bag;

const count = function (this: Bag) {
  return Object.keys(this).length;
};
const hasB = function (this: Bag) {
  return 'b' in this;
};
const isBag = function (this: Bag) {
  return this instanceof Bag;
};
const firstRow = function (this: Bag) {
  return this.rows[0];
};
const openRows = function (this: Bag) {
  return this.rows.filter((row) => row.id > 0);
};

console.log(
  'B. a Proxy over the frozen snapshot itself, with get, has and ownKeys traps',
);
{
  const reads: string[] = [];
  const tracked = new Proxy(snap, {
    get(target, prop) {
      reads.push(`get ${String(prop)}`);
      return Reflect.get(target, prop, target);
    },
    has(target, prop) {
      reads.push(`has ${String(prop)}`);
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      reads.push('ownKeys');
      return Reflect.ownKeys(target);
    },
  });
  console.log('  Object.keys(this).length:', count.call(tracked));
  console.log('  "b" in this:', hasB.call(tracked));
  console.log('  this instanceof Bag:', isBag.call(tracked));
  console.log(
    '  this.rows[0] is the snapshot row:',
    firstRow.call(tracked) === snap.rows[0],
  );
  console.log(
    '  this.rows.filter(...)[0] is the snapshot row:',
    openRows.call(tracked)[0] === snap.rows[0],
  );
  console.log('  recorded:', [...new Set(reads)].join(', '));
}

console.log('C. what we do today: a Proxy over {} with a get trap only');
{
  const tracked = new Proxy(
    {},
    {
      get(_t, prop) {
        return Reflect.get(snap, prop, snap);
      },
    },
  ) as Bag;
  console.log('  Object.keys(this).length:', count.call(tracked));
  console.log('  "b" in this:', hasB.call(tracked));
  console.log('  this instanceof Bag:', isBag.call(tracked));
}
```

Output:

```text
B. a Proxy over the frozen snapshot itself, with get, has and ownKeys traps
  Object.keys(this).length: 3
  "b" in this: true
  this instanceof Bag: true
  this.rows[0] is the snapshot row: true
  this.rows.filter(...)[0] is the snapshot row: true
  recorded: ownKeys, has b, get rows
C. what we do today: a Proxy over {} with a get trap only
  Object.keys(this).length: 0
  "b" in this: false
  this instanceof Bag: false
```

### `getUntracked` with the proxy-compare instance our library loads

```ts
import {createProxy} from '<repo>/packages/classy-store/src/storeRuntime.ts';
import {getUntracked} from '<repo>/node_modules/.bun/proxy-compare@3.0.1/node_modules/proxy-compare';
import {c} from './libs';
class Row {
  static [c.PROXYABLE] = true;
  n = 1;
}
const store = c.createClassyStore({
  plain: {n: 1},
  row: new Row(),
  selected: null as unknown,
});
const snap = c.snapshot(store) as {plain: object; row: object};
const tracked = createProxy(snap, new WeakMap()) as typeof snap;
console.log(
  'plain row: tracking proxy',
  tracked.plain !== snap.plain,
  '| getUntracked finds the snapshot',
  getUntracked(tracked.plain) === snap.plain,
);
console.log(
  'class row: tracking proxy',
  tracked.row !== snap.row,
  '| getUntracked finds the snapshot',
  getUntracked(tracked.row) === snap.row,
);
```

Output:

```text
plain row: tracking proxy true | getUntracked finds the snapshot true
class row: tracking proxy true | getUntracked finds the snapshot false
```

### Prototype: a lazy index for a frozen snapshot array

```ts
// A lookup index built lazily for a frozen snapshot array, which can never go stale.
import {c, cc} from './libs';
import {identityOf} from '<repo>/packages/classy-store/src/storeRuntime.ts';

const indexes = new WeakMap<readonly unknown[], Map<unknown, number>>();
function indexOfFrozen(backing: readonly unknown[], member: unknown): number {
  let index = indexes.get(backing);
  if (!index) {
    index = new Map();
    for (let i = 0; i < backing.length; i++) {
      const identity = identityOf(backing[i]);
      if (!index.has(identity)) index.set(identity, i);
    }
    indexes.set(backing, index);
  }
  return index.get(identityOf(member)) ?? -1;
}

for (const kind of ['numbers', 'objects'] as const) {
  const members = Array.from({length: 10_000}, (_, i) =>
    kind === 'numbers' ? i : {id: i},
  );
  const store = c.createClassyStore({set: cc.reactiveSet<unknown>(members)});
  const snap = c.snapshot(store) as {
    set: {has(v: unknown): boolean; _items: readonly unknown[]};
  };
  const wanted = Array.from({length: 1_000}, (_, i) => members[9_000 + i]);
  let start = performance.now();
  let hits = 0;
  for (const value of wanted) if (snap.set.has(value)) hits++;
  const today = performance.now() - start;
  start = performance.now();
  let hits2 = 0;
  for (const value of wanted)
    if (indexOfFrozen(snap.set._items, value) !== -1) hits2++;
  const indexed = performance.now() - start;
  console.log(
    `${kind}: 1,000 lookups in a snapshot of 10,000: today ${today.toFixed(2)} ms (${hits} hits), with a lazy index ${indexed.toFixed(2)} ms (${hits2} hits, index build included)`,
  );
}
```

Output:

```text
numbers: 1,000 lookups in a snapshot of 10,000: today 101.27 ms (1000 hits), with a lazy index 0.77 ms (1000 hits, index build included)
objects: 1,000 lookups in a snapshot of 10,000: today 250.96 ms (1000 hits), with a lazy index 0.84 ms (1000 hits, index build included)
```

### Micro-benchmark: reading a frozen array

```js
// Is reading a frozen array slower than reading an unfrozen one?
const make = () => Array.from({length: 10_000}, (_, i) => i);
const plain = make();
const frozen = Object.freeze(make());
const nonWritable = make();
for (let i = 0; i < nonWritable.length; i++)
  Object.defineProperty(nonWritable, i, {writable: false});
function scan(list, wanted) {
  for (let index = 0; index < list.length; index++)
    if (Object.is(list[index], wanted)) return index;
  return -1;
}
function time(label, list) {
  for (let i = 0; i < 200; i++) scan(list, 9_999); // warm up
  const start = performance.now();
  let sum = 0;
  for (let i = 0; i < 1_000; i++) sum += scan(list, 9_000 + (i % 1_000));
  const ms = performance.now() - start;
  console.log(
    `  ${label}: ${((ms * 1000) / 1_000).toFixed(1)} microseconds per scan`,
  );
  return sum;
}
time('plain array', plain);
time('frozen array', frozen);
time('non-writable elements, not frozen', nonWritable);
const objs = Object.freeze(
  Array.from({length: 10_000}, (_, i) => Object.freeze({id: i})),
);
const objsPlain = Array.from({length: 10_000}, (_, i) => ({id: i}));
function sumIds(list) {
  let s = 0;
  for (const row of list) s += row.id;
  return s;
}
for (const [label, list] of [
  ['for-of over plain rows', objsPlain],
  ['for-of over frozen rows', objs],
]) {
  for (let i = 0; i < 200; i++) sumIds(list);
  const start = performance.now();
  for (let i = 0; i < 1_000; i++) sumIds(list);
  console.log(
    `  ${label}: ${(((performance.now() - start) * 1000) / 1_000).toFixed(1)} microseconds per pass`,
  );
}
```

Output:

```text
Bun 1.4.4 (JavaScriptCore)
  plain array: 4.5 microseconds per scan
  frozen array: 140.8 microseconds per scan
  non-writable elements, not frozen: 146.6 microseconds per scan
  for-of over plain rows: 12.7 microseconds per pass
  for-of over frozen rows: 164.0 microseconds per pass
Node v24.21.0 (V8)
  plain array: 20.6 microseconds per scan
  frozen array: 56.1 microseconds per scan
  non-writable elements, not frozen: 238.0 microseconds per scan
  for-of over plain rows: 22.2 microseconds per pass
  for-of over frozen rows: 70.4 microseconds per pass
```

### Type check: tuples and collection snapshots

Run with `tsc` 7.0.2 in the scratch folder: exit code 0. A copy with one
more line, asserting that our `Snapshot<[string, number]>` is a tuple, fails
with `TS2344`, so the assertions are being checked.

```ts
import type {Snapshot as ValtioSnapshot} from 'valtio/vanilla';
import {proxyMap} from 'valtio/vanilla/utils';
import type {Snapshot as OurSnapshot} from '<repo>/packages/classy-store/src/types';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const yes = <T extends true>() => {};

// Stage 1 finding 14: a tuple.
yes<Equal<ValtioSnapshot<[string, number]>, readonly [string, number]>>();
yes<Equal<OurSnapshot<[string, number]>, readonly (string | number)[]>>();
yes<Equal<ValtioSnapshot<{id: number}[]>, readonly {readonly id: number}[]>>();

// Our type without its Array branch, as Valtio writes it.
type Leaf =
  | string
  | number
  | boolean
  | null
  | undefined
  | symbol
  | bigint
  | ((...args: never[]) => unknown)
  | Date;
type Without<T> = T extends Leaf
  ? T
  : T extends object
    ? {readonly [K in keyof T]: Without<T[K]>}
    : T;
yes<Equal<Without<[string, number]>, readonly [string, number]>>();
yes<Equal<Without<{id: number}[]>, readonly {readonly id: number}[]>>();

// Stage 1 finding 16: a snapshot of a collection has no mutators in its type.
const map = proxyMap<string, number>();
type MapSnapshot = ValtioSnapshot<typeof map>;
yes<Equal<'set' extends keyof MapSnapshot ? true : false, false>>();
yes<Equal<'get' extends keyof MapSnapshot ? true : false, true>>();
```

### The timing scripts

The output of `bench.ts` is the table under "Rough timings".

```ts
// A rough timing of the same operations on both libraries. One process, three
// rounds each, best round reported. Not the repository's benchmark.
import {libs, type Lib} from './libs';

let sink = 0;
function time(run: (i: number) => void, iterations: number): number {
  for (let i = 0; i < Math.min(iterations, 2_000); i++) run(i); // warm up
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) run(i);
    best = Math.min(best, ((performance.now() - start) * 1e6) / iterations);
  }
  return best;
}
const rows = (n: number) =>
  Array.from({length: n}, (_, id) => ({id, done: false, meta: {tags: {a: 1}}}));

const cases: [string, (lib: Lib) => number][] = [
  [
    'read a field',
    (lib) => {
      const s = lib.create({n: 1});
      return time(() => {
        sink += s.n;
      }, 2_000_000);
    },
  ],
  [
    'read a field three objects deep',
    (lib) => {
      const s = lib.create({a: {b: {c: {n: 1}}}});
      return time(() => {
        sink += s.a.b.c.n;
      }, 2_000_000);
    },
  ],
  [
    'write a field, no subscriber',
    (lib) => {
      const s = lib.create({n: 0});
      return time((i) => {
        s.n = i;
      }, 1_000_000);
    },
  ],
  [
    'write a field, one sync subscriber',
    (lib) => {
      const s = lib.create({n: 0});
      lib.subscribe(
        s,
        () => {
          sink++;
        },
        true,
      );
      return time((i) => {
        s.n = i;
      }, 1_000_000);
    },
  ],
  [
    'call a method that writes one field',
    (lib) => {
      class C {
        n = 0;
        set(v: number) {
          this.n = v;
        }
      }
      const s = lib.create(new C());
      return time((i) => {
        s.set(i);
      }, 1_000_000);
    },
  ],
  [
    'take a cached snapshot',
    (lib) => {
      const s = lib.create({n: 1, rows: rows(10)});
      lib.snapshot(s);
      return time(() => {
        sink += lib.snapshot(s).n;
      }, 2_000_000);
    },
  ],
  [
    'write one of 1,000 rows, then snapshot (unobserved)',
    (lib) => {
      const s = lib.create({rows: rows(1_000)});
      lib.snapshot(s);
      return time((i) => {
        s.rows[i % 1_000].done = !s.rows[i % 1_000].done;
        lib.snapshot(s);
      }, 2_000);
    },
  ],
  [
    'write one of 1,000 rows, then snapshot (observed)',
    (lib) => {
      const s = lib.create({rows: rows(1_000)});
      lib.subscribe(s, () => {}, true);
      lib.snapshot(s);
      return time((i) => {
        s.rows[i % 1_000].done = !s.rows[i % 1_000].done;
        lib.snapshot(s);
      }, 2_000);
    },
  ],
  [
    'write to another store, then snapshot an unchanged 1,000-row store',
    (lib) => {
      const s = lib.create({rows: rows(1_000)});
      const other = lib.create({n: 0});
      lib.snapshot(s);
      return time((i) => {
        other.n = i;
        lib.snapshot(s);
      }, 5_000);
    },
  ],
  [
    'create a store of 1,000 rows',
    (lib) =>
      time(() => {
        lib.create({rows: rows(1_000)});
      }, 200),
  ],
  [
    'create a store of 1,000 rows and snapshot it',
    (lib) =>
      time(() => {
        lib.snapshot(lib.create({rows: rows(1_000)}));
      }, 200),
  ],
  [
    'sort 1,000 rows, one sync subscriber that snapshots',
    (lib) => {
      const s = lib.create({rows: rows(1_000)});
      lib.subscribe(
        s,
        () => {
          lib.snapshot(s);
        },
        true,
      );
      return time((i) => {
        s.rows.sort((a, b) => (i % 2 ? a.id - b.id : b.id - a.id));
      }, 20);
    },
  ],
  [
    'read a getter that sums 1,000 rows, nothing changed',
    (lib) => {
      class C {
        rows = rows(1_000);
        get total() {
          let t = 0;
          for (const r of this.rows) t += r.id;
          return t;
        }
      }
      const s = lib.create(new C());
      return time(() => {
        sink += s.total;
      }, 2_000);
    },
  ],
];

const fmt = (ns: number) =>
  ns >= 1e6
    ? `${(ns / 1e6).toFixed(2)} ms`
    : ns >= 1e3
      ? `${(ns / 1e3).toFixed(1)} us`
      : `${ns.toFixed(1)} ns`;
console.log('| Operation | Valtio 2.3.2 | Ours |');
console.log('| --- | ---: | ---: |');
for (const [label, run] of cases) {
  const results = libs.map((lib) => run(lib));
  console.log(`| ${label} | ${fmt(results[0])} | ${fmt(results[1])} |`);
}
if (sink === -1) console.log(sink);
```

```ts
import {libs} from './libs';
const rows = (n: number) =>
  Array.from({length: n}, (_, id) => ({id, done: false, meta: {tags: {a: 1}}}));
for (const lib of libs) {
  const store = lib.create({rows: rows(1_000)});
  for (let i = 0; i < 200; i++) lib.subscribe(store, () => {}, true)();
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const start = performance.now();
    for (let i = 0; i < 2_000; i++) lib.subscribe(store, () => {}, true)();
    best = Math.min(best, ((performance.now() - start) * 1e6) / 2_000);
  }
  const keep = lib.subscribe(store, () => {}, true);
  let second = Infinity;
  for (let round = 0; round < 3; round++) {
    const start = performance.now();
    for (let i = 0; i < 200_000; i++) lib.subscribe(store, () => {}, true)();
    second = Math.min(second, ((performance.now() - start) * 1e6) / 200_000);
  }
  keep();
  console.log(
    `[${lib.name}] subscribe + unsubscribe on a 1,000-row store (3,002 nodes): only subscriber ${best.toFixed(0)} ns, second subscriber ${second.toFixed(0)} ns`,
  );
}
```

Output of `bench2.ts`:

```text
[valtio] subscribe + unsubscribe on a 1,000-row store (3,002 nodes): only subscriber 372823 ns, second subscriber 86 ns
[classy] subscribe + unsubscribe on a 1,000-row store (3,002 nodes): only subscriber 79 ns, second subscriber 63 ns
```
