# `@codebelt/classy-store` 1.0: the public API spec

This is what stage 4 builds and what the stage 4 reviewer checks the code
against. It says what 1.0 is. Each statement names the decision it comes from
in brackets: `[D13]` is decision 13 of the stage 3 decision document, `[G5]`
is rule 5 of its "What 1.0 guarantees". The reasons are in the decision
records, not here.

A word on the terms used below:

- **Store**: the proxy that `createClassyStore()` returns, or a nested proxy
  read from one.
- **Raw object**: the object behind a proxy.
- **Synchronous subscriber**: a subscriber made with `{sync: true}`. Every
  framework adapter is one.
- **Batched subscriber**: a subscriber made without `{sync: true}`. It is
  called in a microtask.
- **Transaction**: a call during which synchronous subscribers are not
  called; they are called once, when the outermost call returns.
- **Method**: a function that a read through the store hands out bound to the
  proxy of the object that holds it, and runs as one transaction. Section 4
  says which functions are methods.

## 1. Objective

`@codebelt/classy-store` is a reactive state library for React, Vue, Svelte,
Solid and Angular. State is a plain class or object; `createClassyStore()`
puts a Proxy in front of it, class getters become memoized computed values,
and every framework reads frozen snapshots with structural sharing from one
core. These three things stay fixed in 1.0: a plain class behind a Proxy,
frozen snapshots with structural sharing, and one core for five frameworks.
For a user, 1.0 means that the public API in section 3 and the behaviour in
section 5 change only in a major release; what section 6 lists may change in
a minor release.

## 2. Entry points

All peer dependencies are optional. The package keeps `engines.node` at
`>=22` and one production dependency, `proxy-compare`, pinned to an exact
version [D33]. **New** marks what 1.0 adds; **changed** marks what 1.0
changes.

| Import path                           | Runtime exports                                                                                                                   | Public types                                                                                                                                                                                                                                          | Peer dependency and range      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `@codebelt/classy-store`              | `createClassyStore`, **`ClassyStore` (new)** [D11], `snapshot`, `subscribe`, `batch` (changed) [D16], `shallowEqual`, `PROXYABLE` | `Snapshot` (changed) [D45], `SubscribeOptions`                                                                                                                                                                                                        | None                           |
| `@codebelt/classy-store/react`        | `useClassyStore`, `useLocalStore`, `createStoreHook`, `useHistoryStatus`, `usePersistStatus`                                      | `UseClassyStoreSelectorOptions`                                                                                                                                                                                                                       | `react` `^18.0.0 \|\| ^19.0.0` |
| `@codebelt/classy-store/react/server` | `prepareStoreForHydration`                                                                                                        | None                                                                                                                                                                                                                                                  | None: it imports no React      |
| `@codebelt/classy-store/collections`  | `reactiveMap`, `reactiveSet`                                                                                                      | `ReactiveMap`, `ReactiveSet`, **`ReactiveMapSnapshot` (new)**, **`ReactiveSetSnapshot` (new)** [D45]                                                                                                                                                  | None                           |
| `@codebelt/classy-store/utils`        | `persist`, `withHistory`, `subscribeKey`, `devtools`                                                                              | `PersistOptions` (changed: `onError`) [D21], `PersistHandle`, `PersistStatus`, `PersistOperation`, `PropertyTransform`, `StorageAdapter`, `HistoryOptions`, `HistoryHandle`, `HistoryStatus`, `DevtoolsOptions`, `DevtoolsHandle`, `SubscribeOptions` | None                           |
| `@codebelt/classy-store/vue`          | `useClassyStore` (changed: its return type) [D38]                                                                                 | None                                                                                                                                                                                                                                                  | `vue` `^3.2.0`                 |
| `@codebelt/classy-store/svelte`       | `toSvelteStore`                                                                                                                   | `ClassyReadable`                                                                                                                                                                                                                                      | `svelte` `^4.0.0 \|\| ^5.0.0`  |
| `@codebelt/classy-store/solid`        | `useClassyStore`                                                                                                                  | None                                                                                                                                                                                                                                                  | `solid-js` `^2.0.0`            |
| `@codebelt/classy-store/angular`      | `injectClassyStore` (changed: an `options` parameter) [D39]                                                                       | None                                                                                                                                                                                                                                                  | `@angular/core` `^22.0.0`      |

- No export is renamed or removed [D40, D41]. The list may grow in a minor
  release [G11].
- 1.0 ships one build. No export condition (`development`, `production`) is
  used [D36].
- ESM and CommonJS callers of one installation can pass stores between them,
  as today.

## 3. The API

Each export has its signature as it is in 1.0, its rules, the errors it
throws or logs, and what changed from 0.11. An error code is written
`[code]`; section 7 has the full table, and a code marked "proposed" there
is a name this spec proposes where the decision document decides that a code
exists and does not name it.

Every error and every logged report from the library reads
`@codebelt/classy-store [code]: facts` [D35]. An adapter keeps its own prefix,
for example `@codebelt/classy-store/vue`. The facts are the names the user
wrote: a key, a getter path, the adapter. The same checks throw in every
build [D35].

### 3.1 Main entry: `@codebelt/classy-store`

#### `createClassyStore(instance)`

```ts
export function createClassyStore<T extends object>(instance: T): T;
```

**What is proxied**

1. It returns a proxy of `instance`. Given the same raw object or its proxy
   again, it returns the same proxy; given a nested proxy or the raw object
   behind one, it returns that nested proxy [G6].
2. Plain objects, arrays and reactive collections in the state are proxied,
   one proxy per object, however the object is reached and in however many
   stores it sits [G6].
3. A plain object made in another realm (an iframe, a Node `vm` context) is
   proxied like any other plain object, and is frozen in snapshots [D9].
4. A class instance nested in the state is a value, not proxied, unless its
   class has `static [PROXYABLE] = true` [D11]. `static [PROXYABLE] = false`
   keeps it a value on purpose [D11]. An instance of a class that extends
   `ClassyStore` is a store already and is reactive wherever it is placed
   [D11].
5. `Date`, `RegExp`, native `Map` and `Set`, and an object that was frozen
   before it reached the store are values: kept by reference, not proxied
   [D42, G5].
6. A `#private` field is never state [D11].
7. An array in a store carries its indices and `length` only. A named
   property written to an array stays on the live array and is left out of
   every snapshot [D34].

**Writes**

8. The `set` trap stores the raw object behind a store proxy. After
   `outer.inner = innerStore`, the raw `outer` holds the raw object of
   `innerStore`, and `outer.inner === innerStore` [D5].
9. An object that is already a store, placed in another store by its raw
   object, stays connected: a write through it notifies both stores [D5].
10. When a property becomes read-only through the store while it holds an
    object the store tracks (`Object.freeze(container)` through the store, or
    a definition without a value), the trap first puts that object's proxy in
    the raw slot. The object reads back as the same proxy, and a write through
    it notifies [D5].
11. An object frozen before it reached the store, and an object that is the
    value of a read-only property defined with that object as its value, are
    handed out as they are. A write through such an object is not seen, and
    the snapshot holds it unfrozen [D5, G6].
12. A list built from proxies and then assigned
    (`this.items = this.items.filter(…)`) keeps the proxies in its raw array
    [D5].
13. `Object.defineProperty` through a store is a write. The value becomes the
    property's child, or the old child is detached. Subscribers are told when
    the value, the getter, the kind of property or its enumerability changed.
    Every descriptor is forwarded to the raw object; none is refused [D2].
14. A definition or a `delete` of a property that is or was an accessor
    clears that node's getter cache, so a getter that read it is not stale
    [D2].
15. `Object.freeze(store)` works and notifies no one [D2].
16. There is no `setPrototypeOf` trap [D2].
17. `delete store.dict.missing`, a delete that removes nothing, returns `true`
    and notifies no one [D8].
18. A write that changes nothing notifies no one [G2].
19. A class setter that writes two fields is one transaction: a synchronous
    subscriber is told once [D15].
20. A write to the raw object behind a store is not seen. A raw object changed
    while it is out of the store shows its old content in the next snapshot
    after it is put back [D3]. The raw object must not be frozen once a store
    holds it [D9].

**Reads**

21. A function read through the store is a method or is handed out as it is,
    by the rule of section 4 [D1].
22. `includes`, `indexOf` and `lastIndexOf` on a list in a store find an
    element that is part of a store by any of its forms: its raw object, its
    proxy or a snapshot of it. Any other element (a snapshot kept as a value,
    a frozen object, a `Date`) is found by reference, as in a plain array. A
    primitive is searched for with the native method. `fromIndex` is passed to
    the engine unchanged. The answer is the nearest hit [D6].
23. On a list of snapshots kept as values, the three searches answer as a
    plain array does: `indexOf(v2)` finds `v2`, not another snapshot of the
    same object [D6].

**Getters on the live store**

24. A getter is lazy. It returns the same result while nothing it read
    through `this` changed, and a correct one after anything it read changed
    [G4].
25. A getter records one kind of dependency, a value and a version stamp per
    property, each property once per run. A property that was missing is
    recorded as missing, so a getter that reads an absent field is memoized
    like any other [D10, D7].
26. A getter that asks `'b' in this` records a dependency on the key `b`. A
    getter that calls `Object.keys(this)` records a dependency on the node's
    key set. Adding or removing a key, by a write, a `delete` or a definition,
    and changing whether a key is enumerable re-runs such a getter [D7].
27. `Object.hasOwn(this, key)`, `this.hasOwnProperty(key)` and
    `Object.getOwnPropertyDescriptor(this, key)` inside a getter record
    nothing. Such a getter stays stale after a key is added [D7, G4].
28. A getter that reads a getter which threw records that dependency, so it
    runs again once the failing getter can succeed [D10].
29. A cycle of getters throws `[getter-cycle]`, and the other getters keep
    working [G4].
30. A getter must not write to the object it is computed on. An assignment, a
    `delete` or a definition on that object while the getter runs throws a
    `TypeError` `[getter-write]` that names the field, also when the write is
    made by a method the getter calls. Nothing is written and nobody is told
    [D10].
31. Allowed in a getter: a write to another store, a write to a child object,
    and the construction of a store [D10].
32. Whether a key is a class getter is decided from a table per prototype,
    filled on the first miss. A read whose cached result is valid returns it.
    A recompute asks the prototype for its getter, so a getter redefined on
    the class runs its new body at its next recompute [D12].
33. The table of a prototype records a key that is absent everywhere only
    while it holds fewer than 256 keys [D12].

**Errors**

- `[getter-cycle]`, `Error`, thrown by a read of a getter that is on a cycle
  of getters. Facts: the path.
- `[getter-write]` (proposed), `TypeError`, thrown by a write to a getter's
  own object while the getter runs. Facts: the field.
- The engine's own `TypeError` for a write the raw object refuses (a frozen,
  sealed or read-only target) [G8].

**Changed from 0.11**

- `outer.inner === inner` after a store was placed by its proxy: the raw
  object now holds the raw value [D5].
- A child of a container frozen through the store stays a child [D5].
- `Object.defineProperty` through a store notifies and updates snapshots [D2].
- A delete that removes nothing no longer notifies [D8].
- A plain object from another realm is proxied [D9].
- A getter over an absent field, `in` or `Object.keys(this)` is memoized and
  correct [D7].
- A getter that writes its own object throws [D10].
- A setter is one transaction [D15].
- The three searches find the raw object a caller pushed [D6].
- Functions read through the store follow section 4 [D1].

#### `ClassyStore` (new)

```ts
export const ClassyStore: new () => object;
```

1. `class X extends ClassyStore` makes `new X()` a store: the constructor
   returns the store, so field initialisers, the constructor body,
   arrow-function fields, methods bound in the constructor and whatever the
   constructor starts all see the store as `this` [D11].
2. An arrow-function field is a function in a field, so it is a method when
   read through the store, by section 4. A subclass's arrow field that
   overrides the parent's is one transaction too, with class fields compiled
   as assignments and as definitions [D1, D11].
3. `createClassyStore(new X())` returns the same store [D11].
4. `instanceof X` and `instanceof ClassyStore` are true on the store and on
   its snapshot [D11, D43].
5. `super(args)` is a type error: the base takes no arguments [D11].
6. A store of such a class can be constructed inside a getter, on the live
   store and on a snapshot [D10, D11].
7. `persist()` is not called inside a constructor. A test pins what happens
   when it is: a subclass's field initialisers run after the restore and
   overwrite it, and count as edits [D19].
8. Under React's `StrictMode`, `useLocalStore` makes two stores in
   development, so a constructor that starts a timer starts two [D11].
9. A class that has to extend another class uses `createClassyStore(new X())`
   and prototype methods [D11].

**Errors.** None of its own.

**Changed from 0.11.** New.

#### `snapshot(store)`

```ts
export function snapshot<T extends object>(proxyStore: T): Snapshot<T>;
```

**Shape**

1. The root of a snapshot, and every plain object, array and reactive
   collection in it, is frozen [G5].
2. A value the store does not proxy (a class instance without the marker, a
   native `Map`, `Set` or `Date`, a function) is shared with the snapshot by
   reference [G5]. A snapshot holds each function as it was written, never a
   method [D1].
3. An object a getter returns is not frozen [G5].
4. A subtree that did not change and is not on a cycle keeps its snapshot
   object [G5]. A snapshot is cached by version; a second call with no write
   in between returns the same object.
5. Taking a snapshot runs no getter [G5].
6. A store that refers to itself gives a frozen snapshot with the same cycle
   in it [D44]. Everything on a cycle gets a new snapshot on every write to
   any part of it [D44].
7. A class getter is not an own key of a snapshot. For each class that has
   getters, one object that inherits from the class prototype is made once,
   with one memoizing accessor per getter, and snapshots of that class are
   created from it. `Object.keys`, a spread and `JSON.stringify` of a snapshot
   carry data only. `instanceof` and `constructor` give the class;
   `Object.getPrototypeOf(snapshot)` is the derived object, not
   `Class.prototype` [D43].
8. A getter of an object literal stays an own accessor of the snapshot,
   listed where the store lists it [D43].
9. A snapshot of a reactive collection no longer lists `size` in
   `Object.keys` or JSON; `snap.size` reads as before [D43].
10. A named property of an array is not in the snapshot [D34].

**Getters on a snapshot**

11. Inside a snapshot getter, `this` is the frozen snapshot behind a tracker:
    it has the store's keys, and the class as its constructor and for
    `instanceof` [D43].
12. Nested getters on a snapshot share one memo map: a getter read by two
    others runs once per snapshot [D10].
13. A cycle of getters on a snapshot throws `[getter-cycle]` [D10].
14. A write to `this` in a snapshot getter throws a `TypeError`
    `[getter-write]`, in strict code and in code that is not strict [D10].
15. While a snapshot getter runs, the live object the snapshot was taken from
    counts as having a getter running. A write that reaches that live object
    by another path (an arrow-function method of a `ClassyStore` subclass, a
    reference to the store, a method called on the store) throws the same
    way, with nothing written and nobody told [D10].
16. A write to a child object from a snapshot getter throws in strict code,
    because the child is frozen, and is ignored in code that is not strict
    [D10].

**Development check**

17. In development only, when a snapshot is asked for and a field of the raw
    object has changed without a write through the store, the library logs it
    once with `[lost-write]` and the field's name. The comparison runs at most
    once per task for a store [D36]. This check ships in 1.0 only if it meets
    the condition of section 8 [D36].

**Errors**

- `[not-a-store]`, `Error`, thrown when the argument is not a store.
- `[getter-cycle]`, `Error`, from a getter read on a snapshot (rule 13).
- `[getter-write]` (proposed), `TypeError` (rules 14 and 15).
- `[lost-write]`, logged once, development only (rule 17).

**Changed from 0.11**

- A store with a cycle no longer throws `circular reference detected in
  snapshot` [D44].
- Class getters move off the snapshot's own keys onto a derived prototype;
  `this` inside a snapshot getter is right [D43].
- A snapshot getter cycle throws in place of a stack overflow; nested
  memoization is kept [D10].
- A getter that writes throws on a snapshot, where the write was dropped
  [D10].
- The development-only `lost-write` report, if it lands [D36].

#### `subscribe(store, callback, options?)`

```ts
export function subscribe(
  proxy: object,
  callback: () => void,
  options?: SubscribeOptions,
): () => void;
```

**Timing**

1. By default the callback runs in a microtask: writes made before that
   microtask runs give one call. With `{sync: true}` it runs before the write
   returns [D17].
2. The callback receives no arguments [D34].
3. A subscription observes the subtree of the proxy it is given. Each call is
   its own registration, and each returned function removes only its own
   [G1].

**Order and delivery** [D13, G1, G3]

4. The subscribers of one node are called in the order they subscribed [G1].
5. A subscriber hears only writes made after `subscribe()` returned, and none
   after its unsubscribe function returned [G1]. A subscriber removed during
   delivery is not called; one added during delivery hears the next change,
   not the one in flight [D13].
6. A write made while synchronous subscribers are being called is queued.
   It is delivered after the round that is running, and before the outermost
   write returns. One queue serves all stores [D13].
7. A subscriber hears of its own write, once [D13].
8. On the batched path one microtask serves every round: a write made inside
   a batched subscriber is delivered to batched subscribers in that same
   microtask, after the round that is running [D13, G3].
9. Delivery stops after 100 rounds. It then reports once, with
   `[delivery-loop]`, through the same channel as a subscriber's error. The
   store keeps the writes, and the subscribers that were waiting are called
   at the next write [D13].
10. A synchronous subscriber of store A that writes store B makes B current at
    once; B's subscribers hear a round later. Inside one round, an adapter
    value of B may lag behind B [D13].

**Errors from a subscriber** [D14, G1]

11. A subscriber's error is caught. The write stays applied, the other
    subscribers of the round are called, and the subscriber stays
    subscribed. The code that wrote is not told [G1].
12. The rejection of an `async` subscriber is caught and logged the same way
    [D14].
13. If `console.error` throws while the error is reported, the round goes on
    and the writer is still not told [D14].
14. A subscriber's own error is logged as it is, with its own text; it is the
    user's error, not a library report [D14].

**Lifetime**

15. A subscription on a container that has left the store lasts while the
    caller holds the store, the container or the unsubscribe function [D3].
16. The library keeps no strong reference to a subscriber after its
    unsubscribe function was called, in a runtime that has `WeakRef` [G9].

**Errors**

- `[not-a-store]`, `Error`, thrown when `proxy` is not a store.
- `[delivery-loop]`, logged once, in every build, when delivery reaches 100
  rounds.

**Changed from 0.11**

- A write made during synchronous delivery is queued, not delivered inside
  the running delivery [D13].
- A subscriber removed during delivery is not called; one added hears the
  next change [D13].
- The bound of 100 rounds, where a loop overflowed the stack or never let the
  event loop drain [D13].
- An `async` subscriber's rejection is logged; a throwing `console.error` no
  longer reaches the writer [D14].
- An ordinary write is faster: every write takes one path [D13].

#### `batch(run)`

```ts
type Synchronous<T> =
  T extends PromiseLike<unknown>
    ? 'batch() groups only synchronous writes, so its callback must not return a promise'
    : T;

export function batch<T>(run: () => Synchronous<T>): T;
```

`Synchronous` is not exported.

1. `batch()` runs `run` as one transaction: synchronous subscribers are told
   once, when it returns or throws. It covers every store written inside it.
   Calls nest; the outermost one notifies. Reads inside see every write made
   so far [G2].
2. It returns what `run` returns.
3. A callback whose type returns a promise does not compile, and the error
   text says why [D16].
4. When `run` is a native `async` function, `batch()` throws a `TypeError`
   `[batch-async]` before it calls `run`, in every build. Nothing is written
   [D16].
5. A callback that returns a promise without being an `async` function, such
   as `() => { store.loading = true; return save(); }`, is accepted at run
   time and batches its synchronous writes. It does not compile [D16].
6. An `async` function that a build step turned into a generator is not seen
   by the check [D16].

**Errors**

- `[batch-async]`, `TypeError`, thrown before the call, when `run` is a
  native `async` function.

**Changed from 0.11**

- The parameter type refuses a callback that returns a promise [D16].
- A native `async` function is refused at run time [D16].
- A wrapper generic over the result of `batch()` needs a cast [D16].

#### `shallowEqual(a, b)`

```ts
export function shallowEqual<T>(a: T, b: T): boolean;
```

Its rules are the ones the reference states today. Decision 20 removes
redundant checks in `equality.ts` with no change of result [D20].

**Errors.** None.

**Changed from 0.11.** Unchanged.

#### `PROXYABLE`

```ts
export const PROXYABLE: unique symbol;
```

1. A class with `static [PROXYABLE] = true` is proxied wherever its instances
   sit in a store. Its getters are memoized [D11].
2. A snapshot of such an instance is an instance of the class: `instanceof`
   and `constructor` give the class. For a class with a getter, its prototype
   is the derived object of section 3.1, `snapshot`, rule 7 [D43].
3. `static [PROXYABLE] = false` keeps instances opaque on purpose [D11].

**Errors.** None.

**Changed from 0.11.** The reference's "their snapshots keep the class
prototype" becomes "are instances of the class" [D43].

#### `Snapshot<T>` (changed)

```ts
import type {
  ReactiveMap,
  ReactiveMapSnapshot,
  ReactiveSet,
  ReactiveSetSnapshot,
} from './collections/collections';

export type Snapshot<T> = T extends SnapshotLeaf
  ? T
  : T extends ReactiveMap<infer K, infer V>
    ? ReactiveMapSnapshot<K, V>
    : T extends ReactiveSet<infer V>
      ? ReactiveSetSnapshot<V>
      : T extends object
        ? {readonly [K in keyof T]: Snapshot<T[K]>}
        : T;
```

`SnapshotLeaf` is the internal union of today, unchanged. The branch for
arrays is gone: the mapped type keeps an array an array and a tuple a tuple.

1. `Snapshot<[string, number]>` is `readonly [string, number]` [D45].
   Optional, named and rest elements are kept, and reading a position past
   the end is a type error.
2. `Snapshot<string[]>` is `readonly string[]`, as today.
3. `Snapshot<ReactiveMap<K, V>>` is `ReactiveMapSnapshot<K, V>`, and
   `Snapshot<ReactiveSet<T>>` is `ReactiveSetSnapshot<T>` (section 3.2)
   [D45].
4. A subclass of a reactive collection has the snapshot type of the
   collection it extends; its own members are not in it [D45].
5. Methods of other classes keep their signatures [D45].

**Changed from 0.11.** Tuples and reactive collections, as above.

#### `SubscribeOptions`

```ts
export type SubscribeOptions = {
  sync?: boolean;
};
```

**Changed from 0.11.** Unchanged.

### 3.2 Collections: `@codebelt/classy-store/collections`

#### `reactiveMap(initial?)` and `reactiveSet(initial?)`

```ts
export function reactiveMap<K, V>(
  initial?: Iterable<[K, V]>,
): ReactiveMap<K, V>;
export function reactiveSet<T>(initial?: Iterable<T>): ReactiveSet<T>;
```

`ReactiveMap<K, V>` and `ReactiveSet<T>` keep their members as today,
`_entries` and `_items` included, which stay public [D45].

1. **One membership rule.** `-0` and `+0` are one key, as in a native `Map`.
   A collection constructed from a raw object and its proxy holds it once
   [D42].
2. **Membership is by identity for every member.** A raw object, its proxy
   and each of its snapshots are one member. A collection cannot hold two
   snapshots of one object as two members: the second `add()` changes
   nothing [D42].
3. A list in a store answers differently for a snapshot kept as a value
   (section 3.1, `createClassyStore`, rule 23). A test pins both answers
   [D6].
4. A snapshot of a collection answers `has()` and `get()` from an index,
   built on its second lookup. A read through the tracking proxy of the React
   hook without a selector still scans [D42].
5. A live collection keeps no index; its lookups scan the backing array
   [D42].
6. `set`, `add`, `delete` and `clear` throw a `TypeError` `[snapshot-mutator]`
   when called on a snapshot, through a tracking proxy, or on a collection its
   owner froze. Nothing is written [D45].
7. Writing to `_entries` or `_items` directly, on a live collection, is
   unspecified [D45].
8. Native `Map` and `Set` stay opaque; `reactiveMap` and `reactiveSet` stay
   separate classes [D42].

**Errors**

- `[snapshot-mutator]` (proposed), `TypeError`, thrown by a mutator on a
  frozen collection.

**Changed from 0.11**

- `-0` and `+0` are one key; a raw object and its proxy are one member when
  constructed [D42].
- A snapshot answers lookups from an index [D42].
- A mutator on a frozen collection throws the library's own coded error;
  `add()` on a collection its owner froze no longer pushes to the raw array
  in silence [D45].

#### `ReactiveMapSnapshot<K, V>` and `ReactiveSetSnapshot<T>` (new)

```ts
export type ReactiveMapSnapshot<K, V> = {
  readonly _entries: readonly (readonly [Snapshot<K>, Snapshot<V>])[];
  readonly size: number;
  get(key: K | Snapshot<K>): Snapshot<V> | undefined;
  has(key: K | Snapshot<K>): boolean;
  keys(): IterableIterator<Snapshot<K>>;
  values(): IterableIterator<Snapshot<V>>;
  entries(): IterableIterator<[Snapshot<K>, Snapshot<V>]>;
  forEach(
    callback: (
      value: Snapshot<V>,
      key: Snapshot<K>,
      map: ReactiveMapSnapshot<K, V>,
    ) => void,
  ): void;
  [Symbol.iterator](): IterableIterator<[Snapshot<K>, Snapshot<V>]>;
};

export type ReactiveSetSnapshot<T> = {
  readonly _items: readonly Snapshot<T>[];
  readonly size: number;
  has(value: T | Snapshot<T>): boolean;
  keys(): IterableIterator<Snapshot<T>>;
  values(): IterableIterator<Snapshot<T>>;
  entries(): IterableIterator<[Snapshot<T>, Snapshot<T>]>;
  forEach(
    callback: (
      value: Snapshot<T>,
      key: Snapshot<T>,
      set: ReactiveSetSnapshot<T>,
    ) => void,
  ): void;
  [Symbol.iterator](): IterableIterator<Snapshot<T>>;
};
```

1. They carry the queries and the iterators, and no `set`, `add`, `delete` or
   `clear` [D45].
2. The backing arrays are read-only members [D45].
3. `get` and `has` accept a key or a snapshot of it [D45].

**Changed from 0.11.** New. The names come from the report that built them;
see open point 5.

### 3.3 Utilities: `@codebelt/classy-store/utils`

#### `persist(store, options)`

```ts
export function persist<T extends object>(
  proxyStore: T,
  options: PersistOptions<T>,
): PersistHandle;

export type PersistOptions<T extends object> = {
  name: string;
  storage: StorageAdapter;
  properties?: Array<keyof T | PropertyTransform<T>>;
  debounce?: number;
  /** A finite number, 0 or more. Checked when persist() is called. */
  version?: number;
  /** Called only for a lower version. A native async function is refused. */
  migrate?: (
    persistedState: Record<string, unknown>,
    oldVersion: number,
  ) => Record<string, unknown>;
  merge?:
    | 'shallow'
    | ((
        persisted: Record<string, unknown>,
        current: Record<string, unknown>,
      ) => Record<string, unknown>);
  skipHydration?: boolean;
  syncTabs?: boolean;
  expireIn?: number;
  clearOnExpire?: boolean;
  /** Without it, a report goes to console.error. A throw here is logged. */
  onError?: (
    error: unknown,
    operation: PersistOperation,
    handle: PersistHandle,
  ) => void;
};

export type PersistOperation = 'write' | 'read' | 'remove' | 'parse';

export type PersistStatus = {
  readonly isHydrated: boolean;
  readonly isExpired: boolean;
  readonly isDisposed: boolean;
  readonly lastError: Readonly<{
    error: unknown;
    operation: PersistOperation;
  }> | null;
};

export type PersistHandle = UtilityStatusSource<PersistStatus> & {
  dispose: () => void;
  hydrated: Promise<void>;
  readonly isHydrated: boolean;
  save: () => Promise<void>;
  clear: () => Promise<void>;
  rehydrate: () => Promise<void>;
  readonly isExpired: boolean;
};
```

`StorageAdapter` and `PropertyTransform` are unchanged. `UtilityStatusSource`
is the internal type of today (`getSnapshot`, `getServerSnapshot`,
`subscribe`). A function of two parameters is assignable to the new
`onError` [D26].

| Option          | 1.0                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `name`          | Required. Unchanged [D26]                                                                              |
| `storage`       | Required. Unchanged [D26]                                                                              |
| `properties`    | Unchanged. A prototype key, a getter, a method or a half-written transform throws at `persist()` [D22] |
| `debounce`      | Unchanged. A pending debounced save is written on `pagehide` [D24]                                     |
| `version`       | A finite number, 0 or more; anything else throws at `persist()` [D21, D22]                             |
| `migrate`       | Called only for a lower version. A native `async` function throws at `persist()` [D21, D22]            |
| `merge`         | Unchanged. A throw, a thenable or a result that is not a plain object leaves the record unmerged [D21] |
| `skipHydration` | Unchanged meaning. Nothing is read, and nothing is saved, until the first `rehydrate()` [D19, D21]     |
| `syncTabs`      | Unchanged. An event from another storage area is ignored [D25]                                         |
| `expireIn`      | Unchanged. A finite value also stamps a record that has no `expiresAt` [D24]                           |
| `clearOnExpire` | Unchanged [D26]                                                                                        |
| `onError`       | Gains the handle as a third argument; replaces the default report to `console.error` [D21]             |

| Handle member                                         | 1.0                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `dispose()`                                           | Unchanged. After it nothing is read, written or scheduled [G10]                                                              |
| `hydrated`                                            | Settles also when the store cannot be snapshotted at the start of a read [D19]                                               |
| `isHydrated`                                          | Unchanged meaning; it shows whether the first read has settled [D21]                                                         |
| `save()`                                              | Rejects before the first read has settled, and, with a `'write'` report, while the handle does not write [D21]               |
| `clear()`                                             | Works at any time. Afterwards the handle writes again [D21]                                                                  |
| `rehydrate()`                                         | Rejects, with a `'parse'` report, when it finds a record of a newer version or one it cannot migrate, merge or restore [D21] |
| `isExpired`                                           | Unchanged                                                                                                                    |
| `getSnapshot()`, `getServerSnapshot()`, `subscribe()` | Unchanged. `lastError` holds the report for as long as the handle does not write [D21]                                       |

**When it reads** [D19]

1. With a synchronous storage, `persist()` restores the stored record before
   it returns. It awaits only a storage that returns a promise. There is no
   option for this.
2. The handle exists before the first read starts, so a report made during
   that read can pass the handle to `onError` [D19, D21].
3. With `skipHydration`, nothing is read until `rehydrate()` is called.

**Checked when it is called** [D22]

4. Before it reads or writes anything, `persist()` throws a `TypeError`
   `[persist-option]` for: a prototype key, a getter or a method named in
   `properties`; a transform that is half written; a `version` that is not a
   finite number of zero or more; a `migrate` that is a native `async`
   function. A native `async` function is told by its `Symbol.toStringTag`
   being exactly `'AsyncFunction'`, so a test runner's mock function is
   accepted.

**A handle writes only after it has read** [D21, G10]

5. Until its first read has settled, a handle saves nothing. With
   `skipHydration` that is until the first `rehydrate()`; with a storage that
   returns a promise, it is while the first read is in flight.
6. An edit made before then is kept in the store. When the read restores a
   record, the edit wins for the field it changed, the other fields are
   restored, and the result is saved.
7. `save()` rejects before the first read has settled. `clear()` works at any
   time.
8. A read that fails counts as no read, so the handle does not write after it
   [D21].

**A stored record that is read and not restored** [D21]

| Kind                          | What it is                                                                                                                                                                                                                                                                         | What happens                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Nothing to keep               | Not JSON; an envelope that is not an object; a `state` that is not a plain object; a version that is not a finite number of zero or more; an `expiresAt` that is neither a number, `null` nor missing; a record nested too deep to restore, or whose restore was rolled back [D23] | Reported as `'parse'`. The next save replaces it                                            |
| A lower version, no `migrate` | The documented way to drop an old format                                                                                                                                                                                                                                           | Not used and not reported. The next save replaces it                                        |
| From a newer version          | Its version is above the configured one                                                                                                                                                                                                                                            | Reported as `'parse'`. `migrate` is not called. The handle does not write while it is there |
| Not migrated or not merged    | `migrate`, `merge` or a `deserialize` threw, or `migrate` or `merge` returned a thenable or something that is not a plain object                                                                                                                                                   | Reported as `'parse'`. The handle does not write while it is there                          |
| Not read                      | The read itself failed                                                                                                                                                                                                                                                             | Reported as `'read'`. It counts as no read, so the handle does not write                    |

**A handle that does not write** [D21]

9. It saves nothing: on an edit, when the page is hidden, or on `save()`. An
   edit does not repeat the report.
10. `save()` reports as `'write'` and rejects with the error.
11. A `rehydrate()` that finds such a record again reports and rejects.
12. It writes again after `clear()`; after a `rehydrate()` that restores a
    record, finds none, or finds one with nothing to keep; and when such a
    record, or the removal of the record, arrives from another tab.
13. `lastError` of the status holds the report for as long as the handle does
    not write.
14. Edits made while it does not write are restored over if a later
    `rehydrate()` restores a record [D21].

**Reports** [D21]

15. `onError(error, operation, handle)` receives the handle as its third
    argument. With a synchronous storage the first report can come before
    `persist()` has returned.
16. An error that `onError` throws is logged with `console.error`.
17. Without `onError`, each report goes to `console.error` with its code, in
    every build. `onError` replaces that default.

**Versions and migration** [D21]

18. A version is a finite number, zero or above, for the option and for the
    record. A record with no `version` field is version 0; any other value,
    `null` and `"2"` included, leaves nothing to keep. `1.1` is a valid
    version.
19. `migrate` is called only for a lower version.
20. When `migrate` returns a thenable at run time, a rejection handler is
    attached to it, so no rejection is left unhandled, and the record counts
    as not migrated.
21. A record whose time has elapsed is expired whatever its version, and is
    treated as expired before its version is looked at.

**Restore** [D23]

22. A restore copies every value first, writes them in one transaction,
    checks that the result can be snapshotted, and rolls back if it cannot.
23. A nested `__proto__` key is dropped.
24. A synchronous subscriber is told once, after the whole record is in.

**Writes at load and when the page is hidden** [D24]

25. A debounced save that is still waiting is written on `pagehide`.
26. A migrated record is not written back at load; the first save writes it.
27. One thing is written back at load: a record of the configured version
    that has no `expiresAt`, or `null`, read by a handle whose `expireIn` is a
    finite number, is saved again with an `expiresAt`, through the ordinary
    save path and its debounce. Its state and its version are unchanged.
28. A record that arrives from another tab is never written back.

**Cross-tab sync** [D25]

29. When `storage` is a `Storage`, an event whose `storageArea` is another
    area is ignored. An event without `storageArea` is accepted.

**Use** [D19, D41]

30. `persist()` is called after the store is constructed, never inside a
    constructor. On the client, `prepareStoreForHydration(store)` is called
    before `persist(store)`.

**Errors**

- `[persist-option]` (proposed), `TypeError`, thrown by `persist()` for an
  option of rule 4. Facts: the option or key.
- `[persist-record]` (proposed), reported as `'parse'` for a record of the
  first, third or fourth kind of the table when the library itself refuses
  it. See open point 4 for an error the application's own callback threw.
- `[persist-unread]` (proposed), the rejection of a `save()` made before the
  first read has settled (rule 7).
- `[persist-disposed]` (proposed), the rejection of a call on a disposed
  handle. Today's text is `Persistence handle has been disposed`.
- The storage's own error, reported as `'read'`, `'write'` or `'remove'`.

**Changed from 0.11**

- A synchronous storage restores before `persist()` returns [D19].
- Option checks at `persist()` [D22].
- A handle writes only after it has read; `skipHydration` delays writes too
  [D21].
- A record of a newer version, or one that could not be migrated or merged,
  is kept and reported, and blocks writes [D21].
- A default report to `console.error`; `onError` gains the handle; a throw
  from `onError` is logged [D21].
- A version is any finite number of zero or more, on both sides [D21].
- A restore is one transaction and rolls back [D23].
- The `pagehide` flush and the expiry stamp [D24].
- Events from another storage area are ignored [D25].

#### `withHistory(store, options?)`

```ts
export function withHistory<T extends object>(
  proxyStore: T,
  options?: HistoryOptions,
): HistoryHandle;

export type HistoryOptions = {
  limit?: number;
};

export type HistoryStatus = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isPaused: boolean;
  readonly isDisposed: boolean;
};

export type HistoryHandle = UtilityStatusSource<HistoryStatus> & {
  undo: () => void;
  redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
};
```

The types are unchanged.

1. Undo and redo each run as one transaction. An edit made in the same tick
   as `undo()` or `redo()` is recorded like any other [D28].
2. Undo removes a function that was added to an own field and puts back one
   that was replaced, by reference. Methods on the prototype are untouched.
   After the restore, a read through the store hands out the same method as
   before [D29].
3. A restore from outside, a DevTools jump the extension sends as JSON,
   neither deletes nor writes a function field. Only a state the library
   recorded itself restores function fields [D29].
4. A restore goes down while both sides are containers of the same kind and
   writes only what differs. Where a restored value is the snapshot of an
   object that is still live, the live object is put back. Undo, redo and a
   DevTools jump share this one function [D30].
5. The restore enters each live object at most once, and treats the recorded
   root as the store, so a store that refers to itself is undone, redone and
   jumped like any other [D30, D44].
6. Before an object is restored in place, one check asks whether every write
   the restore would make there is allowed: a key to add to an object that
   is not extensible, a read-only key whose value differs, and a key that
   cannot be deleted each fail it. A function field that a state from outside
   does not carry is not a key to delete. An object that fails is replaced at
   its parent by a copy [D30].
7. When the root fails that check, the restore throws a `TypeError`
   `[restore-locked]` before it writes anything, and the history does not
   move [D30].
8. The restore follows the object, not the place it was recorded in. An
   object that was in the store when the entry was recorded and is still live
   is put back and restored in place, wherever else it now sits. If another
   store holds it too, that store sees the restore and its subscribers are
   told once [D30].
9. A container that was locked after the entry comes back as a new copy
   without the lock, child objects included [D30].
10. Recording uses a batched subscription, as today.

**Errors**

- `[restore-locked]` (proposed), `TypeError`, thrown by `undo()` or `redo()`
  when the root fails the check of rule 6.

**Changed from 0.11**

- An edit in the same tick as `undo()` is recorded [D28].
- Function fields are restored by reference [D29].
- A nested object is restored in place; unchanged rows keep their identity
  and snapshots [D30].
- A store with a cycle can be undone [D30, D44].
- A frozen root throws before anything is written; the history does not move
  [D30].

#### `devtools(store, options?)`

```ts
export function devtools<T extends object>(
  proxyStore: T,
  options?: DevtoolsOptions,
): DevtoolsHandle;

export type DevtoolsOptions = {
  name?: string;
  enabled?: boolean;
};

export type DevtoolsHandle = {
  dispose: () => void;
};
```

The types are unchanged; the default of `enabled` changes.

| Option    | 1.0                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | Unchanged. Default `'ClassyStore'`                                                                                                                      |
| `enabled` | Default: on only where `process.env.NODE_ENV` can be read and is not `'production'`; off where there is no `process`. `true` turns it on anywhere [D27] |

1. `devtools` subscribes on the synchronous channel. A store method sends one
   entry, named after the method, when the outermost call returns, with one
   snapshot. Direct writes outside a method send one `STORE_UPDATE` entry per
   task, from a microtask [D27].
2. The name of an entry is the key the method was first read under, for a
   method of a class and for one held in a field. After `store.b = store.a`,
   a call of `store.b()` is named `a` [D27, D1].
3. The core holds one place for a naming function, empty unless `devtools` is
   connected. `devtools()` fills it while at least one connection is open and
   empties it when the last one is disposed. A method call without `devtools`
   runs today's code [D27].
4. A jump replaces the state exactly, in one transaction, without calling
   setters. A jump to an entry this session sent restores the snapshot that
   was sent, so a `Date` stays a `Date`; a jump the extension sends as JSON
   restores data, not class instances [D27, D30].
5. The messages `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled
   [D27].
6. What `devtools` sends adds the values of the root store's class getters,
   each read guarded: a class getter of the root that throws shows its error
   text, and the entry is still sent. Nested objects are sent as they are. A
   getter of an object literal that throws still loses the entry [D27, D43].
7. When the extension is missing or `enabled` is off, the handle is inert.
   `dispose()` again does nothing [D27].

**Errors.** None.

**Changed from 0.11**

- Named entries, one per method call [D27].
- Exact time travel, and the four messages [D27].
- The default of `enabled` [D27].
- The root's class getter values are added to each entry [D43].

#### `subscribeKey(store, key, callback, options?)`

```ts
export function subscribeKey<
  T extends object,
  K extends keyof T & keyof Snapshot<T>,
>(
  proxyStore: T,
  key: K,
  callback: (value: Snapshot<T>[K], previousValue: Snapshot<T>[K]) => void,
  options?: SubscribeOptions,
): () => void;
```

1. The callback runs only when the value of `key` changed, by `Object.is`,
   with the new and the previous value [D31].
2. It reads the live value and takes a snapshot of that one node only when
   the node or its version changed; it takes no snapshot of the whole store
   [D31].
3. It has no selector form, no equality option and no immediate first call
   in 1.0 [D31].

**Errors.** `[not-a-store]`, `Error`, when `proxyStore` is not a store.

**Changed from 0.11.** No snapshot of the whole store per notification
[D31].

### 3.4 React: `@codebelt/classy-store/react`

The signatures are unchanged:

```ts
export function useClassyStore<T extends object, S>(
  proxyStore: T,
  selector: (snap: Snapshot<T>) => S,
  options?: UseClassyStoreSelectorOptions<S>,
): S;
export function useClassyStore<T extends object>(proxyStore: T): Snapshot<T>;

export function useLocalStore<T extends object>(factory: () => T): T;

export function createStoreHook<T extends object>(
  proxyStore: T,
): {
  (): Snapshot<T>;
  <S>(
    selector: (snap: Snapshot<T>) => S,
    options?: UseClassyStoreSelectorOptions<S>,
  ): S;
};

export function useHistoryStatus(history: HistoryHandle): HistoryStatus;
export function usePersistStatus(handle: PersistHandle): PersistStatus;

export type UseClassyStoreSelectorOptions<S> = {
  isEqual?: (a: S, b: S) => boolean;
};
```

1. The option keeps the name `isEqual` [D41].
2. The hook without a selector is safe for a snapshot with a cycle [D44].
3. A tracked read of a reactive collection in the hook without a selector
   scans, so the tracker sees what was read [D42].
4. The two traps of the React snapshot cache that `proxy-compare` cannot
   reach are removed if that fails no unit test and no React suite; otherwise
   each gets a test that reaches it [D20].
5. Under `StrictMode`, `useLocalStore` makes two stores in development [D11].
6. React subscribes synchronously, so a loop of direct writes is grouped
   with `batch()`; the guide names it [D37].

**Errors.** `[not-a-store]`, `Error`, thrown by `useClassyStore` and by
`createStoreHook` when the store argument is not a store.

**Changed from 0.11.** The cycle guard [D44]. The signatures are unchanged.

### 3.5 React server: `@codebelt/classy-store/react/server`

```ts
export function prepareStoreForHydration<T extends object>(proxyStore: T): T;
```

1. The server snapshot is captured only by this explicit call [D41].
2. On the client, it is called before `persist(store)` [D41].

**Errors.** `[not-a-store]`, `Error`.

**Changed from 0.11.** Unchanged.

### 3.6 Vue: `@codebelt/classy-store/vue`

```ts
import type {Ref} from 'vue';

export function useClassyStore<T extends object>(
  proxyStore: T,
): Readonly<Ref<Snapshot<T>>>;
```

1. The returned ref is a custom ref. Its listener only marks the value as
   changed; the snapshot is taken at the next read [D37]. `isShallow()` on it
   is `false` [D37].
2. A write to `.value` throws a `TypeError` `[readonly-ref]` [D38].
3. On the server it subscribes to nothing and reads the store at every read.
   A write made in `onServerPrefetch` renders [D38].
4. On the client it needs an active effect scope, as today, and the scope
   owns the cleanup.
5. It has no `active` flag of its own once the core skips a removed
   subscriber [D42].

**Errors**

- `[not-a-store]`, `Error`.
- `[no-scope]` (proposed), `Error`, thrown without an active effect scope.
  Facts: the adapter. Today's text is `requires an active Vue effect scope`.
- `[readonly-ref]` (proposed), `TypeError`, thrown by a write to `.value`.

**Changed from 0.11**

- The return type is `Readonly<Ref<Snapshot<T>>>`, a custom ref, no longer
  backed by `shallowRef` [D37, D38].
- The snapshot is built when it is read [D37].
- No listener is left by a server render [D38].
- A write to the ref throws [D38].

### 3.7 Svelte: `@codebelt/classy-store/svelte`

```ts
export interface ClassyReadable<T> {
  subscribe(run: (value: T) => void): () => void;
}

export function toSvelteStore<T extends object>(
  proxyStore: T,
): ClassyReadable<Snapshot<T>>;
```

1. Each subscription gets the current snapshot at once and later ones
   synchronously, as today. It cannot defer the snapshot; `batch()` groups a
   loop of direct writes [D37].
2. It drops its `active` flag once the core skips a removed subscriber [D42].

**Errors.** `[not-a-store]`, `Error`.

**Changed from 0.11.** Unchanged in behaviour.

### 3.8 Solid: `@codebelt/classy-store/solid`

```ts
export function useClassyStore<T extends object>(
  proxyStore: T,
): () => Snapshot<T>;
```

1. The name stays `useClassyStore` [D40].
2. The listener only marks the value as changed; the accessor takes the
   snapshot at its next read [D37].
3. It keeps its `active` flag, which decides what the accessor returns after
   disposal [D42].
4. It needs a live Solid owner, as today.

**Errors**

- `[not-a-store]`, `Error`.
- `[no-scope]` (proposed), `Error`, thrown without a live owner. Today's text
  is `requires an active Solid owner`.

**Changed from 0.11.** The snapshot is built when it is read [D37].

### 3.9 Angular: `@codebelt/classy-store/angular`

```ts
import type {Injector, Signal} from '@angular/core';

export function injectClassyStore<T extends object>(
  proxyStore: T,
  options?: {injector?: Injector},
): Signal<Snapshot<T>>;
```

| Option     | 1.0                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `injector` | New. With it, the adapter works outside an injection context and takes its `DestroyRef` from the injector [D39] |

1. The adapter updates its signal inside `untracked()`, so a store write
   made while an Angular `computed` runs is not lost [D39].
2. The listener only marks the value as changed; the signal takes the
   snapshot at its next read [D37].
3. Without `injector`, the adapter checks for an injection context itself
   and throws its own error, with the prefix and a code, in every Angular
   build [D39].
4. It drops its `active` flag once the core skips a removed subscriber, and
   keeps its `destroyed` check [D42].

**Errors**

- `[not-a-store]`, `Error`.
- `[no-scope]` (proposed), `Error`, thrown without an injection context and
  without `injector`, and for a destroyed context as today. Today's text is
  `injectClassyStore requires a live Angular injection context.`

**Changed from 0.11**

- The `options` parameter [D39].
- The update inside `untracked()` [D39].
- The adapter's own coded error in place of Angular's `NG0203` [D39].
- The snapshot is built when it is read [D37].

## 4. Which function is a method

Every other section relies on this rule [D1].

### The rule

A function is a **method**, bound to the proxy of the object that holds it
and run as one transaction, in two cases:

1. It is found on the prototype chain, under any key but `constructor`. Any
   kind of function.
2. It is the value of an own data property of an object that is not an
   array, **and it is read through the store**.

Case 2 does not apply, and the function is handed out as it is, when:

- it is a class or a built-in constructor, told by its own `prototype`
  property being read-only;
- it is a method that a read through any store handed out before;
- it is frozen, or it is a store;
- the property that holds it is read-only and not configurable.

So an arrow function, a shorthand method, an `async` function, a bound
function, a generator method and a function written with the `function`
keyword are all methods when they are read through the store. A function in
an array is handed out as it is.

### What follows from it

1. **The object is never changed.** The raw object and every snapshot hold
   each function as it was written. Only a read through the store hands out
   the method.
2. **One method per object and function.** `store.f === store.f`. The method
   takes the name of the key it was first read under.
3. **A method written back.** A method that the same object handed out is
   stored as the function it wraps: `store.f = store.f` is no change, and
   `store.b = store.a` stores `a`'s function. A method that another object
   handed out is stored as it is: it is data there, and stays bound to the
   object it came from.
4. **A read of a function in a field counts as a read for a getter**, so a
   getter that calls a function held in a field sees a later replacement.
5. **The short path.** Once an object has handed out the method for a
   function, a later read skips the property's descriptor as long as the
   object is extensible, no definition through the store has made one of its
   properties read-only, and the function is not frozen. A function on the
   prototype chain never needs the descriptor.
6. **The one read that can still throw.** After the store has handed out a
   method, a definition made on the raw object behind the store that makes
   that property read-only makes the next read throw a `TypeError`. This is
   unspecified behaviour (section 6). Making a property read-only through the
   store does not throw.
7. **A property that is read-only and not configurable**, for example after
   `Object.freeze(store)`, hands out its function as it is, unbound.
8. **A function read through the store is not the function that was
   stored**: `store.onSave === cb` is false. `snapshot(store).onSave === cb`
   is true.
9. **A method read through the store ignores the `this` its caller passes.**
   A function read from a snapshot or from the raw object runs with the `this`
   its caller gives.
10. **A method copied through the store stays bound to its store.**
    `{...store}` copies methods; a store built from that copy calls the old
    store's methods. A copy of a snapshot or of the raw object holds plain
    functions.
11. **A constructor written as a `function`, held as a value**, and a class
    compiled to ES5 with a writable `prototype`, is a method: not `===` to
    itself, without its static members, and `instanceof` against what is
    read is false. `new` on it still builds a real instance and leaves the
    store alone.
12. **A class that does not extend `ClassyStore` and has an arrow-function
    field** writes to the raw instance, and no subscriber hears it. Section
    3.1, `ClassyStore`, is the answer to it, and the `lost-write` report of
    `snapshot`, rule 17, reports it if that check ships.

### The cases

The 0.11 column is today's answer; the 1.0 column is the rule above. The
rows come from the spikes that built the rule. A row in the shape of an ES5
compiler's output was written by hand, not compiled.

| Case                                                                                 | 0.11                     | 1.0                        |
| ------------------------------------------------------------------------------------ | ------------------------ | -------------------------- |
| A prototype method, two writes: synchronous notifications                            | 1                        | 1                          |
| An array method: `list.push === list.push`                                           | false                    | true                       |
| A getter that returns a function                                                     | memoized                 | memoized                   |
| An own `function`: `store.handler === handler`                                       | false                    | false                      |
| ... called on the store: `this === store`                                            | true                     | true                       |
| An object-literal method, two writes                                                 | 1, works detached        | 1, works detached          |
| An own arrow at creation: `store.arrow === arrow`                                    | false                    | false                      |
| A function in a list: `indexOf(first)`                                               | -1                       | 0                          |
| A class as a value: statics, `instanceof`                                            | `undefined`, false       | right                      |
| A `function` constructor as a value: `===`                                           | false                    | false                      |
| A bound function: `store.bound === bound`                                            | false                    | false                      |
| A frozen function: `===`                                                             | false                    | true                       |
| `constructor`, on the store and the snapshot                                         | a wrapper; they differ   | the class                  |
| A store made from a function, held: `holder.fn === fnStore`                          | false                    | true                       |
| `inc: function () {…}` in an object literal, two writes: synchronous notifications   | 1                        | 1                          |
| ... detached, strict code                                                            | works (count 2)          | works                      |
| ... detached, code that is not strict: `store.count`, `globalThis.count`             | 1, unset                 | 1, unset                   |
| ... `store.inc === store.inc`                                                        | true                     | true                       |
| ... the snapshot holds the raw function, distinct from the store's                   | true                     | true                       |
| A class as a value: `store.Model === Model`                                          | false                    | true                       |
| ... a static field and a static method                                               | `undefined`, `undefined` | right                      |
| ... `new store.Model()`: `instanceof Model`, `instanceof store.Model`                | true, false              | true, true                 |
| A `function` constructor as a value: `store.Ctor === Ctor`                           | false                    | false                      |
| ... a static (`Ctor.kind`)                                                           | `undefined`              | `undefined`                |
| ... `new store.Ctor(5)`: `instanceof Ctor`, `instanceof store.Ctor`, `x`             | true, false, 5           | true, false, 5             |
| ... does `new store.Ctor(5)` touch the store: `store.x`, synchronous notifications   | 0, 0                     | 0, 0                       |
| ... `store.Ctor(7)` called as a function: `store.x`                                  | 7                        | 7                          |
| A built-in constructor (`Date`): `store.D === Date`                                  | false                    | true                       |
| ... `new store.D(0) instanceof Date`, `typeof store.D.now`                           | true, `undefined`        | true, `function`           |
| A generator method in an object literal: `store.gen === store.gen`                   | true                     | true                       |
| ... `[...store.gen()]`, two writes in the body: synchronous notifications            | 2                        | 2                          |
| ... detached `[...gen()]`                                                            | works                    | works                      |
| An `async` method in an object literal, two writes before an `await`: synchronous    | 1                        | 1                          |
| ... detached                                                                         | works                    | works                      |
| A method written to another store's field and into its list: each `=== store.inc`    | false                    | true                       |
| ... the same for a `function` expression method: each `=== store.f`                  | false                    | true                       |
| ... all four called through the other store, two writes each: `store.n`, synchronous | 4, 4                     | 4, 4                       |
| `store.a = store.a`: synchronous notifications; `store.a` the same after             | 1, false                 | 0, true                    |
| `store.f = store.f`, `f` a `function` expression: the same                           | 1, false                 | 0, true                    |
| `store.b = store.a`: `store.b === store.a`; raw `b` is `a`'s function                | false, false             | true, true                 |
| `store.c = store.f` (`function`): the same                                           | false, false             | true, true                 |
| A class in the shape TypeScript emits for ES5, as a value: `===`, static             | false, `undefined`       | false, `undefined`         |
| A class in the shape Babel emits (`prototype` read-only): `===`, static              | false, `undefined`       | true, `babel`              |
| A shorthand method in the shape ES5 emits (a `function`), two writes: synchronous    | 1                        | 1                          |
| A callback in the initial state: `snapshot(store).onSave === cb`                     | true                     | true                       |
| A getter calling a field function, after the field is replaced: store, snapshot      | `a1, b1`                 | `b1, b1`                   |
| `snapshot(s).options.ticks.callback.call(scale, 1)`                                  | `$1`                     | `$1`                       |
| ... the same on the store                                                            | `undefined1`             | `undefined1`               |
| `createClassyStore({...snapshot(e)})`: the first store's and the copy's counters     | 0, 1                     | 0, 1                       |
| `createClassyStore({...g})`, a copy of the proxy: the same                           | 1, 0                     | 1, 0                       |
| `Object.defineProperty(s, 'toJSON', {value: fn})`; then a read `=== fn`              | ok; throws               | ok; true                   |
| A base-class arrow field, two writes; the overriding arrow field                     | needs `ClassyStore`      | 1; 1                       |
| A base-class arrow field: `snapshot(k).bump === k.bump`                              | needs `ClassyStore`      | false                      |
| ... `snapshot(k).bump()`, two writes: notifications                                  | needs `ClassyStore`      | 2                          |
| `name` read on the store: base-class arrow, constructor arrow, literal, anonymous    | needs `ClassyStore`      | `bump`, `set`, `inc`, `go` |
| After a first read, `Object.freeze(raw)`: `store.f === fn`                           | throws                   | true                       |
| After a first read, a read-only definition through the store: `store.f === fn`       | throws                   | true                       |
| After a first read, a read-only definition on the raw object, behind the store       | throws                   | throws `TypeError`         |
| After a first read, the function itself frozen: `store.f === fn`                     | false                    | true                       |

## 5. Guaranteed behaviour

A guarantee is a rule. It is documented, and changing it is a breaking
change. The rule numbers are those of the decision document. Each rule is
split into statements a test can check, numbered `1.1`, `1.2` and so on.

**1. Subscribers.**

- 1.1 The subscribers of one node are called in the order they subscribed,
  synchronous and batched alike.
- 1.2 A subscriber is not called for a write made before `subscribe()`
  returned.
- 1.3 A subscriber is not called for a write made after its unsubscribe
  function returned, also when that write is in the round that is running.
- 1.4 A subscriber that throws leaves the write applied: the store and the
  next snapshot have it.
- 1.5 A subscriber that throws does not stop the other subscribers of the
  round, on its node or on another.
- 1.6 A subscriber that throws stays subscribed and is called for the next
  write.
- 1.7 The code that wrote is not told of a subscriber's error: a direct
  write, a method and `batch()` return as they would without it.
- 1.8 1.7 holds when `console.error` throws.

**2. Transactions.**

- 2.1 A method notifies synchronous subscribers once, when the outermost call
  returns.
- 2.2 The same for a setter.
- 2.3 The same for an array method on store state.
- 2.4 The same for `batch()`, also when its callback throws.
- 2.5 A transaction covers every store written inside it: a method of store A
  that writes store B notifies B's synchronous subscribers once, at its end.
- 2.6 An `async` method is a transaction up to its first `await`; each write
  after it notifies on its own.
- 2.7 A write that changes nothing notifies no one: an equal value, and a
  `delete` that removes nothing [D8].
- 2.8 Section 4 says which functions are methods.

**3. Delivery.**

- 3.1 A write made while synchronous subscribers are being called is
  delivered to them after the round that is running.
- 3.2 That write is delivered before the outermost write returns.
- 3.3 3.1 and 3.2 hold for up to 100 rounds.
- 3.4 A write made inside a batched subscriber is delivered to batched
  subscribers in the same microtask, after the round that is running.

**4. Getters.**

- 4.1 A getter is lazy: a write runs no getter body.
- 4.2 A getter returns the same result, by identity, while nothing it read
  through `this` changed.
- 4.3 A getter returns a correct result after anything it read through `this`
  changed.
- 4.4 An own-property check (`Object.hasOwn`, `hasOwnProperty`) is not a read
  for 4.2 and 4.3.
- 4.5 A cycle of getters throws, on the store and on a snapshot.
- 4.6 After a cycle throws, the other getters of the store keep working.
- 4.7 A getter that writes to the object it is computed on throws a
  `TypeError`, on the store and on a snapshot.
- 4.8 4.7 holds whichever way the write gets there: an assignment, a
  `delete`, a definition, a method the getter calls, a reference to the
  store, an arrow-function method of a `ClassyStore` subclass.

**5. Snapshots.**

- 5.1 The root of a snapshot is frozen.
- 5.2 Every plain object, array and reactive collection in a snapshot is
  frozen.
- 5.3 A class instance without the marker, a native `Map`, `Set` or `Date`,
  and a function are shared with the snapshot by reference.
- 5.4 An object a getter returns is not frozen.
- 5.5 A subtree that did not change and is not on a cycle keeps its snapshot
  object in the next snapshot.
- 5.6 Taking a snapshot runs no getter.

**6. Identity.**

- 6.1 One object has one proxy, however it is reached through the store's
  proxies.
- 6.2 6.1 holds across stores: an object in two stores is one proxy.
- 6.3 An object that was frozen before it reached the store is handed out as
  it is, with no proxy.
- 6.4 An object that is the value of a read-only property defined with that
  object as its value is handed out as it is, with no proxy.
- 6.5 `createClassyStore()` on a proxy, or on the raw object behind one,
  returns that proxy.
- 6.6 A value the store does not proxy reads back as itself. A function is the
  exception of 6.7.
- 6.7 A function that section 4 makes a method reads back through the store
  as one function for that object, the same on every read.
- 6.8 The raw object and its snapshots hold the function that was written.

**7. An object that has left the store.**

- 7.1 A proxy held after its object left the store takes reads and writes.
- 7.2 Its subscriptions keep working, and new ones can be made.
- 7.3 Its snapshots work.
- 7.4 The store it left is no longer told of its writes.
- 7.5 Put back, it is the same proxy.

**8. The native rules of an object hold through a store.**

- 8.1 Key order is the raw object's.
- 8.2 Holes stay holes.
- 8.3 A write the raw object refuses throws a `TypeError` in strict code.
- 8.4 `Reflect.set` and `Reflect.deleteProperty` return `false` for a refused
  write.
- 8.5 A sealed or frozen object keeps its meaning: a new key or a delete is
  refused, and for a frozen one a changed value too.

**9. Memory**, in a runtime that has `WeakRef`.

- 9.1 The library keeps no strong reference to a store that nothing else
  references.
- 9.2 It keeps no strong reference to a subscriber after its unsubscribe
  function was called.

**10. `persist`.**

- 10.1 A handle writes only after it has read.
- 10.2 A stored record is removed or replaced only when: its time has
  elapsed; `clear()` is called; a save follows a restore of that record; a
  save follows no record, a record with nothing to keep, or a record of a
  lower version when no `migrate` is given.
- 10.3 A record of a newer version is reported and not written over by the
  handle that read it.
- 10.4 The same for a record that the application's `migrate`, `merge` or
  `deserialize` failed on.
- 10.5 The same for a record whose read failed.
- 10.6 Outside the rule, and named by the guide: a tab that read before a
  newer build wrote, and does not sync, writes over the newer record; a
  `migrate` that returns a wrong result without throwing is saved at the next
  edit.
- 10.7 An edit made before or during the first read is kept in the store.
- 10.8 That edit is saved, unless the record is one the handle does not
  write over.
- 10.9 The first `save()` or `clear()` of a task reaches a synchronous storage
  before it returns.
- 10.10 After `dispose()` nothing is read, written or scheduled.

**11. Exports.**

- 11.1 Every export of section 2 exists with its signature of section 3.
- 11.2 The list may grow in a minor release. A type test that asserts an
  exact export list is a change detector.

**12. Error codes.**

- 12.1 The code in an error or a logged report is stable from 1.0. Renaming
  one is a breaking change; adding one is not [D35].

## 6. Unspecified behaviour

Everything not covered by a rule of section 5 or by a sentence in the
reference is unspecified, and may change in a minor release. A stage 1 test
of unspecified behaviour stays as a change detector, and its file says so
(decision document, "What 1.0 guarantees"). The file names are under `packages/classy-store/src/`.

| Unspecified                                                                                                                                                                                                     | Stage 1 tests that pin it today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The order in which different nodes, owners and stores are notified                                                                                                                                              | `core/core.characterisation.notifications.test.ts` ("a nested write notifies … from the written node up", "two containers that share a child", "batched subscribers of two stores …" for the order); `core/core.ownerOrder.test.ts`, all; `core/core.characterisation.detached.test.ts` ("a write through a held row reaches … each removed container", the order)                                                                                                                                                                                                                                          |
| How calls nest when a subscriber writes, which microtask a batched round runs in, and what an adapter of another store shows inside one delivery round                                                          | `core/core.characterisation.notifications.test.ts` ("one microtask serves the batched subscribers of every store", "a write to a second store notifies that store before the first store has finished", "is delivered by a microtask of its own"); `core/core.deliveryTurns.test.ts` ("the answering write after a microtask")                                                                                                                                                                                                                                                                              |
| Where a subscriber's error is reported, and the text of an error message after its code                                                                                                                         | `core/core.characterisation.notifications.test.ts` ("each subscriber that throws is reported on its own"); `core/core.characterisation.getters.test.ts` ("name a getter that reads itself twice", "name symbol-keyed getters by their description"); `core/core.gettersAcrossNodes.test.ts` ("is reported from the getter where it closes"); `core/core.characterisation.identity.test.ts` ("reject the raw object a store was created from", "reject a snapshot", for the message)                                                                                                                         |
| Whether a getter re-runs more often than rule 4 requires, and whether a thrown error is cached                                                                                                                  | `core/core.characterisation.getters.test.ts` ("skips the outer levels when the innermost getter was re-read first", the live and snapshot layers not sharing a result, "recomputes for an older snapshot read after a newer one", the re-runs beyond what was read under `this.obj.x` and arrays, "a root getter that reads a child getter re-runs", "the base body is not memoized on its own", "throw a new error on every read", "runs its body and throws a new error on every read"); `core/core.characterisation.identity.test.ts` ("a getter that reads the store through its own cycle recomputes") |
| What a getter does that writes to another object of the same store: a child, a parent or the root                                                                                                               | None found in the stage 1 map. `core/core.characterisation.getters.test.ts` "re-runs, writes and notifies on every read" and its group pin a getter that writes its own field, which rule 4 now forbids                                                                                                                                                                                                                                                                                                                                                                                                     |
| What a prototype that is changed after its first read through a store does                                                                                                                                      | `core/core.characterisation.invariants.test.ts` (the seven tests under "assigning `__proto__` or calling Object.setPrototypeOf on a store"); `core/core.characterisation.getters.test.ts` ("keeps returning the old result after the getter is redefined"). Both are defect rows today                                                                                                                                                                                                                                                                                                                      |
| What a function does when it is read from a snapshot and called                                                                                                                                                 | None found in the stage 1 map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| What reflection hands out: `Object.getOwnPropertyDescriptor(store, key)` and `structuredClone(store)`                                                                                                           | `core/core.characterisation.invariants.test.ts` ("Object.getOwnPropertyDescriptor hands out the raw object", "structuredClone throws a DataCloneError for a store")                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Anything reached through the raw object behind a store, and a write to the backing array of a reactive collection; among them a property made read-only on the raw object after the store handed out its method | `core/core.characterisation.detached.test.ts` ("a raw object changed directly while it was out of the store and written back keeps the snapshot"); `core/core.characterisation.invariants.test.ts` ("a nested object throws a TypeError when read, once its raw parent was frozen", a defect row). None for the backing arrays                                                                                                                                                                                                                                                                              |
| A store made from a function or from a typed array                                                                                                                                                              | `core/core.functionStores.test.ts`, all four; `core/core.typedArrayStores.test.ts`, both                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Behaviour in a runtime without `WeakRef` or `FinalizationRegistry`, beyond "it works"                                                                                                                           | `core/core.characterisation.noWeakRef.test.ts`; `core/core.noFinalizationRegistry.test.ts`; `core/core.noWeakRefMemory.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

A few behaviours that the decision document names as unspecified in its
entries are covered by the rows above:

- The order in which owners are notified [D3]: the first row.
- A getter over a prototype changed after its first read: decision 12 gives
  the answers for now. A getter added to a prototype for a key that was read
  as absent is seen and is not memoized. An override nearer the instance is
  not seen. A getter removed or replaced by a value is seen at its next
  recompute [D12]: the sixth row.
- A getter on a nested object that writes its parent or the root [D10]: the
  fifth row.
- Whether errors are cached [D10]: the fourth row.
- Writing to `_entries` or `_items` directly [D45]: the ninth row.

## 7. Error codes

Every error and every logged report reads `@codebelt/classy-store [code]:
facts`; an adapter's prefix names the adapter [D35]. The advice for each code
is on one page of the documentation, which also lists what 1.0 does not catch
(section 9) [D35, D36]. No error subclass and no `code` property is added
[D35]. "Proposed" marks a name this spec proposes where the decision document
decides that the error exists and does not name it; open points 1 to 3 say
what stage 4 settles first.

| Code               | Thrown or logged                                                     | Kind of error                   | Export                                                                                                                 | Condition                                                                                                                                              | Source                                     |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `getter-cycle`     | Thrown                                                               | `Error`                         | Any read of a getter: the store, `snapshot`, every adapter                                                             | Getters read each other in a cycle, on the live store or on a snapshot. Facts: the path. Today's text: `circular computed getter dependency`           | Today's message [D35], [D10]               |
| `not-a-store`      | Thrown                                                               | `Error`                         | `snapshot`, `subscribe`, `subscribeKey`, the React hooks, `createStoreHook`, `prepareStoreForHydration`, every adapter | The argument is not a store. Today's text: `object is not a store proxy`                                                                               | Today's message [D35]; proposed name       |
| `snapshot-cycle`   | Thrown in 0.11; no longer thrown once decision 44 lands              | `Error`                         | `snapshot`                                                                                                             | Today's text: `circular reference detected in snapshot`. See open point 1                                                                              | Today's message [D35, D44]; proposed name  |
| `getter-write`     | Thrown                                                               | `TypeError`                     | Any read of a getter, on the store and on a snapshot                                                                   | A getter writes to the object it is computed on, by any path. Facts: the field                                                                         | [D10]; proposed name                       |
| `delivery-loop`    | Logged once, in every build, where a subscriber's error is logged    | None: a report                  | `subscribe`, and every write                                                                                           | Delivery reached 100 rounds                                                                                                                            | [D13]                                      |
| `batch-async`      | Thrown before the callback is called, in every build                 | `TypeError`                     | `batch`                                                                                                                | The callback is a native `async` function                                                                                                              | [D16]                                      |
| `lost-write`       | Logged once, in development only                                     | None: a report                  | `snapshot`, and every adapter through it                                                                               | A field of the raw object changed without a write through the store. Facts: the field. Ships only on the condition of section 8                        | [D36]                                      |
| `snapshot-mutator` | Thrown                                                               | `TypeError`                     | `ReactiveMap.set`, `delete`, `clear`; `ReactiveSet.add`, `delete`, `clear`                                             | Called on a snapshot, through a tracking proxy, or on a collection its owner froze                                                                     | [D45]; proposed name                       |
| `persist-option`   | Thrown by `persist()` before it reads or writes                      | `TypeError`                     | `persist`                                                                                                              | A prototype key, a getter or a method in `properties`; a half-written transform; a bad `version`; a native `async` `migrate`. Facts: the option or key | [D22]; proposed name                       |
| `persist-record`   | Reported as `'parse'` to `onError`, or to `console.error` without it | An `Error` passed as the report | `persist`                                                                                                              | The library refuses a stored record: nothing to keep, or a newer version, or a `migrate` or `merge` result that is a thenable or not a plain object    | [D21]; proposed name                       |
| `persist-unread`   | The rejection of `save()`                                            | `Error`                         | `PersistHandle.save`                                                                                                   | `save()` before the first read has settled                                                                                                             | [D21]; proposed name                       |
| `persist-disposed` | The rejection of a call on a disposed handle                         | `Error`                         | `PersistHandle.save`, `clear`, `rehydrate`                                                                             | The handle was disposed. Today's text: `Persistence handle has been disposed`, without the prefix                                                      | Today's message [D35]; proposed name       |
| `restore-locked`   | Thrown before anything is written                                    | `TypeError`                     | `HistoryHandle.undo`, `redo`; the DevTools jump through the same restore                                               | The root of the store fails the check of `withHistory`, rule 6                                                                                         | [D30]; proposed name                       |
| `readonly-ref`     | Thrown                                                               | `TypeError`                     | Vue `useClassyStore`                                                                                                   | A write to `.value` of the returned ref                                                                                                                | [D38]; proposed name                       |
| `no-scope`         | Thrown                                                               | `Error`                         | Vue `useClassyStore`, Solid `useClassyStore`, Angular `injectClassyStore`                                              | No active effect scope (Vue), no live owner (Solid), no injection context and no `injector`, or a destroyed context (Angular). Facts: the adapter      | Today's messages [D35, D39]; proposed name |

Not library reports, and logged with their own text: a subscriber's error
and the rejection of an `async` subscriber [D14]; an error that `onError`
throws [D21]; a status listener's error, as today.

## 8. Limits

### Size

Gzipped bytes. The main entry is measured alone; every other entry is
measured with the main one and held to what it adds [D4].

| Entry                 | Today | Budget today | Estimate | Ceiling |
| --------------------- | ----: | -----------: | -------: | ------: |
| `.` (the main entry)  | 3,661 |        3,750 |    5,375 |   5,575 |
| `./utils` adds        | 2,686 |        2,750 |    4,216 |   4,350 |
| `./collections` adds  |   727 |          750 |      911 |     950 |
| `./react` adds        | 1,662 |        1,700 |    1,693 |   1,750 |
| `./vue` adds          |   280 |          300 |      369 |     400 |
| `./angular` adds      |   271 |          300 |      381 |     425 |
| `./solid` adds        |   312 |          335 |      346 |     375 |
| `./svelte` adds       |   182 |          200 |      182 |     200 |
| `./react/server` adds |   153 |          175 |      153 |     175 |

A ceiling is an estimate and a tripwire, not a measurement: the decided set
was never built as one [D4]. A change that would pass a ceiling is not
committed, and the question goes back to a decision [D4].

### Cost ratios

From `CONSTRAINTS.md`. Each is a ratio to a Proxy that only forwards, timed in
the same process.

| Ratio                                      | Bun | Node |
| ------------------------------------------ | --: | ---: |
| Read, against a forwarding Proxy           |  20 |  2.5 |
| Write, against a forwarding Proxy          | 3.2 |  1.7 |
| Cached getter, against a forwarding read   |  41 |  5.3 |
| Cached snapshot, against a forwarding read |  10 |  1.8 |

They are expected to hold, and that is a forecast: the whole set was never
timed [D4]. The core benchmark loads the built file with `NODE_ENV` not set,
so it measures the development path, and the limits hold there with the
development check in [D36].

### Conditions a change must meet to land

- **Decision 1.** The core benchmark gains two rows, a call of a method held
  in a field and a read and call of an arrow function held in a field,
  recorded before and after. The change lands only if `store.method` is
  inside the spread of the commit before it on both engines, and the new rows
  are no slower than 10% for the call and 1.6 times for the read and call.
  The baseline is the commit before, not stage 1 [D1].
- **Decision 9.** The form without the per-prototype cache is built first;
  the smaller form that leaves store creation inside the spread is kept [D9].
- **Decision 13.** On a quiet machine `store.write.sync` stays inside the
  spread of today's on both engines with the variant that reads the owners
  directly. If not, the plain queue is taken and the slowdown is stated in
  the reference [D13].
- **Decision 29.** The tests come first; stage 4 stops if the change in
  `history.ts` turns out larger than a few lines [D29].
- **Decision 36.** The benchmark first gains a row that takes one cached
  snapshot per task of the 1,000-row store, recorded without the check. The
  check lands only if that row with the check in stays below
  `snapshot.afterWrite` for the same store, on both engines. The figure goes
  into the decision record as the stated cost of the development path. If the
  check cannot meet that, it does not ship in 1.0 [D36].

### How a budget moves in stage 4 [D4]

1. The first commit is tooling only. `budgets.json` gets a `ceiling` beside
   each budget, and the size script fails when a budget is above its ceiling
   or a measured size above its budget.
2. The floor guard refuses a commit that changes an existing ceiling together
   with anything else. The first commit, which adds the ceilings, is the one
   exception. A ceiling changes only in a commit that holds the new number and
   the decision record's reason for it, and nothing more.
3. The floor guard reads `budgets.json` and `limits.json` as well as
   `CONSTRAINTS.md`, and blocks a budget or a limit that rises unless the same
   commit adds a line to the decision record.
4. The guard walks the commits from the merge base with `main` to the head
   and judges each against the one before. Its own file is in its scope for a
   rule that is removed or loosened. Its own patterns, in that file and in the
   fixtures of its tests, are not findings; the fixtures are put together when
   a test runs.
5. The first commit adds tests for the size script's two failures and for
   each rule of the guard, run on throwaway repositories the test makes.
6. A commit that grows an entry sets that entry's budget to its new measured
   size plus 2%, adds a line with the measured size to the decision record,
   and stays under the ceiling.
7. When stage 4 ends, every budget is the final measured size plus 2%. The
   baselines are recorded again. A cost limit that can be tightened is
   tightened to the highest new run times 1.2; one that would have to rise
   needs a line in the decision record.
8. A development-only check is guarded by an inline read of
   `process.env.NODE_ENV` at its call site, after a test that is cheap and
   almost always false, and behind `typeof process`. That form becomes a floor
   rule of `CONSTRAINTS.md`, held by a test that bundles the built file for
   production and asserts that no development text and no `console.warn` is
   left in it [D36].
9. In the same first commit, the two sentences of `CONSTRAINTS.md` about the
   owner ("that the owner approved", "The owner has not reviewed it yet") are
   brought in line with the plan's first ground rule [D4].

## 9. Documentation that changes

The checklist for decision 34. Each change goes in the commit of the code
change it describes; where no code changes, in stage 5 [D34]. Pages are under
`website/content/docs/` unless another path is given.

| Page                                                                    | Sentence or section                                                                                                                                                                                                                                                                                                                                                                            | Decision           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `API_REFERENCE.md`, entry table                                         | Add `ClassyStore`, `ReactiveMapSnapshot`, `ReactiveSetSnapshot`; the Vue return type; the Angular `options`                                                                                                                                                                                                                                                                                    | D11, D45, D38, D39 |
| `API_REFERENCE.md`, adapters paragraph                                  | "Vue returns a `Ref<Snapshot<T>>` backed by `shallowRef`" becomes a read-only custom ref that throws on a write                                                                                                                                                                                                                                                                                | D37, D38           |
| `API_REFERENCE.md`, `createClassyStore`                                 | "Prototype methods … arrow-function fields cannot be rebound" becomes the rule of section 4, with the statements of section 4, "What follows from it", and `ClassyStore`                                                                                                                                                                                                                       | D1, D11            |
| `API_REFERENCE.md`, `createClassyStore`                                 | "A live getter that reads an absent field recomputes on subsequent reads" goes                                                                                                                                                                                                                                                                                                                 | D7                 |
| `API_REFERENCE.md`, `createClassyStore`                                 | Make a property read-only through the store, not on the raw object                                                                                                                                                                                                                                                                                                                             | D1                 |
| `API_REFERENCE.md`, `createClassyStore`                                 | One sentence: a setter is a transaction                                                                                                                                                                                                                                                                                                                                                        | D15                |
| `API_REFERENCE.md`, `createClassyStore`                                 | An array in a store carries its indices and `length` only                                                                                                                                                                                                                                                                                                                                      | D34                |
| `API_REFERENCE.md`, `snapshot`                                          | A spread or a serialised snapshot carries data, not computed values (same sentence in the 1.0 changelog entry)                                                                                                                                                                                                                                                                                 | D34, D43           |
| `API_REFERENCE.md`, `subscribe`                                         | At the top: the callback runs in a microtask, `{sync: true}` runs it before the write returns, and it receives no arguments. The rules of section 5, rule 1. Adapter values of another store may lag inside one delivery round                                                                                                                                                                 | D17, D34, D13, D14 |
| `API_REFERENCE.md`, `batch`                                             | The paragraph on `batch(async …)` becomes the refusal; an `async` method is a transaction up to its first `await`                                                                                                                                                                                                                                                                              | D16                |
| `API_REFERENCE.md`, `PROXYABLE`                                         | "their snapshots keep the class prototype" becomes "are instances of the class"; `static [PROXYABLE] = false` is opaque on purpose                                                                                                                                                                                                                                                             | D43, D11           |
| `API_REFERENCE.md`, `Snapshot<T>`                                       | Tuples stay tuples; "Methods keep their signatures" gets the exception for collections                                                                                                                                                                                                                                                                                                         | D45                |
| `API_REFERENCE.md`, `persist`                                           | The `onError` line: the third argument and the default report                                                                                                                                                                                                                                                                                                                                  | D21                |
| `API_REFERENCE.md`, `withHistory`                                       | "changed fields are replaced with mutable copies" becomes the restore in place                                                                                                                                                                                                                                                                                                                 | D30                |
| `API_REFERENCE.md`, `devtools`                                          | The default of `enabled`                                                                                                                                                                                                                                                                                                                                                                       | D27                |
| New page, "Errors and warnings"                                         | One heading per code of section 7, with its advice. Beside the codes, what 1.0 does not catch: a native `Map` or `Set` in a store, an unmarked nested class instance, a `Date` changed in place, a getter that reads another store or a static, a getter result that is mutated, a named property on an array, an own-property check inside a getter, a prototype changed after its first read | D35, D36           |
| `TUTORIAL.md`, "Keep mutations inside the proxy"                        | "using `Object.defineProperty` to change state bypasses assignment/deletion tracking" goes                                                                                                                                                                                                                                                                                                     | D2                 |
| `TUTORIAL.md`, "Keep mutations inside the proxy"                        | "Circular references in traversed state are rejected by `snapshot()`" is reversed; the cost of a cycle and the alternatives (hold the parent's id, or hold the parent in an object the store does not proxy)                                                                                                                                                                                   | D44                |
| `TUTORIAL.md`, "Getters appear as own fields on snapshots"              | The section is rewritten: class getters are not own keys; getters of an object literal and of a class differ on a snapshot                                                                                                                                                                                                                                                                     | D43                |
| `TUTORIAL.md`, "Keep computed getters pure"                             | "In a snapshot getter, `Object.keys(this)` can return an empty array … `key in this` can miss a field" goes; use `in`, not an own-property check; a getter must not write to the store it reads; a getter that reads another store: hold that store as a field                                                                                                                                 | D43, D7, D10       |
| `TUTORIAL.md`, "Don't use arrow functions for methods"                  | Rewritten around `ClassyStore` and section 4; the sentences of decision 11 (a callback compared on a snapshot, an arrow method called on the store, `StrictMode`, a class that extends another class)                                                                                                                                                                                          | D11, D1            |
| `TUTORIAL.md`, `#private`                                               | A `#private` field is never state                                                                                                                                                                                                                                                                                                                                                              | D11                |
| `TUTORIAL.md`, "Reactive nested classes"                                | "their snapshots keep the class prototype"                                                                                                                                                                                                                                                                                                                                                     | D43                |
| `TUTORIAL.md`, "Frozen objects are values"                              | The raw object must not be frozen once a store holds it                                                                                                                                                                                                                                                                                                                                        | D9                 |
| `TUTORIAL.md`, subscriptions                                            | A subscription on a container that has left the store lasts while the caller holds the store, the container or the unsubscribe function                                                                                                                                                                                                                                                        | D3                 |
| `ARCHITECTURE.md`                                                       | The cache of methods, which is per object                                                                                                                                                                                                                                                                                                                                                      | D1                 |
| `PERSIST_TUTORIAL.md`, `skipHydration`                                  | "It does not delay writes" is reversed: nothing is saved until `rehydrate()`                                                                                                                                                                                                                                                                                                                   | D21                |
| `PERSIST_TUTORIAL.md`, migration                                        | "Migration and hydration do not automatically rewrite storage" gets the one exception, the expiry stamp                                                                                                                                                                                                                                                                                        | D24                |
| `PERSIST_TUTORIAL.md`, restoration                                      | "Synchronous subscribers can also edit a different field during restoration" becomes one notification after the whole record                                                                                                                                                                                                                                                                   | D23                |
| `PERSIST_TUTORIAL.md`, errors                                           | `onError` with the handle and `clear()`; the default report; the kinds of record; a handle that does not write, what unblocks it, and that its edits are restored over; a record too deep to restore has nothing to keep and is replaced at the next save; the two losses that stay                                                                                                            | D21, D23           |
| `PERSIST_TUTORIAL.md`, setup                                            | Call `persist()` after the store is constructed, never in a constructor; on the client call `prepareStoreForHydration()` first                                                                                                                                                                                                                                                                 | D19, D41           |
| `PERSIST_TUTORIAL.md`, cross-tab                                        | An event from another storage area is ignored                                                                                                                                                                                                                                                                                                                                                  | D25                |
| `PERSIST_ARCHITECTURE.md`                                               | "Invalid envelope … skipped silently" becomes a report                                                                                                                                                                                                                                                                                                                                         | D21                |
| `HISTORY_TUTORIAL.md`                                                   | "allow the restoration microtask to finish before making another edit" goes                                                                                                                                                                                                                                                                                                                    | D28                |
| `HISTORY_TUTORIAL.md`                                                   | Function fields are restored by reference; a jump by JSON touches no function field                                                                                                                                                                                                                                                                                                            | D29                |
| `HISTORY_TUTORIAL.md`                                                   | A history records one store; an object two stores share is undone in both; a move between two stores is undone by a history on a store that holds both; a jump by JSON restores data, not class instances                                                                                                                                                                                      | D30                |
| `DEVTOOLS_TUTORIAL.md`                                                  | The `enabled` row (default `true`) and "Disable in production"; the builds in which the default is off; the extension receives every state, so a store with secrets passes `enabled: false`                                                                                                                                                                                                    | D27                |
| `DEVTOOLS_TUTORIAL.md`                                                  | Entries named after the method; the `STORE_UPDATE` examples                                                                                                                                                                                                                                                                                                                                    | D27                |
| `DEVTOOLS_TUTORIAL.md`                                                  | The panel shows the getter values of the root store only                                                                                                                                                                                                                                                                                                                                       | D43                |
| `REACTIVE_COLLECTIONS_TUTORIAL.md`                                      | "Primitive members use `Object.is`, which distinguishes `0` and `-0`" changes; two snapshots of one object are one member; the difference from a list, with the test that pins both                                                                                                                                                                                                            | D42, D6            |
| `REACTIVE_COLLECTIONS_TUTORIAL.md`                                      | Mutators on a snapshot throw; writing to `_entries` or `_items` is unspecified; `size` is not in `Object.keys` or JSON of a snapshot                                                                                                                                                                                                                                                           | D45, D43           |
| `VUE.md`                                                                | The read-only custom ref; `batch()` named beside the synchronous timing                                                                                                                                                                                                                                                                                                                        | D37, D38, D34      |
| `SVELTE.md`                                                             | A section on runes; the example value is named `snap`, not `state`; `batch()`                                                                                                                                                                                                                                                                                                                  | D40, D37           |
| `SOLID.md`                                                              | `batch()`; the object passed to `createClassyStore()` is the store                                                                                                                                                                                                                                                                                                                             | D37, D34           |
| `ANGULAR.md`                                                            | The `injector` option; `batch()`                                                                                                                                                                                                                                                                                                                                                               | D39, D37           |
| `REACT_SSR.md`                                                          | On the client, `prepareStoreForHydration()` before `persist()`                                                                                                                                                                                                                                                                                                                                 | D41                |
| The other items of the stage 2 list of undisputed documentation changes | A frozen value needs the whole value frozen; an unmarked class instance is shared with every snapshot; `persist` recipes and transforms, unknown stored keys, stored data as untrusted input with `merge` as the place to validate it                                                                                                                                                          | D34                |
| The 1.0 changelog entry                                                 | A spread or a serialised snapshot carries no computed values                                                                                                                                                                                                                                                                                                                                   | D34, D43           |
| `CONTRIBUTING.md`                                                       | Why `proxy-compare` is pinned to an exact version                                                                                                                                                                                                                                                                                                                                              | D33                |
| `README.md`, `CLAUDE.md`                                                | "about 3.7 KB" becomes the measured figure, in stage 5                                                                                                                                                                                                                                                                                                                                         | D4                 |

## 10. How stage 4 works

By reference:

- **Commands.** The ones in `CLAUDE.md`: `bun run checkall`,
  `bun run test:coverage`, `bun run check:floor`, `bun run size`,
  `bun run benchmark:core --check` and `bun run benchmark:core:node --check`,
  `bun run test:mutation` before a commit that touches a target file,
  `bun run typecheck` (never `bunx tsc`), `bun run check:package`.
- **The bar.** `CONSTRAINTS.md`, with the ceilings of section 8.
- **Test first.** Each change starts with the tests that pin the new
  behaviour; a stage 1 test that pins removed behaviour changes in the same
  commit.
- **One change per commit**, each measured against the commit before.
- **The order** of the decision document's "The order for stage 4", steps 1
  to 12, as the task list refines it. Stage 4 writes each change again from
  its decision; it applies no spike patch.
- **Dead code** that a change makes dead goes in that change's commit [D20].
- **Documentation** goes with the change it describes (section 9) [D34].

**Always**, in every commit:

- Tests first, and the full unit suite, lint and typecheck pass.
- Coverage stays at 100% of lines and functions per file.
- `bun run size` passes, under the ceilings; a grown entry sets its budget to
  the measured size plus 2% and adds a line to the decision record.
- The core benchmark checks pass on both engines; a timing outside the spread
  is reported with numbers.
- `bun run check:floor` passes, and is run before each push.
- A new message adds its code and its line on the codes page [D35].
- Code made dead by the change is removed in it [D20].
- The documentation of section 9 that belongs to the change is in it.

**Never:**

- Merge into `main`, release, publish, tag, or run the release workflow.
- Lower a number of `CONSTRAINTS.md`, or loosen a rule there, without a
  decision record.
- Commit spike code.
- Change a ceiling together with anything else [D4].

**Decide again before doing:** anything this spec does not cover, anything
in section 12 that it marks as needing a decision, and any change that would
pass a ceiling or a cost limit [D4].

## 11. Done means

Stage 4 is finished when each of these holds:

1. `bun run checkall` passes on the branch head.
2. `bun run test:coverage` passes: 100% of lines and functions in every
   source file.
3. `bun run check:floor` passes for every commit from the merge base with
   `main` to the head.
4. `bun run size` passes; `budgets.json` has a `ceiling` per entry, and every
   budget is the final measured size plus 2%, at or under its ceiling.
5. `bun run benchmark:core --check` and `bun run benchmark:core:node --check`
   pass, the baselines are recorded again, and `limits.json` is tightened
   where it can be (section 8).
6. `bun run test:mutation` leaves no unexplained surviving mutant in the
   target files.
7. `bun run check:package` passes.
8. The workflows' browser, React, Vue, Svelte, Angular, Solid and Next.js
   suites pass on the pull request, each adapter change with its packed-app
   and browser suite [D37].
9. The production bundle test of the floor rule for development-only checks
   passes [D36].
10. The type tests list every export of section 2, and a type test covers
    each changed signature of section 3: `batch`, `Snapshot` of a tuple and of
    each collection, Vue's return type, Angular's `options`, `onError` with
    three arguments.
11. A search of `packages/classy-store/src` for each 0.11 message text of
    section 7 finds none without its code.
12. The "Errors and warnings" page exists with every code of section 7.
13. Every row of section 9 is done, or is listed for stage 5 where no code
    changes.
14. Each stage 1 test file that pins an item of section 6 says that it is a
    change detector.
15. Each decision with "Stage 4: yes" has its commit or commits; decision 32
    has only the pins and the permissions; decision 46 has none.
16. Every third-party action in every workflow is pinned to a commit, a
    Dependabot configuration keeps the pins current, and the three workflows
    without permissions declare `contents: read` [D32]. CI has a `bun audit`
    step that reports and does not fail [D33].
17. The decision record under `docs/decisions/` holds a line with the
    measured size for each budget that moved, and the figure of the
    development path if the `lost-write` check landed [D4, D36].
18. Nothing is merged into `main`, and no tag or release exists for 1.0.

## 12. Open points

### A. What the decision document leaves unclear, or this spec could not resolve

Each needs a decision before stage 4 writes the code it touches.

1. **`snapshot-cycle`.** Decision 35 gives a code to each of the three
   messages the library has today, one of which is `circular reference
   detected in snapshot`. Decision 44 removes that throw. Decision 35 also
   says "the cycle check on snapshots" stays in every build, which this spec
   reads as the getter cycle on a snapshot of decision 10. Decide, before step
   2 of the order, whether `snapshot-cycle` is created in step 2 and retired
   in step 5, or never created, and whether a retired code is listed on the
   codes page.
2. **Messages that exist today beyond the three.** The Vue, Solid and Angular
   scope errors, and `Persistence handle has been disposed`, which has no
   prefix. Decision 35 says every error carries a code but names codes only
   for the three. This spec proposes `no-scope` and `persist-disposed`.
3. **Code names the decision document does not give.** It names
   `getter-cycle`, `delivery-loop`, `batch-async` and `lost-write`. It decides
   that these exist without naming them: the getter write [D10], the
   collection mutator [D45], the `persist` option check [D22], the `persist`
   record reports [D21], the Vue ref write [D38], the Angular context error
   [D39], the restore that the root refuses [D30], and the existing "not a
   store" message [D35]. Section 7 proposes a name for each. Codes are stable
   from 1.0, so the names are settled before step 2 creates the codes page.
4. **What a `persist` report carries.** Decision 21 says that without
   `onError` the report goes to `console.error` "with its code". It does not
   say what `onError` and that default receive when the error is not the
   library's: a `migrate`, `merge` or `deserialize` that throws, the
   `SyntaxError` of `JSON.parse`, a storage that throws. Either the thrown
   value as it is, or a library error with a code that carries it. It does not
   say either whether `save()` before the first read is also reported through
   `onError` (the build reported it as `'write'`; the decision says only that
   it rejects), or what the facts of `persist-record` are.
5. **The names of the two collection snapshot types.** Decision 45 says "two
   exported types" and does not name them. `ReactiveMapSnapshot` and
   `ReactiveSetSnapshot` are the names of the build it cites.
6. **How `batch()` tells a native `async` function.** Decision 16 does not
   say. Decision 22 says, for `persist`, that `Symbol.toStringTag` is compared
   with `'AsyncFunction'` exactly because a looser test refused the test
   runner's mock functions. Stage 4 tests that a mock function is accepted by
   `batch()`.
7. **The channel of `lost-write`.** Decision 36 says the library "logs" it.
   The floor rule's test asserts that no `console.warn` is left in a
   production bundle, which suggests `console.warn`. Section 7 says "logged".
8. **A guarantee and an unspecified item overlap.** Rule 3 guarantees that a
   write made inside a batched subscriber is delivered to batched subscribers
   in the same microtask. The unspecified list includes "which microtask a
   batched round runs in". This spec keeps rule 3 as guaranteed and reads the
   unspecified item as everything rule 3 does not state. Decide which wins.
9. **A generator method and rule 2.** Decision 1 makes a generator method a
   method. Its body runs on `next()`, after the call returned, so two writes
   in it notify twice, as in 0.11. Rule 2 says a method notifies once and
   names only the `async` exception. Decide whether the reference states it
   like the `async` rule or the case goes into the unspecified list.
10. **Rule 6 and functions.** Rule 6 says a value the store does not proxy
    reads back as itself; rule 5 counts a function as such a value; decision
    1 hands a function in a field out as a method. This spec reads rule 6's
    sentence about methods as the exception (statements 6.6 and 6.7).
11. **Rule 10 and a handle that does not write.** Rule 10 says the first
    `save()` or `clear()` of a task reaches a synchronous storage before it
    returns. Decision 21 makes `save()` reject before the first read and while
    the handle does not write. This spec reads statement 10.9 as holding for
    `save()` on a handle that writes, and for `clear()` always.
12. **Vue on the server.** Decision 38 says the adapter subscribes to nothing
    on the server. It does not say how the adapter knows it is on the server,
    or whether the effect scope check of today still applies there. Stage 4
    takes both from the adapter report it cites, and writes the test first.
13. **Types that are not exported.** The `Synchronous<T>` type of `batch()`
    and the options object of `injectClassyStore` are written out in this
    spec and not exported, because the decision document adds neither to the
    export list. A wrapper generic over `batch()` then needs a cast, as
    decision 16 says.
14. **A DevTools jump on a frozen root.** Decision 30 makes the shared
    restore throw `restore-locked` when the root fails its check. A jump runs
    inside the listener of the extension's messages; what the user sees of
    that throw is not stated, and the case was not run.

### B. What the decision document leaves unverified, and what stage 4 does first

15. **Decision 1.** Not run: the browser, framework and mutation suites; the
    `devtools` naming reading the key; a component that calls an arrow method
    taken from a snapshot; a compiler's real ES5 output (the rows were written
    by hand). First: the two benchmark rows, recorded before the change, and
    the tests of the table in section 4.
16. **Decisions 1 and 19, 21 to 24.** Decided after the last review and read
    by no reviewer. They are the first things the independent review of stage
    4 reads.
17. **Decision 4.** The decided set was never built as one, and the cost
    limits are a forecast. First: the tooling commit; then every commit is
    measured against the one before.
18. **Decision 7.** Its figures are for a design no spike built in decision
    10's single shape. Stage 4 takes its figures from its own build.
19. **Decision 9.** The form without the per-prototype cache was not
    measured. Stage 4 builds it first.
20. **Decision 10.** The rows of the snapshot getter that reaches the live
    store were not built on top of decision 1 or decision 43. Stage 4 writes
    this part in step 4 on today's snapshot layer and runs its rows again as
    tests after step 5.
21. **Decision 11.** The 17 compilations of a subclass ran on an earlier form
    of the rule for functions. Stage 4 runs them again on the real code.
22. **Decision 12.** Not measured: a read of an absent key once the table
    holds 256 keys. Not built: this form on top of the getter changes of
    decision 10.
23. **Decision 13.** Stage 4 confirms on a quiet machine that
    `store.write.sync` stays inside the spread with the variant (section 8).
24. **Decision 14.** The guard on the report was not spiked. Stage 4 writes
    its test first.
25. **Decision 20.** The claim that the ternary in `activeTracker()` must
    stay rests on a patch that changed several things; it is timed alone
    first. The two React cache traps are deleted only if no unit test and no
    React suite fails.
26. **Decision 21.** Three parts were not built: a record nested too deep has
    nothing to keep, the removal of the record in another tab lets a handle
    write again, and the expiry stamp only for a finite `expireIn`. Not run: a
    real `pagehide`, a real second tab, the browser suites.
27. **Decision 24.** A real page unload was not tested; stage 4 tests it in
    the browser suite. No test pins either write-back; stage 4 writes both.
28. **Decision 27.** Passing the key to the naming function was not built;
    stage 4 first tests an entry for an arrow function written to a new key
    and for one assigned in a constructor. Not verified: the entry ids the
    Redux DevTools extension sends back. Read from the code, not run: an
    application that loads `./utils` as ESM and as CommonJS and connects
    `devtools` from both gets `STORE_UPDATE` names from one copy.
29. **Decision 29.** The change in `history.ts` was not built. Stage 4 writes
    the tests first (a replaced callback, a callback whose key was deleted, a
    function field that held another function at the undo, a jump by JSON on
    a store whose methods are own fields) and stops if the change is larger
    than a few lines.
30. **Decision 30.** The spike's check counts a function field as a key to
    delete; stage 4 tests the jump by JSON on a sealed store with own-field
    methods first. Not timed on Node. Not run: a DevTools jump on a frozen
    root.
31. **Decision 35.** The count of 29 assertions in 15 test files that match
    today's text comes from a search, not a run.
32. **Decision 36.** The once-per-task form was not built, and the check was
    measured always on. Stage 4 adds the benchmark row first and measures the
    check behind the guard (section 8).
33. **Decision 37.** No adapter's packed-app and browser suite was run.
    Each adapter commit runs its own.
34. **Decision 38.** The type was not compiled against Vue 3.2.0, the floor
    of the peer range; stage 4 does that first. The throwing setter was not
    spiked.
35. **Decision 39.** The adapter's own context check was not spiked.
36. **Decision 42.** A tracked lookup through the index path was not timed.
37. **Decision 43.** The 239 bytes and the 14 tests are a forecast from a
    build on the snapshot layer that decision 10 changes first. Not run: the
    real Redux DevTools extension. The risk is the React tracking path, where
    a tracked read and a plain read share one cached result.
38. **Decision 44.** What the Redux DevTools extension does with a cyclic
    state was not checked.
