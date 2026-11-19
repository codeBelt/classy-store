# Stage 2: Svelte 5 (`$state` proxy, `SvelteMap`, `SvelteSet`)

Stage 2 of the pre-1.0 review, 2026-11-19. Read-only: nothing in the
repository was changed apart from this file.

## Library, version and files read

- **Library:** `svelte`, from `https://github.com/sveltejs/svelte`.
- **Version:** 5.57.3, read from the copy installed in this repository at
  `node_modules/.bun/svelte@5.57.3/node_modules/svelte/src/`. Nothing was
  cloned, so there is no commit to record. The copy installed from npm in the
  scratch folder is identical (`diff -rq` of the two `src` folders reports no
  difference).
- **Files read**, under `src/`: `internal/client/proxy.js`,
  `reactivity/map.js`, `reactivity/set.js`, `internal/client/dev/equality.js`,
  `internal/shared/clone.js` and
  `compiler/phases/3-transform/client/visitors/ClassBody.js` whole;
  `internal/client/reactivity/sources.js` lines 1 to 300. Single functions
  were looked up in `internal/client/errors.js`, `internal/client/warnings.js`,
  `internal/client/dom/operations.js`, `internal/client/reactivity/batch.js`,
  `internal/client/reactivity/deriveds.js`, `reactivity/index-server.js`,
  `store/index-client.js` and two compiler visitors
  (`VariableDeclaration.js`, `BinaryExpression.js`).
- **Ours:** `core/core.ts`, `snapshot/snapshot.ts`,
  `collections/collections.ts`, `utils/internal/internal.ts`,
  `frameworks/svelte/svelte.ts`, and the first 60 and last 30 lines of
  `core/ownership.ts`.
- **Ported tests.** `$state` is compiler syntax. Each port is a `.svelte.js`
  module compiled with `compileModule` from `svelte/compiler`, then run on Bun
  1.4.4 with `--conditions browser --conditions development`, which selects
  Svelte's client build and its development checks. Every port was run a
  second time compiled and resolved for production. Nothing calls the internal
  `proxy()` directly; the compiled output does. Our side ran from the
  repository source imported by absolute path. Code and output are in the
  appendix.

Line numbers for Svelte refer to 5.57.3. Line numbers for ours refer to
`release/1.0` at `ac38f2f`.

## Summary

Svelte 5 makes state reactive in three unrelated ways. A plain object or array
given to `$state` is wrapped in a Proxy that keeps one signal per property. A
class is never wrapped: the compiler turns each `$state` field into a private
signal with a getter and a setter. Maps and sets are classes of their own that
extend the native ones. Set against ours, that gives eleven findings. The three
that matter most:

1. **A class instance is never put behind a proxy (finding 1).** That is why
   arrow-function methods and `#private` fields work in Svelte: `this` is
   always the real instance. We cannot copy the mechanism, which needs a
   compiler, but the idea carries over. A base class whose constructor returns
   the store makes arrow-function methods notify on our library as it is today
   (run, see the appendix). A `#private` field can never be state under
   snapshots, with any wrapping scheme, and the docs should say so. This
   answers API question 4.
2. **A `defineProperty` with a plain value is a write (finding 2).** Svelte
   treats it exactly like an assignment and refuses every other descriptor
   with a named error. Our trap handles freezing only. A 24-line spike that
   gives the trap the bookkeeping of `set` fixed the reproductions of stage 1
   findings 1, 45, 66 and 71, and it is what makes the base class in point 1
   produce a correct first snapshot.
3. **`SvelteMap` and `SvelteSet` are separate classes, as ours are, but they
   keep native storage (finding 8).** Svelte does not make a native `Map`
   reactive either, which supports keeping `reactiveMap` and `reactiveSet`
   (API question 5). The difference is cost and exactness: a lookup among
   10,000 entries took 17 nanoseconds there and 45 microseconds on ours, and
   theirs get `-0` right for free. Ours match a raw object, its proxy and its
   snapshot as one member, which theirs do not.

Svelte is not the better design for our purpose in most other respects. "Where
we already do better" lists eight cases where our behaviour is the one to
keep.

Six small changes to our source were tried in a throwaway copy: 66 lines
added and 24 removed across three files. Each fixed its reproduction. **The
repository's test suite was not run against the copy**, as the stage rules
require, so every one of them is a sketch for stage 3, not a tested change.

## How the two designs differ

This explains why some of Svelte's answers carry over and most cannot.

- **Svelte's proxy never writes to the object it wraps.** Each proxy holds a
  `Map` from property name to signal (`sources`, `proxy.js:58`). A signal is
  made the first time a property is read or written, and from then on the
  signal is the value. The `set` trap (`proxy.js:271-342`) contains no write
  to the target. After `state.n = 5` the raw object still says 0 (port 10). We
  write the target (`core.ts:432`) and keep an index of children beside it.
- **One raw object can have many proxies.** `proxy()` checks whether its
  argument is already a state proxy and otherwise makes a new one
  (`proxy.js:42-55`, `:118`). There is no map from raw object to proxy. We keep
  one node per raw object (`targetNodes`, `core.ts:14`, `:396`).
- **No ownership graph.** A proxy knows nothing about who holds it. A reader
  subscribes to the signals it read; nothing travels up to a root. So Svelte
  has nothing like our versions, parent links, suspend and resume. Stage 1
  findings 24, 28, 61, 66 to 69 and 72 have no counterpart.
- **A snapshot is a clone.** `$state.snapshot` (`snapshot`, `clone.js:21`)
  copies the whole value on every call. The copy is not frozen, shares nothing
  with the previous copy and is not cached.
- **Reads are tracked by whatever is running.** A signal read registers with
  the effect or derived value that is executing, whichever object owns the
  signal. Our live getter records reads on its own node only
  (`core.ts:91`).
- **A compiler is part of the library.** It rewrites `$state` fields in
  classes (`ClassBody.js:86-106`) and, in development, every `===` and `!==`
  (`BinaryExpression.js:11-21`).

## Findings

### 1. A class owns its reactivity; the instance is never wrapped

API questions 4 and 6. Stage 1 finding 9.

- **What they do.** `proxy()` returns its argument unchanged unless the
  prototype is exactly `Object.prototype` or `Array.prototype`
  (`proxy.js:51-55`). A class instance held in state is therefore stored as it
  is, and nothing about it is reactive. A class becomes reactive from the
  inside: the compiler replaces a field `n = $state(0)` with a private field
  holding a signal, plus a getter and a setter on the prototype that read and
  write it (`ClassBody`, `ClassBody.js:86-106`). In the compiled output of port
  2 the field reads `#n = $.state(0)`, with `get n()` and `set n(value)`
  beside it. Reactivity belongs to the instance, so `this` can be the raw
  instance everywhere.
- **What we do.** `createClassyStore(instance)` wraps the instance in a Proxy
  (`core.ts:405`, `:566`). A method found on the prototype is bound to the
  proxy and run as a transaction (`core.ts:483-491`), so `this.n++` reaches
  the `set` trap. An arrow-function field captured the raw instance when the
  constructor ran, so its writes go past the proxy. A `#private` field exists
  on the raw instance only, and a bound method runs with the proxy as `this`,
  so `this.#secret` throws. A nested class instance is wrapped only if its
  class sets `static [PROXYABLE] = true` (`canProxy`, `internal.ts:70-82`).
- **Difference in behaviour.** Port 2 and `ours.ts`, same class on both sides:

  | Case                                  | Svelte, class with `$state` fields                      | Ours, `createClassyStore(new Counter())`            |
  | ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
  | Prototype method writes a field       | Effect re-runs                                          | Notifies                                            |
  | Arrow-function field, called detached | Effect re-runs                                          | No notification; live `n` is 2, the snapshot says 1 |
  | Method that writes a `#private` field | Effect re-runs                                          | `TypeError`                                         |
  | Getter that reads a `#private` field  | Works                                                   | `TypeError`                                         |
  | Prototype method, called detached     | `TypeError`, `this` is `undefined`                      | Works, the method is bound                          |
  | Plain class instance held in state    | Not reactive, silently                                  | Not reactive, silently, unless `PROXYABLE`          |
  | Snapshot of the instance              | The same live instance, or a copy without its prototype | A frozen copy with its prototype and its getters    |

  The last row is the price Svelte pays. `Object.keys` of the instance is
  `["incArrow"]` and `JSON.stringify` gives `{}`, because the state sits in
  private fields. `$state.snapshot` cannot copy it: it returned the same
  instance with a `state_snapshot_uncloneable` warning for the class that has
  an arrow field, and a prototype-less `structuredClone` for the plain one.

  **An experiment on our library.** If the reason arrow functions work in
  Svelte is that `this` is the reactive object, the same can be had without a
  compiler: a base class whose constructor returns the store. JavaScript then
  runs the subclass's field initialisers with the store as `this`.

  ```ts
  class Store {
    constructor() {
      return createClassyStore(this);
    }
  }
  class Todos extends Store {
    items = [{id: 1}];
    filter = 'all';
    setFilter = (value: string) => {
      this.filter = value;
    };
  }
  const todos = new Todos();
  const {setFilter} = todos;
  setFilter('done'); // notifies; snapshot(todos).filter is 'done'
  ```

  Run on the unmodified source (`ours.ts`, last block): the detached arrow
  method notifies and the snapshot follows. A method that writes a `#private`
  field no longer throws, because the field is now installed on the store
  itself, but it notifies no one and a snapshot getter that reads the field
  still throws: the snapshot is a different object and cannot hold another
  class's private field. One defect showed: the first snapshot held the raw,
  unfrozen `items` array, because class fields arrive through the
  `defineProperty` trap, which does not index the new child. With the spike of
  finding 2 the first snapshot is frozen (`repro.ts`, last block).
- **Proposal: adapt.** Do not chase the mechanism. Offer the base class as an
  optional second way to make a store, and keep `createClassyStore(instance)`
  for classes the user does not own. Say in the docs that a `#private` field
  is never state: no proxy and no snapshot can read it from outside the class,
  and Svelte only gets away with it because it has no snapshot of a class
  instance. With the base class a private field becomes usable for things that
  are not state, such as a timer handle.
- **Kind:** API design.
- **Cost:** one new export of about six lines and its docs; `core.ts`
  unchanged apart from finding 2, which it depends on. Not breaking. Risk:
  subclass constructors then write through the proxy, which costs trap time
  per write, and the name and whether `useLocalStore` should accept such a
  class are open. The MobX report covers the other route (binding in the
  constructor); the two should be decided together.

### 2. A `defineProperty` with a plain value is a write

Stage 1 findings 1, 45, 61, 66 and 71.

- **What they do.** The `defineProperty` trap (`proxy.js:119-147`) accepts a
  descriptor only if it has a `value` and does not say `false` for
  `writable`, `enumerable` or `configurable`. It then does what `set` does: it
  writes the property's signal, wrapping an object value. Anything else throws
  `state_descriptors_fixed`. The comment in the source gives the reason: the
  proxy does not apply descriptors to its target, so it could not honour them
  without breaking a Proxy invariant. `setPrototypeOf` throws
  `state_prototype_fixed` (`proxy.js:361-363`).
- **What we do.** The trap forwards to the target and then handles one case, a
  property that became read-only, by detaching its child (`core.ts:502-513`).
  It does not resume a suspended subtree, index a new child, drop a stale
  child, or notify.
- **Difference in behaviour.** Port 6 against `repro.ts` on our source:

  | Call through the proxy                       | Svelte                                            | Ours today                                           |
  | -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
  | Define a new key with a full data descriptor | Readers of the key re-run                         | No notification; key missing from the next snapshot  |
  | Redefine a key that holds an object          | `state.child.n` is the new object's, readers told | `s.child.n` still reads the old object, snapshot too |
  | Redefine `rows[0]` as `7`                    | Live and snapshot both 7                          | Live and snapshot both still the old row             |
  | Define with `{value: 3}` only                | An ordinary writable, enumerable property         | Native: read-only, hidden, and not notified          |
  | Define an accessor, or `writable: false`     | Throws `state_descriptors_fixed`                  | Forwarded to the target                              |
  | `Object.freeze(proxy)`                       | Throws, and leaves the target non-extensible      | Works                                                |

  Svelte's trap has a gap of its own. After a new key is defined, an effect
  that read `Reflect.ownKeys(state)` is not told: the trap creates the signal
  but does not bump the object's key-set version, which `set` and
  `deleteProperty` do (`proxy.js:338`, `:156`, `:164`). Port 6 shows the
  effect's list without `b` while `Object.keys(state)` read afterwards has it.
  So the idea is worth taking and the code is not.

  **Spike.** In a throwaway copy the trap was given the bookkeeping of `set`:
  resume the scope first (the one-line change stage 1 proposed for finding
  66), forward to the target, link the value as a child or detach the old one,
  drop the cached bound method, and notify if the descriptor changed anything
  a snapshot shows. `linkChild` already refuses a read-only value, so the
  freeze case falls out of the same code. On `repro.ts`: a new key notifies
  once and is in the snapshot; the redefined child and row read correctly on
  both layers; the read of finding 66 returns 1 instead of never returning.
- **Proposal: adapt.** Take "a data descriptor is a write". Do not take the
  refusals: Svelte must refuse what it cannot store, and we store everything on
  the target, so accessors and read-only properties can keep working.
- **Kind:** bug.
- **Cost:** `core.ts` only, 24 lines added and 9 removed in the spike. Not
  breaking for correct code. Risk: `Object.freeze(store)` goes through this
  trap once per key, and the tests that pin findings 61 and 67 will change.
  Stage 1 measured the one-line part against the suite; the rest was run
  against the reproductions only.

### 3. A function is returned as it is

Stage 1 findings 5, 6, 42 and 62.

- **What they do.** `proxy()` returns anything that is not an object
  unchanged (`proxy.js:42-49`), and the `get` trap returns what the signal
  holds (`proxy.js:198-201`). No function is bound or wrapped, whether it is
  an array element, a class stored as data, or a method.
- **What we do.** Every function read through a store is wrapped by
  `transactional` (`core.ts:483-491`). An object property's wrapper is cached,
  an array element's is made anew on each read (`core.ts:486`).
- **Difference in behaviour.** Ports 1 and 3 against `ours.ts`:
  `state.callbacks[0] === first` is `true` and `indexOf(first)` is 0, so the
  splice removes the right callback. `state.Model.label` is `'model'` and
  `new state.Model() instanceof state.Model` is `true`; ours gives `undefined`
  and `false`. What Svelte loses is the binding: a prototype method taken off
  a class instance throws when called (port 2), where ours works.
- **Proposal: adapt**, as the Vue report's finding 4 already says: keep
  binding and transactions for methods, and stop wrapping array elements,
  classes and `constructor`. Svelte adds nothing to that proposal except a
  second library that does it and a reminder of what binding is worth.
- **Kind:** bug.
- **Cost:** see the Vue report. Nothing was spiked here.

### 4. `has`, `ownKeys`, and a property that does not exist

Stage 1 findings 30, 31, 32, 41 and 50. Bears on API question 3.

- **What they do.** The `has` trap (`proxy.js:234-269`) makes a signal for the
  key when it runs inside an effect or a derived value, including for a key
  that is absent, which gets a marker value. The `get` trap does the same for
  an absent key (`proxy.js:183-196`). `ownKeys` (`proxy.js:344-359`) reads one
  signal per object that stands for its set of keys; `set` bumps it only when
  the key is new (`proxy.js:324-339`) and `deleteProperty` only when a key
  goes. `getOwnPropertyDescriptor` (`proxy.js:206-232`) calls `has` and reads
  the key's signal, so it is tracked too.
- **What we do.** No `has`, `ownKeys` or `getOwnPropertyDescriptor` trap.
  A live getter records a property read as a value to compare later, and
  `areDepsValid` rejects that record whenever the property is absent
  (`core.ts:147`), so a getter that read a missing property never has valid
  dependencies.
- **Difference in behaviour.** Port 5, each reader in its own effect:

  | Write                | `Object.keys` reader | `Reflect.ownKeys` reader | `'b' in state` reader | `state.nope` reader |
  | -------------------- | -------------------- | ------------------------ | --------------------- | ------------------- |
  | `state.a = 1` (same) | No                   | No                       | No                    | No                  |
  | `state.a = 10`       | **Re-runs**          | No                       | No                    | No                  |
  | Delete a missing key | No                   | No                       | No                    | No                  |
  | `delete state.b`     | Re-runs              | Re-runs                  | Re-runs               | No                  |
  | `state.nope = 7`     | Re-runs              | Re-runs                  | No                    | Re-runs             |

  Two things stand out. `Object.keys` re-runs on a value change, because the
  engine asks for each key's descriptor to test enumerability and that trap
  reads the value's signal. `for...in` behaves the same. Vue avoids this by
  not trapping descriptors; its split between "a value changed" and "the set
  of keys changed" is the cleaner one. And a derived value that read a missing
  property is memoized: read twice, it ran once and returned the same object.
  On ours it ran twice and returned two objects (finding 32).

  A descriptor read gives the raw object before the property has been read
  and the proxy after (port 6, last lines). That is our finding 50 in half the
  cases, so Svelte is no model there.

  **Spike for finding 32.** The value record was given a `present` flag, and
  the check became "is it present as it was" instead of "is it present". On
  `repro2.ts` the getter then ran once for two reads, again when the property
  appeared and again when it was deleted. Seven lines.
- **Proposal: adopt** the split the Vue report proposes for `has` and
  `ownKeys`; Svelte confirms it and shows the trap not to add
  (`getOwnPropertyDescriptor` tracking). **Adopt** the `present` flag for
  finding 32 whatever is decided about the traps.
- **Kind:** bug.
- **Cost:** for the flag, `core.ts` and `core.types.ts`, 7 lines; not
  breaking; low risk. For the traps, see the Vue report, including what it
  found about enumerable snapshot getters.

### 5. Deleting a key that is not there

Stage 1 finding 29.

- **What they do.** `deleteProperty` (`proxy.js:149-168`) does nothing when
  the key has no signal and is not in the target. An assignment of the value a
  property already holds is dropped by the signal's equality check
  (`internal_set`, `sources.js:190`).
- **What we do.** `Reflect.deleteProperty` returns `true` for a key that is
  absent, and the trap then detaches, bumps versions and notifies
  (`core.ts:515-524`).
- **Difference in behaviour.** Port 5: no reader re-runs. `repro.ts` on ours:
  one notification and a new, equal snapshot.
- **Proposal: adopt.** Test `Object.hasOwn` before the delete and treat an
  absent key as no write. Spiked: no notification, the same snapshot object,
  and deleting a present key still notifies once.
- **Kind:** bug.
- **Cost:** `core.ts`, two lines. Changes behaviour only for code that relied
  on a no-op delete to force a notification. Low risk.

### 6. Searching an array for a raw object: Svelte warns, it does not fix

Stage 1 finding 7.

- **What they do.** Nothing in production: `state.list.includes(raw)` is
  `false` (port 4). In development `init_array_prototype_warnings`
  (`dev/equality.js:4-69`) replaces `Array.prototype.includes`, `indexOf` and
  `lastIndexOf` for every array on the page. When a search misses and the raw
  form of some element equals the argument, it prints
  `state_proxy_equality_mismatch`. It is installed when the first component
  mounts (`dom/operations.js:73`). The compiler also rewrites `===` and `!==`
  in development to a function that prints the same warning
  (`strict_equals`, `dev/equality.js:77-87`).
- **What we do.** The array's own methods run with the proxy as `this` and
  compare proxies with the raw argument (`core.ts:486`), so they miss. No
  warning.
- **Difference in behaviour.** The same wrong answer in both. Svelte names it
  in development.
- **Proposal: reject** Svelte's way, **adopt** Vue's. A library cannot patch
  `Array.prototype` for the whole page, and we have no compiler. The Vue
  report's finding on raw values and array search fixes the answer instead of
  describing it, and we already hold the piece that makes it possible: one
  node per raw object, and `identityOf` (`core.ts:52-56`).
- **Kind:** bug.
- **Cost:** see the Vue report.

### 7. Frozen objects

Stage 1 finding 46 and the rule "frozen objects are values".

- **What they do.** There is no frozen check in `proxy()`. A frozen plain
  object is wrapped like any other. Its properties are not writable, so the
  `get` trap makes no signal for them and returns the raw value
  (`proxy.js:183`, `:203`).
- **What we do.** A frozen object is kept by reference and never proxied
  (`isImmutableValue`, `core.ts:337-342`; `linkChild`, `core.ts:368`). A
  property that becomes read-only through the store releases its child
  (`core.ts:502-513`).
- **Difference in behaviour.** Port 7 against `ours.ts`:

  | Case                                              | Svelte                                                                          | Ours                              |
  | ------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
  | Frozen object in state                            | Wrapped; its nested objects come back raw                                       | Kept as it is                     |
  | Assign an existing key                            | `TypeError` from the engine's Proxy check                                       | `TypeError`, as on a frozen value |
  | Assign a new key                                  | Accepted and readable                                                           | `TypeError`                       |
  | `Object.keys` after that                          | `TypeError` from then on                                                        | Works                             |
  | `Object.freeze(proxy)`                            | Throws; target left non-extensible; `Object.keys` breaks after the next new key | Works; reads and keys still fine  |
  | Freeze the raw object after the property was read | `TypeError` on the next read                                                    | `TypeError` on the next read      |
  | Freeze the raw object before any read             | Raw value returned                                                              | `TypeError` on the next read      |

  Only the last two rows favour Svelte, and only because it makes signals
  lazily. Ours indexes children when the store is made (`core.ts:535-542`), so
  a later freeze behind its back always leaves a child proxy that the engine
  will not let the `get` trap return.

  **Spike for finding 46.** The `get` trap already has the property's own
  descriptor in hand (`core.ts:464`). If the property is read-only and a child
  proxy is indexed for it, the spike detaches the child and returns the raw
  value. On `repro2.ts` the read returns 1 instead of throwing.
- **Proposal: reject** Svelte's handling; our rule is the better one.
  **Consider** the nine-line guard for finding 46. It is free only while `get`
  looks the descriptor up on every read. If the per-prototype cache from the
  Solid report removes that lookup, the guard would have to pay for its own.
- **Kind:** bug.
- **Cost:** `core.ts`, 9 lines added and 3 removed. Not breaking. The
  performance interaction above is the risk.

### 8. `SvelteMap` and `SvelteSet` extend the native classes

API question 5. Stage 1 findings 12, 15, 16, 33 and 34.

- **What they do.** `SvelteMap extends Map` (`map.js:53`) and
  `SvelteSet extends Set` (`set.js:47`). The data lives in the native
  collection, reached with `super`. Beside it, in `#private` fields, sit one
  signal per key that has been asked about, one version signal and one size
  signal (`map.js:55-58`). Each reading method reads a signal and then calls
  `super` (`get`, `map.js:131-154`); each writing method calls `super` and
  then writes signals (`set`, `map.js:182-215`). Values are stored as given
  and not made reactive, which the class comment states. Set operations that
  build a new set return a new `SvelteSet` (`set.js:107-115`). On the server
  the two names are the native classes themselves
  (`reactivity/index-server.js:2-3`).
- **Why they are separate classes** (reasoning from the source, which does not
  say). First, `proxy()` only wraps plain objects and arrays, so a `Map` in
  state is never touched, and a Proxy could not intercept its internal slots
  anyway; a native `Map` in state is not reactive (port 8). Second, a class
  instance is never wrapped (finding 1), so a subclass can use `super`,
  `#private` fields and the real `this` freely. The explicit class is the
  opt-in. Third, extending the native class keeps everything a `Map` user
  expects: `instanceof Map`, insertion order, key equality, constant-time
  lookup, and the server alias.
- **What we do.** `ReactiveMap` and `ReactiveSet` are ordinary classes over a
  plain array (`_entries`, `collections.ts:54`; `_items`, `:209`), marked
  `PROXYABLE` so the store proxies the array. Lookups scan the array and
  compare by `identityOf` (`indexOfMember`, `collections.ts:16-33`). The array
  is what lets a collection be snapshotted, frozen and shared structurally
  like any other state. Our collections could not extend the native ones as
  the store stands: a method called through our proxy has the proxy as
  `this`, and `Map.prototype.get` rejects it.
- **Difference in behaviour.** Port 8 against `ours.ts`:

  | Case                                     | Svelte                          | Ours                                   |
  | ---------------------------------------- | ------------------------------- | -------------------------------------- |
  | `instanceof Map`                         | `true`                          | `false`                                |
  | Key set by raw object, read by its proxy | `undefined`: two different keys | Found; raw, proxy and snapshot are one |
  | `set(proxy, …)` after `set(raw, …)`      | Size 2                          | Size 1                                 |
  | Set built from `[raw, proxy]`            | Size 2, and `add` agrees        | Size 2, but `add` holds it once        |
  | `new Set([0])` then `add(-0)`            | Size 1, as native               | Size 2 (finding 33)                    |
  | A value's field changed in place         | Readers not told                | Readers told                           |
  | Snapshot                                 | A plain, mutable `Map` copy     | Frozen, shared, keeps the class        |
  | Internal storage visible on the instance | No: `Object.keys(map)` is empty | Yes: `_entries` is public              |
  | `get` of the last of 10,000 string keys  | 17 ns                           | 45 µs live, 346 µs on a snapshot       |

  The timings are one run of `lookup.ts` on Bun, on a machine that was doing
  other work: read them as orders of magnitude. Ours grows with the size (0.75
  µs at 100 entries, 6 µs at 1,000), theirs does not. Why our snapshot is
  slower than our live store was not looked into.
- **Proposal.**
  - **Reject** making native `Map` and `Set` reactive directly. Svelte does
    not do it either, and for us a native collection cannot be frozen or
    shared between snapshots.
  - **Keep** the array-backed classes and their identity rule; that rule is
    better than Svelte's.
  - **Adopt** native equality at the edges: `add(-0)` after `0` should be one
    member (finding 33), and the constructor should use the same identity as
    `add` (finding 34). Svelte is at least consistent between the two.
  - **Consider** an index from identity to position, kept beside the array,
    so that lookups stop scanning. This is a design task, not a patch: the
    index has to stay right when history or persist replace the array.
- **Kind:** API design for the first two, bug for the third, performance for
  the last.
- **Cost:** the equality fixes are a few lines in `collections.ts` and change
  the two cases stage 1 pinned. The index is new code in `collections.ts`
  with medium risk and needs the stage 1 benchmark to justify it. Nothing here
  was spiked.

### 9. A snapshot is a clone, and a cycle is not an error

Stage 1 findings 8, 10, 11, 13 and 25.

- **What they do.** `clone` (`clone.js:57-139`) walks the value through the
  proxy and copies arrays and plain objects, keeping a map from each object to
  its copy (`clone.js:59-60`, `:67`, `:86`). A second visit returns the copy
  already made, so shared references stay shared and a cycle closes on itself.
  `Map` and `Set` are copied one level deep, a `Date` is cloned, a class
  instance is copied through its `toJSON` if it has one and otherwise through
  `structuredClone`, and what cannot be cloned is returned as it is with a
  development warning.
- **What we do.** `createSnapshotRecursive` builds frozen copies keyed on the
  node's version and throws "circular reference detected in snapshot" when it
  meets a node it is still building (`snapshot.ts:246-250`).
- **Difference in behaviour.** Port 9: `state.self = state` works,
  `state.self.self.n` reads, a derived value that reads through the cycle
  re-runs only when what it read changes, and the snapshot has
  `snap.self === snap`. Ours accepts the write and then cannot produce a
  snapshot until the reference is removed. Port 10: because nothing is cached,
  an object changed while it was out of the state and then put back reads the
  same live and in the snapshot (2 and 2); ours gives 2 and 1 (finding 25).
  The same port shows what the clone model costs: the raw object and the state
  drift apart for good after the first write.

  **Spike for finding 8.** The set of nodes being built became a map from node
  to the unfinished snapshot, and meeting a node again returns that snapshot
  instead of throwing. Every member of a cycle owns every other, so a write to
  one bumps all their versions and they are rebuilt together. On `repro.ts`: a
  store that holds itself, a ring of two objects and a list that holds itself
  all snapshot, every node is frozen, a later write gives a new consistent
  snapshot, and an unrelated sibling is still shared.
- **Proposal: adapt, or refuse the cycle at the write.** The state today,
  where the write succeeds and the store can no longer be read, is the one
  outcome to remove. The spike shows the core can support cycles in 13 lines.
  What it does not show is the rest: `persist` and `devtools` serialise
  snapshots as JSON, `withHistory` copies them, and React's tracked reads
  compare them through `proxy-compare`. None of those was run with a cyclic
  snapshot. If they are not to be made cycle-safe, throwing from the `set`
  trap when a write closes a cycle is the honest alternative.
- **Kind:** bug, and API design for the choice.
- **Cost:** `snapshot.ts`, 13 lines added and 9 removed for the core. Not
  breaking: it turns an error into a result. Risk is in the four utilities
  named above.

### 10. A setter is one change, and getters are not memoized by default

Stage 1 findings 39, 40 and 43.

- **What they do.** An accessor on a plain state object is not a signal: the
  `get` trap falls through to `Reflect.get` with the proxy as receiver
  (`proxy.js:203`), so the getter body runs on every read and its reads are
  tracked by whoever called it. Memoization is something the author asks for,
  with a `$derived` field. A setter is called by the `set` trap
  (`proxy.js:317-322`) and its writes are ordinary writes; effects run later,
  in a microtask or at `flushSync` (`batch.js:846`, `:991`), so they see the
  end state.
- **What we do.** Every class getter is memoized on the live store
  (`evaluateComputed`, `core.ts:160-196`) and again on the snapshot. A setter
  is called with the proxy as `this` (`core.ts:414-418`) but outside any
  transaction, so each write inside it notifies sync subscribers on its own.
- **Difference in behaviour.** Port 12: the plain getter ran twice for two
  reads; the `$derived` field ran once and returned the same object. A setter
  that writes two fields gave the effect one run, which saw `"c d"`. On ours
  (`repro2.ts`) a sync subscriber saw `"c b"` and then `"c d"`. An object
  returned by a derived value is as unprotected as ours (finding 40): the
  reader changed it and the next read showed the change. In a snapshot of the
  plain object the getter's result is an own data property (API question 3).

  **Spike for finding 43.** The setter call was wrapped in the same
  transaction counter that methods use. The subscriber then saw `"c d"` once.
- **Proposal: adopt** the setter transaction. **Reject** opt-in memoization:
  automatic memoization of class getters is the point of our library, and
  Svelte's default costs a recomputation per read.
- **Kind:** bug.
- **Cost:** `core.ts`, 6 lines added and 1 removed. A subscriber that counted
  one notification per write inside a setter sees fewer. Low risk.

### 11. Diagnostics, and how the development build is separated

API question 8. Stage 1 findings 18, 19, 38 and 39.

- **What they do.** Every error and warning has a stable code. In development
  the message is the code, a sentence and a link; in production it is the link
  alone (`errors.js:436-446` is one example). The switch is the constant `DEV`
  from the `esm-env` package, which resolves through the `development` and
  `production` export conditions of `package.json`, not through
  `process.env.NODE_ENV`. What exists, with the build it runs in:

  | Code                            | When                                                          | Build              | Source                  |
  | ------------------------------- | ------------------------------------------------------------- | ------------------ | ----------------------- |
  | `state_unsafe_mutation`         | A derived value writes state while it computes                | Both, throws       | `sources.js:150-160`    |
  | `effect_update_depth_exceeded`  | Effects keep scheduling each other for more than 1,000 rounds | Both, throws       | `batch.js:361`, `:1047` |
  | `derived_references_self`       | A derived value reads itself                                  | Development only   | `deriveds.js:358-364`   |
  | `state_descriptors_fixed`       | A descriptor the proxy cannot store                           | Both, throws       | `proxy.js:119-131`      |
  | `state_prototype_fixed`         | `Object.setPrototypeOf` on state                              | Both, throws       | `proxy.js:361-363`      |
  | `state_proxy_equality_mismatch` | A proxy compared with its raw object                          | Development, warns | `dev/equality.js`       |
  | `state_snapshot_uncloneable`    | A snapshot kept something it could not copy                   | Development, warns | `clone.js:21-45`        |

- **What we do.** One build. A getter that writes re-runs and notifies on
  every read (finding 39). A sync subscriber that writes recurses until the
  stack overflows, and a batched one loops without bound (`deliver`,
  `core.ts:314-328`, has no counter; findings 18 and 19). A getter cycle is
  caught on the live store (`core.ts:171-184`) and overflows the stack on a
  snapshot (finding 38).
- **Difference in behaviour.** Port 11, both builds. The derived value that
  writes throws in both. The effect that writes what it reads is stopped with
  the named error in both, after the state reached 1,001. The two derived
  values that read each other throw the named error in development and a
  `RangeError: Maximum call stack size exceeded` in production, which is our
  finding 38 exactly: Svelte chose to pay for that check in development only.
- **Proposal.**
  - **Adopt** a bound on subscriber delivery with a named error, in every
    build. It is one counter. It turns findings 18 and 19 from a stack
    overflow and a hung event loop into a message.
  - **Adopt** an error for a write made while a getter is being computed. The
    live store knows it is inside a getter (`trackerStack`, `core.ts:65`), so
    the test is one length check in `set` and `deleteProperty`. It makes the
    two layers agree: a snapshot getter cannot write at all.
  - **Adopt** stable codes in messages. Ours already start with the package
    name; a code after it costs nothing and gives the docs something to link.
  - **Consider** export conditions for a development build, as Svelte and
    Solid do, if stage 3 wants checks that are too slow for production.
    Everything proposed above is cheap enough not to need it.
  - **Reject** the equality warning; finding 6 fixes the cause.
- **Kind:** diagnostics.
- **Cost:** a counter in `deliver` and one check in two traps, `core.ts`
  only. The getter-write error is breaking for a getter that fills a cache
  field on first read. None of this was spiked; it is reasoning from our
  source and from what port 11 showed of Svelte.

## Where we already do better

Each of these was run. Keep our behaviour.

- **One object, one proxy.** In Svelte the same raw object placed in two
  fields gets two proxies with separate signals: after `two.a.id = 5`,
  `two.b.id` is still 1 and so is the raw object (port 1). Ours gives one
  proxy, and all three agree on 5.
- **The raw object stays current.** We write the target, so the class instance
  the user made holds the state. In Svelte the raw object keeps its first
  values for good (port 10).
- **Frozen values and frozen stores** (finding 7).
- **Collections match by identity** across raw object, proxy and snapshot
  (finding 8).
- **Snapshots of class instances** keep the prototype and the getters, are
  frozen and are shared structurally. Svelte returns the live instance or a
  prototype-less clone (finding 1).
- **Methods are bound.** A method taken off a store still works. In Svelte it
  throws (port 2).
- **Getters are memoized without being asked** (finding 10). A Svelte derived
  value read outside an effect also loses its memoization once a dependency
  has changed without changing its result: three reads ran it three times
  (`probes/x-probe.svelte.js`, not in the appendix).
- **Objects without a prototype are state.** Svelte leaves
  `Object.create(null)` unwrapped (port 1); we proxy it
  (`isPlainObject`, `internal.ts:59`).

## Stage 1 findings with a counterpart in Svelte 5

"Port n" means the behaviour was run; "read" means it follows from the source
and was not run.

| Stage 1 finding                                                       | What Svelte 5 does                                                                                                       | Evidence   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1. `defineProperty` is silent                                         | A plain data descriptor is a write and wakes readers of the key. Readers of the key list are not told about a new key.   | Port 6     |
| 5. Function in an array is a new wrapper per read                     | Returned as it is; `indexOf` finds it                                                                                    | Port 3     |
| 6. Class held in a store is a bound wrapper                           | Returned as it is; statics and `instanceof` work                                                                         | Port 1     |
| 7. `includes(raw)` misses                                             | Misses too. Development build warns `state_proxy_equality_mismatch`                                                      | Port 4     |
| 8. Self-reference can be written, not read                            | Works; the snapshot keeps the cycle                                                                                      | Port 9     |
| 9. Store placed by its raw object is not connected                    | A class instance has no separate raw form. A plain object placed twice gets two independent proxies, which is worse      | Ports 1, 2 |
| 10. Raw objects end up holding proxies                                | The target is never written; proxies live in signals                                                                     | Port 10    |
| 11. Raw write invisible until the next proxied write                  | Invisible for good once the property has been read or written; visible before that. Live state and snapshot always agree | Port 10    |
| 12. Native `Set` or `Map` holds raw members                           | The same: native collections are opaque, and `SvelteSet` holds what it was given                                         | Port 8     |
| 13. Getter on a self-referring store recomputes on every write        | A derived value re-runs only for what it read                                                                            | Port 9     |
| 15. Backing arrays are public                                         | Signals sit in `#private` fields; the instance has no own keys                                                           | Port 8     |
| 16. Snapshot of a collection keeps mutators in the type               | The snapshot is a plain mutable `Map` or `Set`                                                                           | Port 8     |
| 18, 19. A subscriber that writes loops without bound                  | Stopped after 1,000 rounds with `effect_update_depth_exceeded`                                                           | Port 11    |
| 25. Raw object changed while detached shows old content               | No cache, so live and snapshot agree                                                                                     | Port 10    |
| 29. Deleting a missing key counts as a write                          | No effect                                                                                                                | Port 5     |
| 30. Getter over `Object.keys` or `in` goes stale                      | Tracked. `Object.keys` also re-runs on value changes                                                                     | Port 5     |
| 32. Getter over a missing property recomputes every read              | A signal is made for the missing key; memoized                                                                           | Port 5     |
| 33. `+0` and `-0` are two members when added                          | One member both ways, as native                                                                                          | Port 8     |
| 34. One object in two forms held twice when constructed               | Held twice when constructed and when added: consistent, not unified                                                      | Port 8     |
| 36. Getter misses reads outside its own node                          | Any signal read while computing is a dependency, whoever owns it                                                         | Read       |
| 38. Getter cycle overflows the stack on a snapshot                    | Named error in development; the same stack overflow in production                                                        | Port 11    |
| 39. A getter that writes                                              | Throws `state_unsafe_mutation` in both builds                                                                            | Port 11    |
| 40. Object returned by a getter is not protected                      | The same                                                                                                                 | Port 12    |
| 42. `constructor` is a bound wrapper                                  | Functions are never wrapped                                                                                              | Port 1     |
| 43. A setter is not a transaction                                     | Effects are batched, so they see the end state                                                                           | Port 12    |
| 45. Redefining a property leaves the old object in place              | The new value is read and readers are told                                                                               | Port 6     |
| 46. Freezing a raw object behind the store makes reads throw          | The same `TypeError` if the property was read before; raw value if not                                                   | Port 7     |
| 47. Cached getter survives a prototype change                         | `Object.setPrototypeOf` throws `state_prototype_fixed`                                                                   | Port 6     |
| 48. `Object.assign` with a parsed `__proto__` key swaps the prototype | Ignored: the `set` trap makes no signal for an inherited accessor and never writes the target                            | Port 6     |
| 50. A descriptor's value is the raw object                            | Raw before the property's first read, the proxy after                                                                    | Port 6     |
| 62. A store made from a function                                      | Functions are never proxied                                                                                              | Read       |
| 63. Typed-array store                                                 | Not wrapped: its prototype is not `Array.prototype`                                                                      | Read       |
| 71. Array element redefined disagrees between store and snapshot      | They agree                                                                                                               | Port 6     |

No counterpart: findings 2 to 4, 14, 17, 20 to 24, 26 to 28, 31, 35, 37, 41,
44, 49, 51 to 61, 64 to 70, 72 and 73. They concern our snapshot cache, our
ownership graph, our subscriber delivery, or utilities Svelte does not have.

## The eight API questions

1. **Should synchronous notification be the default for `subscribe()`?** No.
   Svelte batches: two writes gave one effect run, after a microtask or an
   explicit `flushSync()` (`batch.js:846`, `:991`; port 2's counters move only
   at `flushSync`). Derived values are pulled, so they are current whenever
   read. Synchronous delivery is the exception one asks for. Our Svelte
   adapter asks for it because the store contract requires it
   (`svelte.ts:33`); that is the adapter's business, not the default's.
2. **Writes outside a store method: allowed, warned about, or grouped? Does
   `batch()` belong in the API?** Allowed anywhere and grouped automatically,
   with no warning and no `batch` function. The one forbidden place is inside
   a derived value (`state_unsafe_mutation`). From this point of view
   `batch()` exists in ours only because framework bindings are synchronous;
   it is the right tool while that holds and would be unnecessary if delivery
   to bindings were deferred.
3. **Should snapshot getters stay enumerable own accessors?** Svelte has two
   answers. On a plain state object a getter's result becomes an enumerable
   own data property of the snapshot (port 12). On a class, derived fields are
   prototype accessors, not enumerable, and do not appear in `Object.keys` or
   JSON at all unless the class writes a `toJSON` (port 2). Neither is an
   enumerable accessor. The class answer matches the Vue report's finding
   that enumerable getters and key tracking get in each other's way.
4. **Can arrow-function methods and `#private` fields be made to work?**
   Svelte: yes to both, by never putting a proxy around the instance, which
   needs its compiler. For us (finding 1): arrow-function methods work today
   with a base class whose constructor returns the store. `#private` fields
   stop throwing with that base class but cannot be state, because a snapshot
   cannot copy them.
5. **Should native `Map` and `Set` be reactive directly?** No. Svelte leaves
   them alone and ships `SvelteMap` and `SvelteSet`, separate classes that
   extend the native ones (finding 8). Explicit reactive collection classes
   are the shared answer; how they are built differs.
6. **Opt-in or opt-out for nested class instances?** Opt-in, more strictly
   than ours. Nothing but a plain object or array is ever wrapped
   (`proxy.js:51-55`), and there is no flag to change that: a class opts in by
   declaring reactive fields. Because class instances are raw by default there
   is no `markRaw`. The opt-out for plain data is at the declaration,
   `$state.raw`, which the compiler leaves unwrapped
   (`VariableDeclaration.js:139-142`); our equivalent is a frozen value. This
   supports `PROXYABLE` as opt-in.
7. **Are entry points, export names and adapter names consistent?** No
   position on the five frameworks. On naming only: Svelte's own conversion
   functions are `toStore` and `fromStore` in `svelte/store`
   (`store/index-client.js:47`, `:128`), and its reactive classes carry the
   framework's name as a prefix. Our `toSvelteStore` reads naturally beside
   those. The adapters report covers the rest.
8. **What development-only diagnostics would catch our silent failures?**
   Finding 11. Svelte has no check for our two named failures, arrow-function
   methods and writes after an `await`, because neither can happen there. What
   it does have, and we lack, is a bound on notification loops, an error for a
   write inside a computed value, and stable codes.

## Verified by running, and only read

**Run** (ports compiled by Svelte's compiler, on Bun 1.4.4, development and
production builds; our side from the repository source at `ac38f2f`):

- Everything in the difference tables of findings 1 to 10, the port 11 rows
  of finding 11, every row of the stage 1 table marked "Port", and every item
  under "Where we already do better".
- The base-class experiment of finding 1, on the unmodified source and on the
  spike.
- Six spike patches, each against its reproduction only: `defineProperty` as
  a write, delete of a missing key, cyclic snapshots, the `present` flag, the
  setter transaction, and the read-only guard in `get`. Their difference
  against the repository source is in the appendix.
- The read that never returns (stage 1 finding 66) was reproduced on the
  unmodified source: the script was killed by `timeout 8` at that read.
- Lookup timings, once, on a busy machine.

**Only read, not run:**

- Why `SvelteMap` and `SvelteSet` are separate classes. The source does not
  state a reason; the three given in finding 8 are inferences from it.
- The server build (`reactivity/index-server.js`). All ports ran the client
  build.
- That any signal read registers with the running effect or derived value,
  whoever owns it (stage 1 table, finding 36). The runtime's `get` was not
  read; the ports only show it for nested state.
- Typed arrays and stores made from functions in Svelte (stage 1 table,
  findings 62 and 63).
- The proposals of finding 11. No loop bound or getter-write error was
  spiked.
- The index proposed in finding 8.

**Not done:**

- The repository's test suite was not run against the spike, by the stage
  rules. A spike patch that passes its reproduction may still break a pinned
  test; findings 2 and 9 say where that is most likely.
- Cyclic snapshots were not tried with `persist`, `devtools`, `withHistory`
  or React's tracked reads.
- The development warnings of port 4 were installed by calling Svelte's
  internal function by hand, because there is no DOM in the scratch run. In a
  browser the first mounted component installs them.
- Svelte's effect ordering, teardown and late-subscriber behaviour (stage 1
  findings 20 to 24) were not ported; they belong to a different model.

## Appendix: ported tests and their output

All files are in the scratch folder
`<scratch>/stage-2-svelte/`.
Each port is compiled by `build.mjs` and run by `run.sh`, both shown at the
end. In the development build the compiler rewrites `===`, so a port that
compares a proxy with its raw object on purpose prints
`state_proxy_equality_mismatch`; those warnings are shortened to one line
below.

### Port 1: which values are wrapped

`ports/p01-wrapping.svelte.js`:

```js
// Which values does $state wrap? Stage 1 findings 6, 42, 62; API question 6.
import {attempt} from '../helpers.js';

class Model {
  static label = 'model';
  n = 0;
}
const raws = {
  plain: {a: 1},
  array: [1],
  nullProto: Object.assign(Object.create(null), {a: 1}),
  instance: new Model(),
  frozen: Object.freeze({nested: {a: 1}}),
  date: new Date(0),
  map: new Map(),
  fn: () => 1,
  Model,
};
const state = $state({...raws});

for (const key of Object.keys(raws)) {
  console.log(
    `${key}: ${state[key] === raws[key] ? 'kept as it is' : 'wrapped'}`,
  );
}
console.log(
  'frozen.nested:',
  state.frozen.nested === raws.frozen.nested ? 'kept as it is' : 'wrapped',
);
console.log('function read twice is the same:', state.fn === state.fn);
attempt('state.Model.label', () => state.Model.label);
attempt(
  'new state.Model() instanceof state.Model',
  () => new state.Model() instanceof state.Model,
);
attempt(
  'state.instance.constructor === Model',
  () => state.instance.constructor === Model,
);

// One raw object in two places.
const shared = {id: 1};
const two = $state({a: shared, b: shared});
console.log('two.a === two.b:', two.a === two.b);
two.a.id = 5;
console.log(
  'after two.a.id = 5: two.b.id =',
  two.b.id,
  ', shared.id =',
  shared.id,
);
```

Output, development build:

```text
[svelte] state_proxy_equality_mismatch   (console.warn, two more lines of text left out)
plain: wrapped
array: wrapped
nullProto: kept as it is
instance: kept as it is
[svelte] state_proxy_equality_mismatch   (console.warn, two more lines of text left out)
frozen: wrapped
date: kept as it is
map: kept as it is
fn: kept as it is
Model: kept as it is
frozen.nested: kept as it is
function read twice is the same: true
state.Model.label -> model
new state.Model() instanceof state.Model -> true
state.instance.constructor === Model -> true
[svelte] state_proxy_equality_mismatch   (console.warn, two more lines of text left out)
two.a === two.b: false
after two.a.id = 5: two.b.id = 1 , shared.id = 1
```

### Port 2: a class instance in state, and a class with `$state` fields

`ports/p02-classes.svelte.js`:

```js
// A class instance held in state, and a class with $state fields.
// Stage 1 finding 9; API questions 4 and 6.
import {flushSync} from 'svelte';
import {attempt, warnings} from '../helpers.js';

class Plain {
  n = 0;
  inc() {
    this.n++;
  }
}

class Runes {
  n = $state(0);
  #secret = $state(1);
  items = $state([]);
  doubled = $derived(this.n * 2);
  inc() {
    this.n++;
  }
  incArrow = () => {
    this.n++;
  };
  bumpSecret() {
    this.#secret++;
  }
  get secret() {
    return this.#secret;
  }
}

const state = $state({plain: new Plain(), runes: new Runes()});
const runs = {plain: 0, n: 0, secret: 0, items: 0};
const stop = $effect.root(() => {
  $effect(() => (state.plain.n, runs.plain++));
  $effect(() => (state.runes.n, runs.n++));
  $effect(() => (state.runes.secret, runs.secret++));
  $effect(() => (state.runes.items.length, runs.items++));
});
flushSync();
const show = (label) => {
  flushSync();
  console.log(label, JSON.stringify(runs));
};
show('initial                  ');
state.plain.inc();
show('plain.inc()              ');
console.log('  plain.n is now', state.plain.n);
state.runes.inc();
show('runes.inc()              ');
const {incArrow, inc} = state.runes;
incArrow();
show('detached arrow incArrow()');
attempt('detached prototype method inc()', () => inc());
state.runes.bumpSecret();
show('runes.bumpSecret() (#priv)');
state.runes.items.push({x: 1});
show('runes.items.push()       ');
console.log('doubled:', state.runes.doubled, ' n:', state.runes.n);
console.log('Object.keys(runes):', JSON.stringify(Object.keys(state.runes)));
console.log('JSON.stringify(runes):', JSON.stringify(state.runes));
let snap;
const warned = warnings(() => {
  snap = $state.snapshot(state);
});
console.log(
  'snapshot keeps the same instance:',
  snap.runes === state.runes,
  snap.plain === state.plain,
);
console.log('snapshot warnings:', JSON.stringify(warned));
stop();
```

Output, development build:

```text
initial                   {"plain":1,"n":1,"secret":1,"items":1}
plain.inc()               {"plain":1,"n":1,"secret":1,"items":1}
  plain.n is now 1
runes.inc()               {"plain":1,"n":2,"secret":1,"items":1}
detached arrow incArrow() {"plain":1,"n":3,"secret":1,"items":1}
detached prototype method inc() THROWS TypeError: undefined is not an object (evaluating 'this.n')
runes.bumpSecret() (#priv) {"plain":1,"n":3,"secret":2,"items":1}
runes.items.push()        {"plain":1,"n":3,"secret":2,"items":2}
doubled: 4  n: 2
Object.keys(runes): ["incArrow"]
JSON.stringify(runes): {}
snapshot keeps the same instance: true false
snapshot warnings: ["state_snapshot_uncloneable"]
```

Lines that differ in the production build:

```text
snapshot warnings: []
```

### Port 3: a function held in an array

`ports/p03-functions.svelte.js`:

```js
// A function held in an array, read twice. Stage 1 finding 5.
const first = () => 'first';
const second = () => 'second';
const state = $state({callbacks: [first, second]});

console.log(
  'callbacks[0] === callbacks[0]:',
  state.callbacks[0] === state.callbacks[0],
);
console.log('callbacks[0] === first:', state.callbacks[0] === first);
console.log('indexOf(first):', state.callbacks.indexOf(first));
state.callbacks.splice(state.callbacks.indexOf(first), 1);
console.log(
  'after removing first, what is left:',
  state.callbacks.map((f) => f()).join(','),
);
```

Output, development build:

```text
callbacks[0] === callbacks[0]: true
callbacks[0] === first: true
indexOf(first): 0
after removing first, what is left: second
```

### Port 4: `list.includes(raw)`

`ports/p04-includes.svelte.js`:

```js
// list.includes(raw), indexOf, lastIndexOf. Stage 1 finding 7.
import {warnings} from '../helpers.js';
// In a browser, init_operations() installs these the first time a component
// mounts, in development only (dom/operations.js:73). There is no DOM here,
// so the same function is called by hand.
import {init_array_prototype_warnings} from '../node_modules/svelte/src/internal/client/dev/equality.js';

const raw = {id: 1};
const state = $state({list: [raw]});

console.log('list[0] === raw:', state.list[0] === raw);
console.log('includes(raw):', state.list.includes(raw));
console.log('indexOf(raw):', state.list.indexOf(raw));
console.log('lastIndexOf(raw):', state.list.lastIndexOf(raw));
console.log('includes(list[0]):', state.list.includes(state.list[0]));
console.log(
  'find by field:',
  state.list.findIndex((row) => row.id === raw.id),
);

init_array_prototype_warnings();
const seen = warnings(() => {
  state.list.includes(raw);
  state.list.indexOf(raw);
  state.list.includes(state.list[0]);
});
console.log('warnings once the dev patch is installed:', JSON.stringify(seen));
```

Output, development build:

```text
[svelte] state_proxy_equality_mismatch   (console.warn, two more lines of text left out)
list[0] === raw: false
includes(raw): false
indexOf(raw): -1
lastIndexOf(raw): -1
includes(list[0]): true
find by field: 0
warnings once the dev patch is installed: ["state_proxy_equality_mismatch","state_proxy_equality_mismatch"]
```

### Port 5: `Object.keys(state)`, `'key' in state` and a missing property

`ports/p05-keys.svelte.js`:

```js
// A reader of Object.keys(state), of 'key' in state, and of a property that
// does not exist. Stage 1 findings 29 to 32.
import {flushSync} from 'svelte';

const state = $state({a: 1, b: 2});
const runs = {keys: 0, ownKeys: 0, has: 0, missing: 0};
const seen = {};
const stop = $effect.root(() => {
  $effect(() => (runs.keys++, (seen.keys = Object.keys(state).length)));
  $effect(() => (runs.ownKeys++, Reflect.ownKeys(state)));
  $effect(() => (runs.has++, (seen.hasB = 'b' in state)));
  $effect(() => (runs.missing++, (seen.nope = state.nope)));
});
const show = (label) => {
  flushSync();
  console.log(label, JSON.stringify(seen), 'runs', JSON.stringify(runs));
};
show('initial             ');
state.a = 1;
show('state.a = 1 (same)  ');
state.a = 10;
show('state.a = 10        ');
delete state.missingKey;
show('delete a missing key');
delete state.b;
show('delete state.b      ');
state.nope = 7;
show('state.nope = 7      ');
stop();

// Finding 32: a derived value that reads a missing property keeps its result.
let derivedRuns = 0;
const missing = $derived.by(() => (derivedRuns++, {value: state.gone}));
console.log(
  'derived over a missing property, read twice: same object',
  missing === missing,
  ', runs',
  derivedRuns,
);
```

Output, development build:

```text
initial              {"keys":2,"hasB":true} runs {"keys":1,"ownKeys":1,"has":1,"missing":1}
state.a = 1 (same)   {"keys":2,"hasB":true} runs {"keys":1,"ownKeys":1,"has":1,"missing":1}
state.a = 10         {"keys":2,"hasB":true} runs {"keys":2,"ownKeys":1,"has":1,"missing":1}
delete a missing key {"keys":2,"hasB":true} runs {"keys":2,"ownKeys":1,"has":1,"missing":1}
delete state.b       {"keys":1,"hasB":false} runs {"keys":3,"ownKeys":2,"has":2,"missing":1}
state.nope = 7       {"keys":2,"hasB":false,"nope":7} runs {"keys":4,"ownKeys":3,"has":2,"missing":2}
derived over a missing property, read twice: same object true , runs 1
```

### Port 6: `Object.defineProperty`, `Object.freeze` and the prototype

`ports/p06-define.svelte.js`:

```js
// Object.defineProperty, Object.freeze and prototype changes through the
// proxy. Stage 1 findings 1, 45, 47, 48, 50, 71.
import {flushSync} from 'svelte';
import {attempt} from '../helpers.js';

const basic = (value) => ({
  value,
  writable: true,
  enumerable: true,
  configurable: true,
});
const other = {n: 99};
const state = $state({a: 1, child: {n: 1}, rows: [{id: 1}]});
const seen = {};
const stop = $effect.root(() => {
  $effect(() => void (seen.keys = Reflect.ownKeys(state).join(',')));
  $effect(() => void (seen.childN = state.child.n));
  $effect(() => void (seen.b = state.b));
});
const show = (label) => {
  flushSync();
  console.log(label, JSON.stringify(seen));
};
show('initial                          ');
Object.defineProperty(state, 'b', basic(2));
show('define a new key b               ');
console.log('  Object.keys(state) read now:', Object.keys(state).join(','));
Object.defineProperty(state, 'child', basic(other));
show('redefine child as another object ');
Object.defineProperty(state.rows, 0, basic(7));
console.log(
  'redefine rows[0] as 7: live',
  state.rows[0],
  ', snapshot',
  JSON.stringify($state.snapshot(state.rows)),
);
stop();

attempt('define with {value: 3} only', () => {
  Object.defineProperty(state, 'c', {value: 3});
  state.c = 4;
  return `c = ${state.c}, enumerable = ${Object.keys(state).includes('c')}`;
});
attempt('define an accessor', () =>
  Object.defineProperty(state, 'd', {
    get: () => 1,
    configurable: true,
    enumerable: true,
  }),
);
attempt('define a read-only value', () =>
  Object.defineProperty(state, 'e', {
    value: 1,
    writable: false,
    enumerable: true,
    configurable: true,
  }),
);
attempt('Object.setPrototypeOf(state, {})', () =>
  Object.setPrototypeOf(state, {}),
);

const untouched = $state({a: 1});
attempt('Object.freeze(state), no key added before', () =>
  Object.freeze(untouched),
);
attempt('  then a read', () => untouched.a);
attempt('  then untouched.z = 1', () => ((untouched.z = 1), untouched.z));
attempt('  then Object.keys', () => Object.keys(untouched).join(','));

const target = $state({a: 1});
Object.assign(target, JSON.parse('{"__proto__": {"polluted": true}, "a": 2}'));
console.log(
  'assign a parsed __proto__ key: polluted =',
  target.polluted,
  ', a =',
  target.a,
  ', prototype unchanged =',
  Object.getPrototypeOf(target) === Object.prototype,
);

const rawChild = {n: 1};
const holder = $state({child: rawChild});
const early = Object.getOwnPropertyDescriptor(holder, 'child').value;
console.log(
  'descriptor value before any read is the raw object:',
  Object.is(early, rawChild),
);
const live = holder.child;
const late = Object.getOwnPropertyDescriptor(holder, 'child').value;
console.log(
  'descriptor value after a read is the proxy:',
  Object.is(late, live),
);
```

Output, development build:

```text
initial                           {"keys":"a,child,rows","childN":1}
define a new key b                {"keys":"a,child,rows","childN":1,"b":2}
  Object.keys(state) read now: a,child,rows,b
redefine child as another object  {"keys":"a,child,rows","childN":99,"b":2}
redefine rows[0] as 7: live 7 , snapshot [7]
define with {value: 3} only -> c = 4, enumerable = true
define an accessor THROWS Svelte error: state_descriptors_fixed
define a read-only value THROWS Svelte error: state_descriptors_fixed
Object.setPrototypeOf(state, {}) THROWS Svelte error: state_prototype_fixed
Object.freeze(state), no key added before THROWS Svelte error: state_descriptors_fixed
  then a read -> 1
  then untouched.z = 1 -> 1
  then Object.keys THROWS TypeError: Proxy handler's 'ownKeys' method returned a key that was not present in its non-extensible target
assign a parsed __proto__ key: polluted = undefined , a = 2 , prototype unchanged = true
descriptor value before any read is the raw object: true
descriptor value after a read is the proxy: true
```

Lines that differ in the production build:

```text
define an accessor THROWS Error: https://svelte.dev/e/state_descriptors_fixed
define a read-only value THROWS Error: https://svelte.dev/e/state_descriptors_fixed
Object.setPrototypeOf(state, {}) THROWS Error: https://svelte.dev/e/state_prototype_fixed
Object.freeze(state), no key added before THROWS Error: https://svelte.dev/e/state_descriptors_fixed
```

### Port 7: a frozen object in state

`ports/p07-frozen.svelte.js`:

```js
// A frozen object held in state, and an object frozen behind the proxy.
// Stage 1 finding 46 and the "frozen objects are values" rule.
import {attempt} from '../helpers.js';

const frozen = Object.freeze({nested: {a: 1}, n: 1});
const state = $state({config: frozen});
console.log('config is wrapped:', state.config !== frozen);
console.log(
  'config.nested is the raw object:',
  state.config.nested === frozen.nested,
);
console.log('config.n:', state.config.n);
attempt('config.n = 2', () => ((state.config.n = 2), state.config.n));
attempt('delete config.n', () => delete state.config.n);
attempt(
  'config.extra = 1 (new key)',
  () => ((state.config.extra = 1), state.config.extra),
);
attempt('Object.keys(config) after that', () =>
  Object.keys(state.config).join(','),
);
attempt('"extra" in config', () => 'extra' in state.config);
attempt('JSON.stringify(config)', () => JSON.stringify(state.config));

const rawRead = {config: {nested: {a: 1}}};
const read = $state(rawRead);
read.config.nested.a;
Object.freeze(rawRead.config);
attempt(
  'freeze behind the proxy after a read: config.nested',
  () => read.config.nested.a,
);

const rawUnread = {config: {nested: {a: 1}}};
const unread = $state(rawUnread);
Object.freeze(rawUnread.config);
attempt(
  'freeze behind the proxy before any read: config.nested',
  () => unread.config.nested.a,
);
console.log(
  '  nested is then the raw object:',
  unread.config.nested === rawUnread.config.nested,
);
```

Output, development build:

```text
[svelte] state_proxy_equality_mismatch   (console.warn, two more lines of text left out)
config is wrapped: true
config.nested is the raw object: true
config.n: 1
config.n = 2 THROWS TypeError: Proxy handler's 'set' on a non-configurable and non-writable property on 'target' should either return false or be the same value already on the 'target'
delete config.n THROWS TypeError: Proxy handler's 'deleteProperty' method should return false when the target's property is not configurable
config.extra = 1 (new key) -> 1
Object.keys(config) after that THROWS TypeError: Proxy object's 'target' has the non-configurable property 'n' that was not in the result from the 'ownKeys' trap
"extra" in config -> true
JSON.stringify(config) THROWS TypeError: Proxy object's 'target' has the non-configurable property 'n' that was not in the result from the 'ownKeys' trap
freeze behind the proxy after a read: config.nested THROWS TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
freeze behind the proxy before any read: config.nested -> 1
  nested is then the raw object: true
```

### Port 8: `SvelteMap` and `SvelteSet`

`ports/p08-collections.svelte.js`:

```js
// SvelteMap and SvelteSet with object keys. Stage 1 findings 12, 33, 34, 35;
// API question 5.
import {flushSync} from 'svelte';
import {SvelteMap, SvelteSet} from 'svelte/reactivity';

const raw = {id: 1};
const state = $state({list: [raw]});
const proxied = state.list[0];

const map = new SvelteMap([[raw, 'by raw']]);
console.log(
  'map instanceof Map:',
  map instanceof Map,
  ' own keys:',
  Object.keys(map).length,
);
console.log(
  'get(raw):',
  map.get(raw),
  ' get(proxy):',
  map.get(proxied),
  ' has(proxy):',
  map.has(proxied),
);
map.set(proxied, 'by proxy');
console.log('after set(proxy): size =', map.size);

const set = new SvelteSet([raw, proxied]);
console.log(
  'SvelteSet([raw, proxy]).size:',
  set.size,
  ' delete(raw):',
  set.delete(raw),
  ' has(proxy):',
  set.has(proxied),
);
const zeros = new SvelteSet([0]);
zeros.add(-0);
console.log(
  'SvelteSet([0]).add(-0).size:',
  zeros.size,
  ' SvelteSet([0, -0]).size:',
  new SvelteSet([0, -0]).size,
);

// Values are not made deeply reactive.
const values = new SvelteMap([['k', {n: 1}]]);
const held = $state({svelteMap: values, nativeMap: new Map([['a', 1]])});
console.log(
  'a SvelteMap held in state is the same instance:',
  held.svelteMap === values,
);
const runs = {value: 0, field: 0, size: 0, nativeSize: 0};
const stop = $effect.root(() => {
  $effect(() => (held.svelteMap.get('k'), runs.value++));
  $effect(() => (held.svelteMap.get('k').n, runs.field++));
  $effect(() => (held.svelteMap.size, runs.size++));
  $effect(() => (held.nativeMap.size, runs.nativeSize++));
});
const show = (label) => {
  flushSync();
  console.log(label, JSON.stringify(runs));
};
show('initial                   ');
values.get('k').n = 2;
show("get('k').n = 2            ");
values.set('k', {n: 3});
show("set('k', {...})           ");
values.set('other', 1);
show("set('other', 1)           ");
held.nativeMap.set('b', 2);
show("native map .set('b', 2)   ");

const snap = $state.snapshot(held);
console.log(
  'snapshot of a SvelteMap: Map =',
  snap.svelteMap instanceof Map,
  ', SvelteMap =',
  snap.svelteMap instanceof SvelteMap,
  ', same instance =',
  snap.svelteMap === values,
);
stop();
```

Output, development build:

```text
map instanceof Map: true  own keys: 0
get(raw): by raw  get(proxy): undefined  has(proxy): false
after set(proxy): size = 2
SvelteSet([raw, proxy]).size: 2  delete(raw): true  has(proxy): true
SvelteSet([0]).add(-0).size: 1  SvelteSet([0, -0]).size: 1
a SvelteMap held in state is the same instance: true
initial                    {"value":1,"field":1,"size":1,"nativeSize":1}
get('k').n = 2             {"value":1,"field":1,"size":1,"nativeSize":1}
set('k', {...})            {"value":2,"field":2,"size":1,"nativeSize":1}
set('other', 1)            {"value":2,"field":2,"size":2,"nativeSize":1}
native map .set('b', 2)    {"value":2,"field":2,"size":2,"nativeSize":1}
snapshot of a SvelteMap: Map = true , SvelteMap = false , same instance = false
```

### Port 9: an object that refers to itself

`ports/p09-self.svelte.js`:

```js
// A state object that refers to itself. Stage 1 findings 8 and 13.
import {attempt} from '../helpers.js';

const state = $state({n: 1});
state.self = state;
console.log('state.self === state:', state.self === state);
console.log('state.self.self.n:', state.self.self.n);
let runs = 0;
const total = $derived.by(() => (runs++, state.self.n * 2));
console.log('derived:', total, 'runs', runs);
state.unrelated = 1;
console.log('after an unrelated write:', total, 'runs', runs);
state.n = 2;
console.log('after state.n = 2:', total, 'runs', runs);
attempt('snapshot of the cycle', () => {
  const snap = $state.snapshot(state);
  return `snap.self === snap: ${snap.self === snap}, snap === state: ${snap === state}, n: ${snap.n}`;
});
```

Output, development build:

```text
state.self === state: true
state.self.self.n: 1
derived: 2 runs 1
after an unrelated write: 2 runs 1
after state.n = 2: 4 runs 2
snapshot of the cycle -> snap.self === snap: true, snap === state: false, n: 2
```

### Port 10: the raw object behind the proxy

`ports/p10-raw.svelte.js`:

```js
// Writes through the proxy and writes through the raw object.
// Stage 1 findings 10, 11, 25.
const raw = {n: 0, child: {n: 0}, list: [{id: 1}, {id: 2}]};
const state = $state(raw);

state.n = 5;
state.child.n = 1;
state.list.reverse();
state.list.push({id: 3});
console.log(
  'through the proxy:  n',
  state.n,
  ' child.n',
  state.child.n,
  ' list',
  state.list.map((r) => r.id).join(','),
);
console.log(
  'the raw object now: n',
  raw.n,
  ' child.n',
  raw.child.n,
  ' list',
  raw.list.map((r) => r.id).join(','),
);

raw.n = 9;
console.log(
  'raw.n = 9 after the proxy wrote n: state.n =',
  state.n,
  ', snapshot n =',
  $state.snapshot(state).n,
);
raw.fresh = 1;
console.log(
  'raw.fresh = 1, never touched through the proxy: state.fresh =',
  state.fresh,
);
raw.fresh = 2;
console.log('raw.fresh = 2 after that read: state.fresh =', state.fresh);

// Finding 25: an object changed while it was out of the state, then put back.
const slotRaw = {n: 1};
const holder = $state({slot: slotRaw});
$state.snapshot(holder);
delete holder.slot;
slotRaw.n = 2;
holder.slot = slotRaw;
console.log(
  'put back after a raw change: live',
  holder.slot.n,
  ' snapshot',
  $state.snapshot(holder).slot.n,
);
```

Output, development build:

```text
through the proxy:  n 5  child.n 1  list 2,1,3
the raw object now: n 0  child.n 0  list 1,2
raw.n = 9 after the proxy wrote n: state.n = 5 , snapshot n = 5
raw.fresh = 1, never touched through the proxy: state.fresh = 1
raw.fresh = 2 after that read: state.fresh = 1
put back after a raw change: live 2  snapshot 2
```

### Port 11: what Svelte reports

`ports/p11-diagnostics.svelte.js`:

```js
// What Svelte reports where we are silent. Stage 1 findings 18, 19, 38, 39.
import {flushSync} from 'svelte';
import {attempt} from '../helpers.js';

const state = $state({n: 0});

const writes = $derived.by(() => {
  state.n++;
  return state.n;
});
attempt('a derived value that writes state', () => writes);

class Cycle {
  a = $derived(this.b + 1);
  b = $derived(this.a + 1);
}
attempt('two derived values that read each other', () => new Cycle().a);

const stop = $effect.root(() => {
  $effect(() => {
    state.n = state.n + 1;
  });
});
attempt('an effect that writes what it reads', () => flushSync());
console.log('state.n after the loop was stopped:', state.n);
stop();
```

Output, development build:

```text
a derived value that writes state THROWS Svelte error: state_unsafe_mutation
two derived values that read each other THROWS Svelte error: derived_references_self
an effect that writes what it reads THROWS Svelte error: effect_update_depth_exceeded
state.n after the loop was stopped: 1001
```

Lines that differ in the production build:

```text
a derived value that writes state THROWS Error: https://svelte.dev/e/state_unsafe_mutation
two derived values that read each other THROWS RangeError: Maximum call stack size exceeded.
an effect that writes what it reads THROWS Error: https://svelte.dev/e/effect_update_depth_exceeded
```

### Port 12: getters, setters and `$derived` fields

`ports/p12-getters.svelte.js`:

```js
// A getter and a setter on a plain state object, against a $derived field.
// Stage 1 findings 39, 40, 43.
import {flushSync} from 'svelte';

let getterRuns = 0;
const state = $state({
  first: 'a',
  last: 'b',
  get full() {
    getterRuns++;
    return `${this.first} ${this.last}`;
  },
  set full(value) {
    [this.first, this.last] = value.split(' ');
  },
});
state.full;
state.full;
console.log('plain getter read twice: runs', getterRuns);

let effectRuns = 0;
const seen = [];
const stop = $effect.root(() => {
  $effect(() => {
    effectRuns++;
    seen.push(state.full);
  });
});
flushSync();
state.full = 'c d';
flushSync();
console.log(
  'setter writing two fields: effect runs',
  effectRuns,
  ' saw',
  JSON.stringify(seen),
);
stop();
console.log(
  'snapshot of the plain object:',
  JSON.stringify($state.snapshot(state)),
  ', full is own data:',
  'value' in Object.getOwnPropertyDescriptor($state.snapshot(state), 'full'),
);

let derivedRuns = 0;
class Name {
  first = $state('a');
  last = $state('b');
  full = $derived.by(
    () => (derivedRuns++, {text: `${this.first} ${this.last}`}),
  );
}
const name = new Name();
const one = name.full;
const two = name.full;
console.log(
  '$derived field read twice: runs',
  derivedRuns,
  ' same object',
  one === two,
);
one.text = 'changed by the reader';
console.log('object returned by a derived is not protected:', name.full.text);
```

Output, development build:

```text
plain getter read twice: runs 2
setter writing two fields: effect runs 2  saw ["a b","c d"]
snapshot of the plain object: {"first":"c","last":"d","full":"c d"} , full is own data: true
$derived field read twice: runs 1  same object true
object returned by a derived is not protected: changed by the reader
```

### The same situations on our library

`ours.ts`, run with `bun ours.ts` against the repository source at `ac38f2f`:

```ts
// The same situations on @codebelt/classy-store, from the repository's source.
import {
  createClassyStore,
  PROXYABLE,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
import {
  reactiveMap,
  reactiveSet,
} from '<repo>/packages/classy-store/src/collections/index.ts';
import {attempt} from './helpers.js';

console.log('--- p01 wrapping');
class Model {
  static label = 'model';
  n = 0;
}
const raws: Record<string, unknown> = {
  plain: {a: 1},
  array: [1],
  nullProto: Object.assign(Object.create(null), {a: 1}),
  instance: new Model(),
  frozen: Object.freeze({nested: {a: 1}}),
  date: new Date(0),
  map: new Map(),
  fn: () => 1,
  Model,
};
const store = createClassyStore({...raws}) as Record<string, any>;
for (const key of Object.keys(raws)) {
  console.log(
    `${key}: ${store[key] === raws[key] ? 'kept as it is' : 'wrapped'}`,
  );
}
console.log('function read twice is the same:', store.fn === store.fn);
attempt('store.Model.label', () => store.Model.label);
attempt(
  'new store.Model() instanceof store.Model',
  () => new store.Model() instanceof store.Model,
);
const shared = {id: 1};
const two = createClassyStore({a: shared, b: shared});
console.log('two.a === two.b:', two.a === two.b);
two.a.id = 5;
console.log(
  'after two.a.id = 5: two.b.id =',
  two.b.id,
  ', shared.id =',
  shared.id,
);

console.log('--- p02 classes');
class Plain {
  n = 0;
  inc() {
    this.n++;
  }
}
class Opted extends Plain {
  static [PROXYABLE] = true;
}
class Counter {
  n = 0;
  #secret = 1;
  inc() {
    this.n++;
  }
  incArrow = () => {
    this.n++;
  };
  bumpSecret() {
    this.#secret++;
  }
  get secret() {
    return this.#secret;
  }
}
const held = createClassyStore({plain: new Plain(), opted: new Opted()});
let heldCalls = 0;
subscribe(held, () => heldCalls++, {sync: true});
held.plain.inc();
console.log(
  'plain.inc(): notifications',
  heldCalls,
  ', plain.n',
  held.plain.n,
  ', snapshot',
  snapshot(held).plain.n,
);
held.opted.inc();
console.log(
  'opted.inc() (PROXYABLE): notifications',
  heldCalls,
  ', opted.n',
  held.opted.n,
);

const counter = createClassyStore(new Counter());
let calls = 0;
subscribe(counter, () => calls++, {sync: true});
snapshot(counter);
counter.inc();
console.log(
  'counter.inc(): notifications',
  calls,
  ', snapshot n',
  snapshot(counter).n,
);
counter.incArrow();
console.log(
  'counter.incArrow(): notifications',
  calls,
  ', live n',
  counter.n,
  ', snapshot n',
  snapshot(counter).n,
);
const {inc} = counter;
attempt(
  'detached prototype method inc()',
  () => (inc(), `notifications ${calls}`),
);
attempt('counter.bumpSecret() (#private)', () => counter.bumpSecret());
attempt('counter.secret (getter over #private)', () => counter.secret);

console.log('--- p07 frozen');
const frozen = Object.freeze({nested: {a: 1}, n: 1});
const withFrozen = createClassyStore({config: frozen}) as {
  config: {nested: {a: number}; n: number; extra?: number};
};
console.log('config is kept as it is:', withFrozen.config === frozen);
attempt('config.n = 2', () => ((withFrozen.config.n = 2), withFrozen.config.n));
attempt(
  'config.extra = 1',
  () => ((withFrozen.config.extra = 1), withFrozen.config.extra),
);
attempt('Object.keys(config)', () => Object.keys(withFrozen.config).join(','));
const root = createClassyStore({a: 1, child: {n: 1}});
attempt('Object.freeze(store)', () => Object.isFrozen(Object.freeze(root)));
attempt(
  '  then a read',
  () => `${root.a}, ${root.child.n}, keys ${Object.keys(root).join(',')}`,
);

console.log('--- p08 collections');
const raw = {id: 1};
const rows = createClassyStore({
  list: [raw],
  map: reactiveMap<object, string>(),
  set: reactiveSet<unknown>(),
});
rows.map.set(raw, 'by raw');
console.log(
  'get(raw):',
  rows.map.get(raw),
  ' get(proxy):',
  rows.map.get(rows.list[0]),
  ' get(snapshot):',
  rows.map.get(snapshot(rows).list[0]),
);
rows.map.set(rows.list[0], 'by proxy');
console.log(
  'after set(proxy): size =',
  rows.map.size,
  ', get(raw) =',
  rows.map.get(raw),
);
console.log('map instanceof Map:', rows.map instanceof Map);
rows.set.add(raw);
rows.set.add(rows.list[0]);
console.log('set.add(raw), set.add(proxy): size =', rows.set.size);

console.log('--- p10 raw');
const rawState = {n: 0, list: [{id: 1}, {id: 2}]};
const live = createClassyStore(rawState);
live.n = 5;
live.list.reverse();
console.log(
  'the raw object after writes through the store: n',
  rawState.n,
  ', list',
  rawState.list.map((r) => r.id).join(','),
);

console.log(
  '--- API question 4: a base class whose constructor returns the store',
);
class Store {
  constructor() {
    // biome-ignore lint/correctness/noConstructorReturn: the experiment
    return createClassyStore(this);
  }
}
class Derived extends Store {
  n = 0;
  #secret = 1;
  items = [{id: 1}];
  incArrow = () => {
    this.n++;
  };
  bumpSecret() {
    this.#secret++;
  }
  get secret() {
    return this.#secret;
  }
  get double() {
    return this.n * 2;
  }
}
const derived = new Derived();
let derivedCalls = 0;
subscribe(derived, () => derivedCalls++, {sync: true});
const firstSnapshot = snapshot(derived);
console.log(
  'first snapshot: own keys',
  Object.keys(firstSnapshot).join(','),
  ', items frozen',
  Object.isFrozen(firstSnapshot.items),
);
attempt(
  'first snapshot read of the getter over #private',
  () => firstSnapshot.secret,
);
const {incArrow} = derived;
incArrow();
console.log(
  'detached arrow method: notifications',
  derivedCalls,
  ', live n',
  derived.n,
  ', snapshot n',
  snapshot(derived).n,
  ', double',
  snapshot(derived).double,
);
attempt(
  'bumpSecret() (#private)',
  () => (
    derived.bumpSecret(),
    `secret ${derived.secret}, notifications ${derivedCalls}`
  ),
);
derived.items[0].id = 2;
console.log(
  'nested write: notifications',
  derivedCalls,
  ', snapshot',
  JSON.stringify(snapshot(derived).items),
);
attempt('snapshot(derived).secret', () => snapshot(derived).secret);
```

Output:

```text
--- p01 wrapping
plain: wrapped
array: wrapped
nullProto: wrapped
instance: kept as it is
frozen: kept as it is
date: kept as it is
map: kept as it is
fn: wrapped
Model: wrapped
function read twice is the same: true
store.Model.label -> undefined
new store.Model() instanceof store.Model -> false
two.a === two.b: true
after two.a.id = 5: two.b.id = 5 , shared.id = 5
--- p02 classes
plain.inc(): notifications 0 , plain.n 1 , snapshot 1
opted.inc() (PROXYABLE): notifications 1 , opted.n 1
counter.inc(): notifications 1 , snapshot n 1
counter.incArrow(): notifications 1 , live n 2 , snapshot n 1
detached prototype method inc() -> notifications 2
counter.bumpSecret() (#private) THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
counter.secret (getter over #private) THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
--- p07 frozen
config is kept as it is: true
config.n = 2 THROWS TypeError: Attempted to assign to readonly property.
config.extra = 1 THROWS TypeError: Attempting to define property on object that is not extensible.
Object.keys(config) -> nested,n
Object.freeze(store) -> true
  then a read -> 1, 1, keys a,child
--- p08 collections
get(raw): by raw  get(proxy): by raw  get(snapshot): by raw
after set(proxy): size = 1 , get(raw) = by proxy
map instanceof Map: false
set.add(raw), set.add(proxy): size = 1
--- p10 raw
the raw object after writes through the store: n 5 , list 2,1
--- API question 4: a base class whose constructor returns the store
first snapshot: own keys n,items,incArrow,secret,double , items frozen false
first snapshot read of the getter over #private THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
detached arrow method: notifications 1 , live n 1 , snapshot n 1 , double 2
bumpSecret() (#private) -> secret 2, notifications 1
nested write: notifications 2 , snapshot [{"id":2}]
snapshot(derived).secret THROWS TypeError: Cannot access invalid private field (evaluating 'this.#secret')
```

### Reproductions run on our source and on the spike

`repro.ts`:

```ts
// Run as: bun repro.ts <path to src/index.ts>
// Reproductions of stage 1 findings 1, 8, 29, 45, 66 and 71, and the
// base-class experiment for API question 4.
import {attempt} from './helpers.js';

const {createClassyStore, snapshot, subscribe} = await import(process.argv[2]);
const basic = (value: unknown) => ({
  value,
  writable: true,
  enumerable: true,
  configurable: true,
});

{
  const store = createClassyStore({a: 1}) as Record<string, unknown>;
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  snapshot(store);
  Object.defineProperty(store, 'b', basic(2));
  console.log(
    'finding 1: define a new key: notifications',
    calls,
    ', in snapshot',
    'b' in snapshot(store),
  );
}
{
  const other = {n: 99};
  const s = createClassyStore({child: {n: 1}, rows: [{id: 1}]}) as any;
  s.child.n;
  Object.defineProperty(s, 'child', basic(other));
  console.log(
    'finding 45: redefine child: live child.n',
    s.child.n,
    ', snapshot',
    snapshot(s).child.n,
  );
  s.rows[0];
  Object.defineProperty(s.rows, 0, basic(7));
  console.log(
    'finding 71: redefine rows[0] as 7: live',
    JSON.stringify(s.rows[0]),
    ', snapshot',
    JSON.stringify(snapshot(s).rows[0]),
  );
}
{
  const store = createClassyStore({dict: {a: 1}}) as any;
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const before = snapshot(store);
  delete store.dict.missing;
  console.log(
    'finding 29: delete a missing key: notifications',
    calls,
    ', same snapshot',
    before === snapshot(store),
  );
  delete store.dict.a;
  console.log('  delete a present key: notifications', calls);
}
{
  const store = createClassyStore({n: 1, other: {x: 1}}) as any;
  store.self = store;
  attempt('finding 8: snapshot of a store that holds itself', () => {
    const snap = snapshot(store);
    const first = `self is the snapshot: ${snap.self === snap}, frozen: ${Object.isFrozen(snap)}`;
    store.n = 2;
    const next = snapshot(store);
    return `${first}; after a write: n ${next.n}, self is the new snapshot: ${next.self === next}, sibling shared: ${next.other === snap.other}`;
  });
  const ring = createClassyStore({
    a: {name: 'a'},
    b: {name: 'b'},
    list: [] as unknown[],
  }) as any;
  ring.a.next = ring.b;
  ring.b.next = ring.a;
  ring.list.push(ring.list);
  attempt('  a ring of two objects, and a list that holds itself', () => {
    const snap = snapshot(ring);
    return `a.next.next === a: ${snap.a.next.next === snap.a}, list[0] === list: ${snap.list[0] === snap.list}, all frozen: ${Object.isFrozen(snap.a) && Object.isFrozen(snap.b) && Object.isFrozen(snap.list)}`;
  });
}
{
  const store = createClassyStore({outer: {inner: {x: 1}}}) as any;
  const outer = store.outer;
  const inner = outer.inner;
  delete store.outer;
  Object.defineProperty(outer, 'inner', {writable: false, configurable: false});
  snapshot(inner);
  snapshot(inner);
  inner.back = outer;
  subscribe(inner, () => {})();
  console.log('finding 66: about to read');
  // The unmodified library never returns from this read; run under `timeout`.
  console.log('finding 66: inner.x =', inner.x);
}
{
  class Store {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the experiment
      return createClassyStore(this);
    }
  }
  class Todos extends Store {
    items = [{id: 1}];
    filter = 'all';
    setFilter = (value: string) => {
      this.filter = value;
    };
  }
  const todos = new Todos();
  let calls = 0;
  subscribe(todos, () => calls++, {sync: true});
  const first = snapshot(todos);
  const {setFilter} = todos;
  setFilter('done');
  console.log(
    'question 4: fields defined through the proxy: first snapshot items frozen',
    Object.isFrozen(first.items),
    ', arrow method notifications',
    calls,
    ', snapshot filter',
    snapshot(todos).filter,
  );
}
```

Output on the unmodified source. The run was stopped by `timeout 8` at the read that never returns (finding 66), so the last block did not run:

```text
finding 1: define a new key: notifications 0 , in snapshot false
finding 45: redefine child: live child.n 1 , snapshot 1
finding 71: redefine rows[0] as 7: live {"id":1} , snapshot {"id":1}
finding 29: delete a missing key: notifications 1 , same snapshot false
  delete a present key: notifications 2
finding 8: snapshot of a store that holds itself THROWS Error: @codebelt/classy-store: circular reference detected in snapshot
  a ring of two objects, and a list that holds itself THROWS Error: @codebelt/classy-store: circular reference detected in snapshot
finding 66: about to read
exit 124
```

Output on the spike copy:

```text
finding 1: define a new key: notifications 1 , in snapshot true
finding 45: redefine child: live child.n 99 , snapshot 99
finding 71: redefine rows[0] as 7: live 7 , snapshot 7
finding 29: delete a missing key: notifications 0 , same snapshot true
  delete a present key: notifications 1
finding 8: snapshot of a store that holds itself -> self is the snapshot: true, frozen: true; after a write: n 2, self is the new snapshot: true, sibling shared: true
  a ring of two objects, and a list that holds itself -> a.next.next === a: true, list[0] === list: true, all frozen: true
finding 66: about to read
finding 66: inner.x = 1
question 4: fields defined through the proxy: first snapshot items frozen true , arrow method notifications 1 , snapshot filter done
exit 0
```

`repro2.ts`:

```ts
// Run as: bun repro2.ts <path to src/index.ts>
// Reproductions of stage 1 findings 32, 43 and 46.
import {attempt} from './helpers.js';

const {createClassyStore, snapshot, subscribe} = await import(process.argv[2]);

{
  let runs = 0;
  const store = createClassyStore({
    get view() {
      runs++;
      return {value: (this as any).nope};
    },
  }) as any;
  const same = store.view === store.view;
  console.log(
    'finding 32: getter over a missing property: same object',
    same,
    ', runs',
    runs,
  );
  store.nope = 7;
  console.log(
    '  after the property appears:',
    store.view.value,
    ', runs',
    runs,
  );
  delete store.nope;
  console.log('  after it is deleted:', store.view.value, ', runs', runs);
}
{
  class Name {
    first = 'a';
    last = 'b';
    get full() {
      return `${this.first} ${this.last}`;
    }
    set full(value: string) {
      [this.first, this.last] = value.split(' ');
    }
  }
  const store = createClassyStore(new Name());
  const seen: string[] = [];
  subscribe(store, () => seen.push(snapshot(store).full), {sync: true});
  store.full = 'c d';
  console.log(
    'finding 43: a setter that writes two fields: subscriber saw',
    JSON.stringify(seen),
  );
}
{
  const raw = {config: {nested: {a: 1}}};
  const store = createClassyStore(raw);
  store.config.nested.a;
  Object.freeze(raw.config);
  attempt(
    'finding 46: read after freezing the raw object',
    () => store.config.nested.a,
  );
  attempt('  snapshot after that', () => JSON.stringify(snapshot(store)));
}
```

Output on the unmodified source:

```text
finding 32: getter over a missing property: same object false , runs 2
  after the property appears: 7 , runs 3
  after it is deleted: undefined , runs 4
finding 43: a setter that writes two fields: subscriber saw ["c b","c d"]
finding 46: read after freezing the raw object THROWS TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the same value as the target's property
  snapshot after that -> {"config":{"nested":{"a":1}}}
```

Output on the spike copy:

```text
finding 32: getter over a missing property: same object true , runs 1
  after the property appears: 7 , runs 2
  after it is deleted: undefined , runs 3
finding 43: a setter that writes two fields: subscriber saw ["c d"]
finding 46: read after freezing the raw object -> 1
  snapshot after that -> {"config":{"nested":{"a":1}}}
```

### The spike

The whole difference between the repository source at `ac38f2f` and the spike copy. It was run against the reproductions above and nothing else.

```diff
diff --git a/src/core/core.ts b/src/core/core.ts
index 252b9f1..dabe942 100644
--- a/src/core/core.ts
+++ b/src/core/core.ts
@@ -100,7 +100,13 @@ function recordDep(
       prop,
     });
   } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
+    tracker.deps.push({
+      kind: 'value',
+      target: internal.target,
+      prop,
+      value,
+      present: Reflect.has(internal.target, prop),
+    });
   }
 }
 
@@ -144,7 +150,7 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
       // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
@@ -414,7 +420,12 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
         // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
+        transactionDepth++;
+        try {
+          return Reflect.set(_target, prop, value, receiver);
+        } finally {
+          settleTransaction();
+        }
       }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
@@ -493,29 +504,50 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // Own data edges are indexed before a retained alias can be mutated.
       // An inherited data property becomes an edge on its first proxy read.
-      const child =
-        internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
+      const known = internal.childInternals.get(prop);
+      if (known && known.proxy !== value && isReadOnly(getterDesc)) {
+        // Frozen through the raw object since it was indexed.
+        internal.detach(prop);
+        recordDep(internal, prop, value);
+        return value;
+      }
+      const child = known ?? linkChild(internal, prop, value);
       recordDep(internal, prop, value);
       return child ? child.proxy : value;
     },
 
     defineProperty(_target, prop, descriptor) {
+      internal.resumeScope();
+      const before = Object.getOwnPropertyDescriptor(_target, prop);
       const defined = Reflect.defineProperty(_target, prop, descriptor);
-      // `Object.freeze(proxy)` arrives here once per property. A property that
-      // is now read-only holds its value as it is, as if frozen all along.
-      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
-      if (own && isReadOnly(own)) {
-        const child = internal.childInternals.get(prop);
-        // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
+      if (!defined) return false;
+      const own = Object.getOwnPropertyDescriptor(_target, prop);
+      // The same bookkeeping as a write: the property's value is its child, or
+      // it has none. A read-only value stays as it is (linkChild refuses it).
+      if (
+        !own ||
+        !('value' in own) ||
+        !linkChild(internal, prop, own.value, undefined, own)
+      ) {
+        internal.detach(prop);
       }
-      return defined;
+      boundMethods.delete(prop);
+      const changed =
+        !before ||
+        !own ||
+        'value' in before !== 'value' in own ||
+        before.enumerable !== own.enumerable ||
+        !Object.is(before.value, own.value) ||
+        before.get !== own.get;
+      if (changed) notifyMutation(internal);
+      return true;
     },
 
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      const had = Object.hasOwn(_target, prop);
       const deleted = Reflect.deleteProperty(_target, prop);
-      if (deleted) {
+      if (deleted && had) {
         internal.detach(prop);
         boundMethods.delete(prop);
         notifyMutation(internal);
diff --git a/src/core/core.types.ts b/src/core/core.types.ts
index 2ef9388..f912bd8 100644
--- a/src/core/core.types.ts
+++ b/src/core/core.types.ts
@@ -17,7 +17,13 @@ export type DepEntry =
       /** Property name on the parent. */
       prop: string | symbol;
     }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
+  | {
+      kind: 'value';
+      target: object;
+      prop: string | symbol;
+      value: unknown;
+      present: boolean;
+    }
   | {
       /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
       kind: 'computed';
diff --git a/src/snapshot/snapshot.ts b/src/snapshot/snapshot.ts
index afd3c51..ac8464f 100644
--- a/src/snapshot/snapshot.ts
+++ b/src/snapshot/snapshot.ts
@@ -184,7 +184,7 @@ function snapshotValue(
   value: unknown,
   parent: StoreInternal,
   key: string | symbol,
-  inProgress: WeakSet<object>,
+  inProgress: Map<object, object>,
 ): unknown {
   const child = parent.childInternals.get(key);
   return child
@@ -235,7 +235,7 @@ function installMemoizedGetters(snap: object, target: object): void {
 function createSnapshotRecursive<T extends object>(
   target: T,
   internal: StoreInternal,
-  inProgress: WeakSet<object> = new WeakSet(),
+  inProgress: Map<object, object> = new Map(),
 ): T {
   // Cache hit: version unchanged → return the same frozen snapshot reference.
   const cached = snapshotCache.get(target);
@@ -243,25 +243,29 @@ function createSnapshotRecursive<T extends object>(
     return cached[1] as T;
   }
 
-  if (inProgress.has(target)) {
-    throw new Error(
-      '@codebelt/classy-store: circular reference detected in snapshot',
-    );
-  }
-  inProgress.add(target);
+  const building = inProgress.get(target);
+  if (building) return building as T;
 
   let snap: Record<string | symbol, unknown> | unknown[];
 
   if (Array.isArray(target)) {
+    // The array exists before its elements are visited, so an element that
+    // leads back here finds it.
+    const list: unknown[] = [];
+    snap = list;
+    inProgress.set(target, list);
     // Only objects can be child nodes; primitives need no key lookup.
-    snap = mapOwnArrayElements(target, (value, index) =>
+    const mapped = mapOwnArrayElements(target, (value, index) =>
       typeof value === 'object' && value !== null
         ? snapshotValue(value, internal, String(index), inProgress)
         : value,
     );
+    list.length = mapped.length;
+    for (const key of Object.keys(mapped)) list[Number(key)] = mapped[Number(key)];
   } else {
     // Preserve the prototype chain and install memoized getters on the snapshot.
     snap = Object.create(Object.getPrototypeOf(target));
+    inProgress.set(target, snap);
     for (const key of Reflect.ownKeys(target)) {
       const desc = Object.getOwnPropertyDescriptor(target, key);
       if (!desc || !('value' in desc)) continue;
```

### Lookup timing

`lookup.ts`, run once with `bun --conditions browser --conditions production lookup.ts`:

```ts
// Order-of-magnitude timing of one keyed lookup. Not a benchmark.
import {SvelteMap} from 'svelte/reactivity';
import {
  createClassyStore,
  snapshot,
} from '<repo>/packages/classy-store/src/index.ts';
import {reactiveMap} from '<repo>/packages/classy-store/src/collections/index.ts';

function time(label: string, run: () => unknown, rounds: number) {
  for (let i = 0; i < rounds / 10; i++) run();
  const start = performance.now();
  for (let i = 0; i < rounds; i++) run();
  const ns = ((performance.now() - start) * 1e6) / rounds;
  console.log(
    `${label}: ${ns < 1000 ? ns.toFixed(0) + ' ns' : (ns / 1000).toFixed(1) + ' µs'}`,
  );
}

for (const size of [100, 1_000, 10_000]) {
  const entries = Array.from(
    {length: size},
    (_, i) => [`key${i}`, i] as [string, number],
  );
  const last = `key${size - 1}`;
  const svelte = new SvelteMap(entries);
  const store = createClassyStore({map: reactiveMap(entries)});
  const snap = snapshot(store);
  const rounds = size >= 10_000 ? 2_000 : 20_000;
  console.log(`--- ${size} entries, get(last key)`);
  time('  SvelteMap                 ', () => svelte.get(last), rounds);
  time('  reactiveMap, live store   ', () => store.map.get(last), rounds);
  time('  reactiveMap, snapshot     ', () => snap.map.get(last), rounds);
}
```

Output:

```text
--- 100 entries, get(last key)
  SvelteMap                 : 42 ns
  reactiveMap, live store   : 754 ns
  reactiveMap, snapshot     : 3.0 µs
--- 1000 entries, get(last key)
  SvelteMap                 : 26 ns
  reactiveMap, live store   : 6.1 µs
  reactiveMap, snapshot     : 33.3 µs
--- 10000 entries, get(last key)
  SvelteMap                 : 17 ns
  reactiveMap, live store   : 44.6 µs
  reactiveMap, snapshot     : 346.0 µs
```

### Harness

`build.mjs`:

```js
// Compile every ports/*.svelte.js module with Svelte's own compiler.
import {compileModule} from 'svelte/compiler';
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';

const dev = process.argv[2] !== 'prod';
for (const name of readdirSync('ports').filter((f) =>
  f.endsWith('.svelte.js'),
)) {
  const source = readFileSync(`ports/${name}`, 'utf8');
  const {js} = compileModule(source, {filename: name, dev, generate: 'client'});
  writeFileSync(`out/${name.replace('.svelte.js', '.js')}`, js.code);
}
```

`run.sh`:

```sh
#!/bin/sh
# Compile the ports, then run each on Bun with Svelte's client build.
set -e
cd "$(dirname "$0")"
bun build.mjs "$1"
MODE=development
[ "$1" = "prod" ] && MODE=production
for file in out/p*.js; do
  echo "=== $(basename "$file") ($MODE) ==="
  bun --conditions browser --conditions "$MODE" "$file" 2>&1 || echo "(exit $?)"
done
```

`helpers.js`:

```js
// Shared by every port. Not compiled: plain JavaScript.
export function attempt(label, run) {
  try {
    const result = run();
    console.log(`${label} -> ${format(result)}`);
  } catch (error) {
    const first = String(error.message).split('\n')[0];
    console.log(`${label} THROWS ${error.name}: ${first}`);
  }
}

export function format(value) {
  if (typeof value === 'function') return `[function ${value.name}]`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/** Collect console.warn calls made while `run` executes. */
export function warnings(run) {
  const original = console.warn;
  const seen = [];
  console.warn = (...args) => {
    const text = args.filter((a) => typeof a === 'string').join(' ');
    seen.push((text.match(/\b[a-z]+(_[a-z]+)+\b/) ?? [text])[0]);
  };
  try {
    run();
  } finally {
    console.warn = original;
  }
  return seen;
}
```
