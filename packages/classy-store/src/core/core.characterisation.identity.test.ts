import {describe, expect, it, mock} from 'bun:test';
import {batch, createClassyStore, snapshot, subscribe} from '../index';

// Characterisation tests for identity: which object you get back, and who is
// told, when the same raw object, proxy or store is reached by more than one
// path. They pin what the library does today and use the public entry only, so
// they keep their meaning if the internals are rewritten.
//
// A test under a `FINDING:` comment pins behaviour that looks like a bug, a
// silent failure or a surprise. It records that behaviour; it does not endorse
// it.

/** Flush the microtask that delivers batched notifications. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const NOT_A_STORE = '@codebelt/classy-store: object is not a store proxy';
const CIRCULAR =
  '@codebelt/classy-store: circular reference detected in snapshot';

describe('createClassyStore() called again', () => {
  it('returns the same proxy for the same raw object', () => {
    const raw = {count: 0};
    const first = createClassyStore(raw);
    const second = createClassyStore(raw);

    expect(second).toBe(first);
    expect(first).not.toBe(raw);
  });

  it('keeps the state, subscribers and snapshots of the first call', () => {
    const raw = {count: 0};
    const first = createClassyStore(raw);
    const listener = mock(() => {});
    subscribe(first, listener, {sync: true});
    first.count = 1;

    const second = createClassyStore(raw);

    expect(second.count).toBe(1);
    second.count = 2;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(first.count).toBe(2);
    expect(snapshot(second)).toBe(snapshot(first));
    expect(snapshot(first)).toEqual({count: 2});
  });

  it('returns a store proxy that is passed in', () => {
    const store = createClassyStore({count: 0});

    expect(createClassyStore(store)).toBe(store);
  });

  it('returns the nested proxy for a nested proxy and for the raw object behind it', () => {
    const rawChild = {n: 0};
    const store = createClassyStore({child: rawChild});
    const nested = store.child;

    expect(createClassyStore(nested)).toBe(nested);
    expect(createClassyStore(rawChild)).toBe(nested);
  });

  it('gives a raw object wrapped on its own the same proxy inside a store built around it later', () => {
    const rawChild = {n: 0};
    const child = createClassyStore(rawChild);
    const outer = createClassyStore({child: rawChild});
    const onOuter = mock(() => {});
    subscribe(outer, onOuter, {sync: true});

    child.n = 1;

    expect(outer.child).toBe(child);
    expect(onOuter).toHaveBeenCalledTimes(1);
  });

  it('turns a snapshot into a separate store that does not follow the store it came from', () => {
    const store = createClassyStore({count: 0, child: {n: 0}});
    const snap = snapshot(store);

    const fromSnapshot = createClassyStore(snap);
    store.count = 9;

    expect(fromSnapshot).not.toBe(store);
    expect(fromSnapshot).not.toBe(snap);
    expect(fromSnapshot.count).toBe(0);
    // Its nested content is the snapshot's own frozen object, …
    expect(fromSnapshot.child).toBe(snap.child);
    // … but snapshot() of it builds a new root around that content.
    expect(snapshot(fromSnapshot)).not.toBe(snap);
    expect(snapshot(fromSnapshot)).toEqual({count: 0, child: {n: 0}});
    expect(snapshot(fromSnapshot).child).toBe(snap.child);
  });
});

describe('snapshot() and subscribe() given something other than the proxy', () => {
  it('reject the raw object a store was created from', () => {
    const raw = {count: 0, child: {n: 0}};
    createClassyStore(raw);

    expect(() => snapshot(raw)).toThrow(NOT_A_STORE);
    expect(() => subscribe(raw, () => {})).toThrow(NOT_A_STORE);
    expect(() => snapshot(raw.child)).toThrow(NOT_A_STORE);
  });

  it('reject a snapshot', () => {
    const snap = snapshot(createClassyStore({count: 0}));

    expect(() => snapshot(snap)).toThrow(NOT_A_STORE);
    expect(() => subscribe(snap, () => {})).toThrow(NOT_A_STORE);
  });
});

describe('the same raw object held in two stores', () => {
  it('is read back from both stores as one proxy', () => {
    const shared = {count: 0};
    const one = createClassyStore({shared, label: 'one'});
    const two = createClassyStore({shared, label: 'two'});

    expect(two.shared).toBe(one.shared);
    expect(one.shared).not.toBe(shared);
  });

  it('notifies the synchronous subscribers of both stores once, whichever store it is written through', () => {
    const shared = {count: 0};
    const one = createClassyStore({shared});
    const two = createClassyStore({shared});
    const onOne = mock(() => {});
    const onTwo = mock(() => {});
    subscribe(one, onOne, {sync: true});
    subscribe(two, onTwo, {sync: true});

    one.shared.count = 1;
    expect(onOne).toHaveBeenCalledTimes(1);
    expect(onTwo).toHaveBeenCalledTimes(1);

    two.shared.count = 2;
    expect(onOne).toHaveBeenCalledTimes(2);
    expect(onTwo).toHaveBeenCalledTimes(2);
  });

  it('has one snapshot, shared by both root snapshots before and after a change', () => {
    const shared = {count: 0};
    const one = createClassyStore({shared, own: {v: 1}});
    const two = createClassyStore({shared, own: {v: 2}});
    const beforeOne = snapshot(one);
    const beforeTwo = snapshot(two);
    expect(beforeOne.shared).toBe(beforeTwo.shared);

    two.shared.count = 5;

    const afterOne = snapshot(one);
    const afterTwo = snapshot(two);
    expect(afterOne.shared).toBe(afterTwo.shared);
    expect(afterOne.shared).toEqual({count: 5});
    // The store that was not written through gets a new root snapshot too, …
    expect(afterOne).not.toBe(beforeOne);
    // … keeps what it does not share, and its earlier snapshot is unchanged.
    expect(afterOne.own).toBe(beforeOne.own);
    expect(beforeOne.shared).toEqual({count: 0});
  });

  it('keeps notifying the store that still holds it after the other store drops it', () => {
    const shared = {count: 0};
    const one = createClassyStore<{shared?: {count: number}}>({shared});
    const two = createClassyStore({shared});
    const onOne = mock(() => {});
    const onTwo = mock(() => {});
    subscribe(one, onOne, {sync: true});
    subscribe(two, onTwo, {sync: true});

    delete one.shared;
    expect(onOne).toHaveBeenCalledTimes(1);
    expect(onTwo).not.toHaveBeenCalled();

    two.shared.count = 1;
    expect(onOne).toHaveBeenCalledTimes(1);
    expect(onTwo).toHaveBeenCalledTimes(1);
    expect(Object.keys(snapshot(one))).toEqual([]);
    expect(snapshot(two)).toEqual({shared: {count: 1}});
  });

  it('joins the node it already has when it is assigned into a second store later', () => {
    const shared = {count: 0};
    const one = createClassyStore({shared});
    const two = createClassyStore<{shared: {count: number} | null}>({
      shared: null,
    });
    two.shared = shared;
    const onOne = mock(() => {});
    const onTwo = mock(() => {});
    subscribe(one, onOne, {sync: true});
    subscribe(two, onTwo, {sync: true});

    one.shared.count = 1;

    expect(two.shared).toBe(one.shared);
    expect(onOne).toHaveBeenCalledTimes(1);
    expect(onTwo).toHaveBeenCalledTimes(1);
  });

  it('invalidates a getter in one store when it is written through the other', () => {
    const shared = {count: 1};
    let runs = 0;
    const one = createClassyStore({
      shared,
      get doubled() {
        runs++;
        return this.shared.count * 2;
      },
    });
    const two = createClassyStore({shared});
    expect(one.doubled).toBe(2);
    expect(one.doubled).toBe(2);
    expect(runs).toBe(1);

    two.shared.count = 5;

    expect(one.doubled).toBe(10);
    expect(runs).toBe(2);
    expect(snapshot(one).doubled).toBe(10);
  });

  it('is one notification per store for a batch that writes it through both stores', () => {
    const shared = {count: 0};
    const one = createClassyStore({shared});
    const two = createClassyStore({shared});
    const onOne = mock(() => {});
    const onTwo = mock(() => {});
    subscribe(one, onOne, {sync: true});
    subscribe(two, onTwo, {sync: true});

    batch(() => {
      one.shared.count = 1;
      two.shared.count = 2;
    });

    expect(onOne).toHaveBeenCalledTimes(1);
    expect(onTwo).toHaveBeenCalledTimes(1);
  });
});

describe('a store inside a store', () => {
  type Inner = {count: number};

  it('is read back as itself once assigned as a property, and only the outer store is told of the assignment', () => {
    const inner = createClassyStore({count: 0});
    const outer = createClassyStore<{label: string; inner: Inner | null}>({
      label: 'outer',
      inner: null,
    });
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(inner, onInner, {sync: true});

    outer.inner = inner;

    expect(outer.inner).toBe(inner);
    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onInner).not.toHaveBeenCalled();
  });

  it('notifies the subscribers of both stores once for a write through either path', () => {
    const inner = createClassyStore({count: 0});
    const outer = createClassyStore<{label: string; inner: Inner | null}>({
      label: 'outer',
      inner: null,
    });
    outer.inner = inner;
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(inner, onInner, {sync: true});

    inner.count = 1;
    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onInner).toHaveBeenCalledTimes(1);

    outer.inner.count = 2;
    expect(onOuter).toHaveBeenCalledTimes(2);
    expect(onInner).toHaveBeenCalledTimes(2);
    expect(inner.count).toBe(2);
  });

  it('does not hear about a write to the outer store', () => {
    const inner = createClassyStore({count: 0});
    const outer = createClassyStore<{label: string; inner: Inner | null}>({
      label: 'outer',
      inner: null,
    });
    outer.inner = inner;
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(inner, onInner, {sync: true});

    outer.label = 'renamed';

    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onInner).not.toHaveBeenCalled();
  });

  it('has one snapshot: the outer snapshot holds the snapshot of the inner store', () => {
    const inner = createClassyStore({count: 0});
    const outer = createClassyStore<{label: string; inner: Inner | null}>({
      label: 'outer',
      inner: null,
    });
    const innerBefore = snapshot(inner);

    outer.inner = inner;

    // Being embedded leaves the inner store's own snapshot as it was.
    expect(snapshot(inner)).toBe(innerBefore);
    expect(snapshot(outer).inner).toBe(innerBefore);

    inner.count = 3;

    expect(snapshot(outer).inner).toBe(snapshot(inner));
    expect(snapshot(outer)).toEqual({label: 'outer', inner: {count: 3}});
    expect(Object.isFrozen(snapshot(outer).inner)).toBe(true);
  });

  it('is left as it is when the same store, or the raw object behind it, is assigned again', () => {
    const rawInner = {count: 0};
    const inner = createClassyStore(rawInner);
    const outer = createClassyStore<{label: string; inner: Inner | null}>({
      label: 'outer',
      inner: null,
    });
    outer.inner = inner;
    const before = snapshot(outer);
    const onOuter = mock(() => {});
    subscribe(outer, onOuter, {sync: true});

    outer.inner = inner;
    outer.inner = rawInner;

    expect(onOuter).not.toHaveBeenCalled();
    expect(snapshot(outer)).toBe(before);
    expect(outer.inner).toBe(inner);
  });

  type Outer = {label: string; inner?: Inner | null};
  const removals: {
    how: string;
    remove: (outer: Outer) => void;
    keys: string[];
    left: Outer;
  }[] = [
    {
      how: 'assigning null over it',
      remove: (outer) => {
        outer.inner = null;
      },
      keys: ['label', 'inner'],
      left: {label: 'outer', inner: null},
    },
    {
      how: 'deleting its property',
      remove: (outer) => {
        delete outer.inner;
      },
      keys: ['label'],
      left: {label: 'outer'},
    },
  ];

  it.each(removals)(
    'removed by $how, it stops notifying the outer store and stays a working store',
    ({remove, keys, left}) => {
      const inner = createClassyStore({count: 0});
      const outer = createClassyStore<Outer>({label: 'outer', inner: null});
      outer.inner = inner;
      const innerBefore = snapshot(inner);
      const onOuter = mock(() => {});
      const onInner = mock(() => {});
      subscribe(outer, onOuter, {sync: true});
      subscribe(inner, onInner, {sync: true});

      remove(outer);

      // The removal is a change to the outer store only.
      expect(onOuter).toHaveBeenCalledTimes(1);
      expect(onInner).not.toHaveBeenCalled();
      expect(snapshot(inner)).toBe(innerBefore);
      const outerAfter = snapshot(outer);
      expect(outerAfter).toEqual(left);
      expect(Object.keys(outerAfter)).toEqual(keys);

      inner.count = 1;

      expect(onOuter).toHaveBeenCalledTimes(1);
      expect(onInner).toHaveBeenCalledTimes(1);
      expect(snapshot(outer)).toBe(outerAfter);
      expect(snapshot(inner)).toEqual({count: 1});
    },
  );

  it('is connected in the same way when it is already in the object passed to createClassyStore()', () => {
    const inner = createClassyStore({count: 0});
    const outer = createClassyStore({label: 'outer', inner});
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(inner, onInner, {sync: true});

    outer.inner.count = 1;

    expect(outer.inner).toBe(inner);
    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(snapshot(outer).inner).toBe(snapshot(inner));
  });

  it('tells the batched subscribers of both stores once about several writes made through both paths', async () => {
    const inner = createClassyStore({count: 0});
    const outer = createClassyStore({label: 'outer', inner});
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter);
    subscribe(inner, onInner);

    inner.count = 1;
    outer.inner.count = 2;
    expect(onOuter).not.toHaveBeenCalled();
    expect(onInner).not.toHaveBeenCalled();
    await flush();

    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onInner).toHaveBeenCalledTimes(1);
  });

  class Counter {
    count = 0;

    increment() {
      this.count++;
    }
  }

  it('is connected when it is a class instance embedded by its proxy, and its snapshot keeps the class', () => {
    const inner = createClassyStore(new Counter());
    const outer = createClassyStore({label: 'outer', inner});
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(inner, onInner, {sync: true});

    outer.inner.increment();

    expect(outer.inner).toBe(inner);
    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(snapshot(outer).inner).toBe(snapshot(inner));
    expect(snapshot(outer).inner).toBeInstanceOf(Counter);
    expect(snapshot(outer).inner.count).toBe(1);
  });

  // FINDING: the raw class instance behind a store, placed in another store, is handed back raw, where a plain object in the same position is handed back as the store's proxy. A method called through the outer store then changes the state and notifies no one, not even the instance's own store.
  it('is not connected when the raw class instance behind it is embedded instead of its proxy', () => {
    const rawInner = new Counter();
    const inner = createClassyStore(rawInner);
    const outer = createClassyStore({label: 'outer', inner: rawInner});
    const onOuter = mock(() => {});
    const onInner = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(inner, onInner, {sync: true});

    expect(outer.inner).toBe(rawInner);
    expect(outer.inner).not.toBe(inner);

    inner.increment();
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onOuter).not.toHaveBeenCalled();

    outer.inner.increment();
    expect(inner.count).toBe(2);
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onOuter).not.toHaveBeenCalled();
  });
});

describe('a nested proxy read from one store and assigned into another', () => {
  type Row = {n: number};

  it('is read back from the second store as the same proxy, and only the second store is told of the assignment', () => {
    const from = createClassyStore({row: {n: 0}});
    const to = createClassyStore<{row: Row | null}>({row: null});
    const onFrom = mock(() => {});
    const onTo = mock(() => {});
    subscribe(from, onFrom, {sync: true});
    subscribe(to, onTo, {sync: true});

    to.row = from.row;

    expect(to.row).toBe(from.row);
    expect(onFrom).not.toHaveBeenCalled();
    expect(onTo).toHaveBeenCalledTimes(1);
  });

  it('notifies the subscribers of both stores once for a write through either store', () => {
    const from = createClassyStore({row: {n: 0}});
    const to = createClassyStore<{row: Row | null}>({row: null});
    to.row = from.row;
    const onFrom = mock(() => {});
    const onTo = mock(() => {});
    subscribe(from, onFrom, {sync: true});
    subscribe(to, onTo, {sync: true});

    from.row.n = 1;
    expect(onFrom).toHaveBeenCalledTimes(1);
    expect(onTo).toHaveBeenCalledTimes(1);

    to.row.n = 2;
    expect(onFrom).toHaveBeenCalledTimes(2);
    expect(onTo).toHaveBeenCalledTimes(2);
    expect(from.row.n).toBe(2);
  });

  it('has one snapshot, held by both root snapshots', () => {
    const from = createClassyStore({row: {n: 0}});
    const to = createClassyStore<{row: Row | null}>({row: null});
    to.row = from.row;

    to.row.n = 2;

    expect(snapshot(to).row).toBe(snapshot(from).row);
    expect(snapshot(to)).toEqual({row: {n: 2}});
  });

  it('stays in the second store, and stops notifying the first, once the first store replaces it', () => {
    const from = createClassyStore({row: {n: 0}});
    const to = createClassyStore<{row: Row | null}>({row: null});
    const row = from.row;
    to.row = row;
    const onFrom = mock(() => {});
    const onTo = mock(() => {});
    subscribe(from, onFrom, {sync: true});
    subscribe(to, onTo, {sync: true});

    from.row = {n: 100};
    expect(onFrom).toHaveBeenCalledTimes(1);
    expect(onTo).not.toHaveBeenCalled();

    row.n = 3;

    expect(to.row).toBe(row);
    expect(onFrom).toHaveBeenCalledTimes(1);
    expect(onTo).toHaveBeenCalledTimes(1);
    expect(snapshot(from)).toEqual({row: {n: 100}});
    expect(snapshot(to)).toEqual({row: {n: 3}});
  });

  it('is adopted, not wrapped again, when it is already in the object passed to createClassyStore()', () => {
    const from = createClassyStore({row: {n: 0}});
    const to = createClassyStore({row: from.row});
    const onFrom = mock(() => {});
    subscribe(from, onFrom, {sync: true});

    to.row.n = 1;

    expect(to.row).toBe(from.row);
    expect(onFrom).toHaveBeenCalledTimes(1);
    expect(snapshot(to).row).toBe(snapshot(from).row);
  });
});

describe('reference cycles', () => {
  it('a store that references itself at construction reads itself back at any depth', () => {
    type Loop = {name: string; self: Loop};
    // The cast builds an object whose required field is filled in afterwards.
    const raw = {name: 'root'} as Loop;
    raw.self = raw;

    const store = createClassyStore(raw);

    expect(store.self).toBe(store);
    expect(store.self.self.self).toBe(store);
  });

  it('a write to a store that references itself notifies each subscriber once', async () => {
    type Loop = {name: string; other: number; self: Loop};
    const raw = {name: 'root', other: 0} as Loop;
    raw.self = raw;
    const store = createClassyStore(raw);
    const onSync = mock(() => {});
    const onBatched = mock(() => {});
    subscribe(store, onSync, {sync: true});
    subscribe(store, onBatched);

    store.name = 'renamed';
    expect(onSync).toHaveBeenCalledTimes(1);

    // The same store, reached through its own property.
    store.self.other = 1;
    expect(onSync).toHaveBeenCalledTimes(2);

    await flush();
    expect(onBatched).toHaveBeenCalledTimes(1);
  });

  // FINDING: the write that creates a cycle succeeds and notifies as usual; the store then cannot be snapshotted, so the error surfaces later, in whoever takes the next snapshot.
  it('a self-reference assigned later makes snapshot() throw, and deleting it makes snapshot() work again', () => {
    type Loop = {name: string; clean: {v: number}; self?: Loop};
    const store = createClassyStore<Loop>({name: 'root', clean: {v: 1}});
    const before = snapshot(store);
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.self = store;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.self).toBe(store);
    expect(() => snapshot(store)).toThrow(CIRCULAR);
    // A snapshot taken before the cycle existed is untouched.
    expect(before).toEqual({name: 'root', clean: {v: 1}});

    delete store.self;

    const after = snapshot(store);
    expect(after).toEqual({name: 'root', clean: {v: 1}});
    expect(after).not.toBe(before);
    expect(after.clean).toBe(before.clean);
  });

  it('a subtree outside the cycle can still be snapshotted on its own', () => {
    type Loop = {name: string; clean: {v: number}; self?: Loop};
    const store = createClassyStore<Loop>({name: 'root', clean: {v: 1}});
    const before = snapshot(store);
    store.self = store;

    expect(snapshot(store.clean)).toBe(before.clean);

    store.clean.v = 2;

    expect(snapshot(store.clean)).toEqual({v: 2});
    expect(() => snapshot(store)).toThrow(CIRCULAR);
  });

  type Left = {name: string; right: Right};
  type Right = {name: string; left?: Left};

  /** A store whose `left` and `left.right` objects reference each other. */
  function storeWithCycleOfTwo() {
    const right: Right = {name: 'right'};
    const left: Left = {name: 'left', right};
    right.left = left;
    return createClassyStore({left, clean: {v: 1}});
  }

  it('two objects that reference each other read each other back, and snapshot() throws for every node on the path to them', () => {
    const store = storeWithCycleOfTwo();

    expect(store.left.right.left).toBe(store.left);
    expect(() => snapshot(store)).toThrow(CIRCULAR);
    expect(() => snapshot(store.left)).toThrow(CIRCULAR);
    expect(() => snapshot(store.left.right)).toThrow(CIRCULAR);
    expect(snapshot(store.clean)).toEqual({v: 1});
  });

  it('a write to either of two objects that reference each other notifies the subscribers of both', () => {
    const store = storeWithCycleOfTwo();
    const onRoot = mock(() => {});
    const onLeft = mock(() => {});
    const onRight = mock(() => {});
    subscribe(store, onRoot, {sync: true});
    subscribe(store.left, onLeft, {sync: true});
    subscribe(store.left.right, onRight, {sync: true});

    store.left.name = 'L';
    expect(onRoot).toHaveBeenCalledTimes(1);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).toHaveBeenCalledTimes(1);

    store.left.right.name = 'R';
    expect(onRoot).toHaveBeenCalledTimes(2);
    expect(onLeft).toHaveBeenCalledTimes(2);
    expect(onRight).toHaveBeenCalledTimes(2);

    // A write outside the cycle reaches the root only.
    store.clean.v = 2;
    expect(onRoot).toHaveBeenCalledTimes(3);
    expect(onLeft).toHaveBeenCalledTimes(2);
    expect(onRight).toHaveBeenCalledTimes(2);
  });

  it('breaking a cycle of two restores snapshots and the one-way subscription scope', () => {
    const store = storeWithCycleOfTwo();
    const right = store.left.right;
    const onLeft = mock(() => {});
    const onRight = mock(() => {});
    subscribe(store.left, onLeft, {sync: true});
    subscribe(right, onRight, {sync: true});

    delete right.left;
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({
      left: {name: 'left', right: {name: 'right'}},
      clean: {v: 1},
    });

    // `right` is still inside `left`, but `left` is no longer inside `right`.
    right.name = 'R';
    expect(onLeft).toHaveBeenCalledTimes(2);
    expect(onRight).toHaveBeenCalledTimes(2);

    store.left.name = 'L';
    expect(onLeft).toHaveBeenCalledTimes(3);
    expect(onRight).toHaveBeenCalledTimes(2);
  });

  it('two stores that reference each other notify each other and cannot be snapshotted until one lets go', () => {
    type West = {name: string; east?: East};
    type East = {name: string; west?: West};
    const west = createClassyStore<West>({name: 'west'});
    const east = createClassyStore<East>({name: 'east'});
    const onWest = mock(() => {});
    const onEast = mock(() => {});
    subscribe(west, onWest, {sync: true});
    subscribe(east, onEast, {sync: true});

    west.east = east;
    expect(onWest).toHaveBeenCalledTimes(1);
    expect(onEast).not.toHaveBeenCalled();

    // `east` is now inside `west`, so this write to `east` reaches both.
    east.west = west;
    expect(onWest).toHaveBeenCalledTimes(2);
    expect(onEast).toHaveBeenCalledTimes(1);
    expect(west.east.west).toBe(west);

    west.name = 'W';
    expect(onWest).toHaveBeenCalledTimes(3);
    expect(onEast).toHaveBeenCalledTimes(2);

    east.name = 'E';
    expect(onWest).toHaveBeenCalledTimes(4);
    expect(onEast).toHaveBeenCalledTimes(3);

    expect(() => snapshot(west)).toThrow(CIRCULAR);
    expect(() => snapshot(east)).toThrow(CIRCULAR);

    delete east.west;

    expect(snapshot(west)).toEqual({name: 'W', east: {name: 'E'}});
    expect(snapshot(west).east).toBe(snapshot(east));
  });

  it('a getter on a store that references itself terminates, is memoized between writes and follows the cycle', () => {
    let runs = 0;
    class Item {
      name = 'item';
      self: Item | null = null;

      get label(): string {
        runs++;
        return `label:${this.self ? this.self.name : 'none'}`;
      }
    }
    const store = createClassyStore(new Item());
    expect(store.label).toBe('label:none');

    store.self = store;

    expect(store.label).toBe('label:item');
    expect(store.label).toBe('label:item');
    expect(runs).toBe(2);

    store.name = 'renamed';

    expect(store.label).toBe('label:renamed');
    expect(runs).toBe(3);
  });

  // FINDING: a getter that reads the store through its own cycle depends on the whole store, so it recomputes after a write to a field it never read; without the cycle the same getter stays cached.
  it('a getter that reads the store through its own cycle recomputes after a write to a field it never read', () => {
    let runs = 0;
    class Item {
      name = 'item';
      other = 0;
      self: Item | null = null;

      get label(): string {
        runs++;
        return `label:${this.self ? this.self.name : 'none'}`;
      }
    }
    const store = createClassyStore(new Item());
    store.self = store;
    expect(store.label).toBe('label:item');
    expect(runs).toBe(1);

    store.other = 1;

    expect(store.label).toBe('label:item');
    expect(runs).toBe(2);
  });
});

describe('reference stability', () => {
  it('a nested object, array or element is the same proxy on every read, across writes and snapshots', () => {
    const store = createClassyStore({
      child: {n: 0, deep: {v: 1}},
      list: [{id: 1}, {id: 2}],
      other: 0,
    });
    const child = store.child;
    const deep = store.child.deep;
    const list = store.list;
    const first = store.list[0];

    store.other = 1;
    store.child.n = 1;
    store.list[0].id = 10;
    snapshot(store);

    expect(store.child).toBe(child);
    expect(store.child.deep).toBe(deep);
    expect(store.list).toBe(list);
    expect(store.list[0]).toBe(first);
  });

  it('a raw object assigned to a property is read back as a proxy, and as that same proxy after being removed and assigned again', () => {
    const rawChild = {n: 0};
    const store = createClassyStore<{child: {n: number} | null}>({child: null});

    store.child = rawChild;
    const proxy = store.child;

    expect(proxy).not.toBe(rawChild);
    expect(store.child).toBe(proxy);

    store.child = null;
    store.child = rawChild;

    expect(store.child).toBe(proxy);
  });

  it('assigning the raw object a property already holds changes nothing', () => {
    const rawChild = {n: 0};
    const store = createClassyStore({child: rawChild});
    const proxy = store.child;
    const before = snapshot(store);
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.child = rawChild;

    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
    expect(store.child).toBe(proxy);
  });

  // FINDING: a write through the raw object is silent: no subscriber is told, and snapshots keep the old content, even after a later write elsewhere through the proxy, until that object itself is written through its proxy.
  it('a write through the raw object is not observed, and snapshots keep the old content until the object is written through its proxy', () => {
    const rawChild = {n: 0};
    const store = createClassyStore({child: rawChild, other: 0});
    const before = snapshot(store);
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    rawChild.n = 5;

    expect(listener).not.toHaveBeenCalled();
    // The live read sees the write; the snapshot does not.
    expect(store.child.n).toBe(5);
    expect(snapshot(store)).toBe(before);

    // A write elsewhere rebuilds the root snapshot around the stale child.
    store.other = 1;
    expect(snapshot(store)).not.toBe(before);
    expect(snapshot(store).child).toBe(before.child);
    expect(snapshot(store).child.n).toBe(0);

    store.child.n = 6;
    expect(snapshot(store).child.n).toBe(6);
  });
});

describe('looking an object up in a store array', () => {
  // FINDING: a store array holds proxies, so includes(), indexOf() and lastIndexOf() return false or -1 for a raw object that is in the array. Reactive collections match a raw object, its proxy and its snapshots as one member; arrays do not.
  it('includes(), indexOf() and lastIndexOf() find an element by its proxy and not by its raw object', () => {
    const raw = {id: 1};
    const store = createClassyStore({list: [raw, {id: 2}, raw]});
    const proxy = store.list[0];

    expect(store.list.includes(proxy)).toBe(true);
    expect(store.list.indexOf(proxy)).toBe(0);
    expect(store.list.lastIndexOf(proxy)).toBe(2);

    expect(store.list.includes(raw)).toBe(false);
    expect(store.list.indexOf(raw)).toBe(-1);
    expect(store.list.lastIndexOf(raw)).toBe(-1);
  });

  // FINDING: list.push(row) followed by list.includes(row) is false, because the array hands back a proxy of the row that was pushed.
  it('an object is not found by includes() or indexOf() right after it was pushed', () => {
    const store = createClassyStore({list: [] as {id: number}[]});
    const pushed = {id: 3};

    store.list.push(pushed);

    expect(store.list.includes(pushed)).toBe(false);
    expect(store.list.indexOf(pushed)).toBe(-1);
    expect(store.list[0]).not.toBe(pushed);
    expect(store.list.includes(store.list[0])).toBe(true);
  });

  it('a snapshot array finds only its own frozen elements, not the raw object or its proxy', () => {
    const raw = {id: 1};
    const store = createClassyStore({list: [raw, {id: 2}]});
    const snap = snapshot(store);

    expect(snap.list.includes(snap.list[0])).toBe(true);
    expect(snap.list.indexOf(snap.list[1])).toBe(1);
    expect(snap.list.includes(raw)).toBe(false);
    expect(snap.list.includes(store.list[0])).toBe(false);
  });
});

describe('a native Set or Map held in a store', () => {
  // FINDING: an object that is a proxy in a store array is still raw inside a native Set or Map in the same store, so set.has(proxy) is false and map.get(proxy) is undefined.
  it('is returned as itself and keeps its raw members, so a lookup by proxy misses', () => {
    const raw = {id: 1};
    const set = new Set([raw]);
    const map = new Map([[raw, 'value']]);
    const store = createClassyStore({set, map, list: [raw]});
    const proxy = store.list[0];

    expect(store.set).toBe(set);
    expect(store.map).toBe(map);
    expect([...store.set][0]).toBe(raw);
    expect(store.set.has(raw)).toBe(true);
    expect(store.map.get(raw)).toBe('value');

    expect(store.set.has(proxy)).toBe(false);
    expect(store.map.get(proxy)).toBeUndefined();

    // The snapshot holds the very same collections.
    expect(snapshot(store).set).toBe(set);
    expect(snapshot(store).map).toBe(map);
  });
});

describe('snapshot identity of nested proxies', () => {
  it('the snapshot of a nested proxy taken first is reused inside the root snapshot', () => {
    const store = createClassyStore({
      child: {n: 0, deep: {v: 1}},
      list: [{id: 1}, {id: 2}],
    });
    const child = snapshot(store.child);
    const deep = snapshot(store.child.deep);
    const list = snapshot(store.list);
    const second = snapshot(store.list[1]);

    const root = snapshot(store);

    expect(root.child).toBe(child);
    expect(root.child.deep).toBe(deep);
    expect(root.list).toBe(list);
    expect(root.list[1]).toBe(second);
  });

  it('the snapshot of a nested proxy taken after the root snapshot is the object inside it', () => {
    const store = createClassyStore({
      child: {n: 0, deep: {v: 1}},
      list: [{id: 1}, {id: 2}],
    });

    const root = snapshot(store);

    expect(snapshot(store.child)).toBe(root.child);
    expect(snapshot(store.child.deep)).toBe(root.child.deep);
    expect(snapshot(store.list)).toBe(root.list);
    expect(snapshot(store.list[1])).toBe(root.list[1]);
  });

  it('the snapshot of a nested proxy keeps its reference when a sibling changes and gets a new one when its own content changes', () => {
    const store = createClassyStore({child: {n: 0, deep: {v: 1}}, other: 0});
    const before = snapshot(store.child);

    store.other = 1;
    expect(snapshot(store.child)).toBe(before);

    store.child.deep.v = 2;

    const after = snapshot(store.child);
    expect(after).not.toBe(before);
    expect(after).toEqual({n: 0, deep: {v: 2}});
    expect(snapshot(store).child).toBe(after);
    expect(before).toEqual({n: 0, deep: {v: 1}});
  });

  it('a nested proxy removed from the store keeps its last snapshot until it is written again', () => {
    const store = createClassyStore({child: {n: 0}});
    const removed = store.child;
    const last = snapshot(store).child;

    store.child = {n: 100};
    expect(snapshot(removed)).toBe(last);

    removed.n = 1;

    expect(snapshot(removed)).not.toBe(last);
    expect(snapshot(removed)).toEqual({n: 1});
    expect(snapshot(store)).toEqual({child: {n: 100}});
  });
});

describe('functions read through a store', () => {
  it('a function stored as data is read back as one stable wrapper bound to the store, while the snapshot holds the original', () => {
    function whoAmI(this: unknown) {
      return this;
    }
    const store = createClassyStore({whoAmI});
    const firstRead = store.whoAmI;
    const secondRead = store.whoAmI;

    expect(firstRead).not.toBe(whoAmI);
    expect(secondRead).toBe(firstRead);
    expect(store.whoAmI()).toBe(store);
    expect(snapshot(store).whoAmI).toBe(whoAmI);
  });

  it('a method read from a store array is a new function on every read', () => {
    const store = createClassyStore({items: [3, 1, 2]});
    const firstRead = store.items.push;
    const secondRead = store.items.push;

    expect(secondRead).not.toBe(firstRead);
  });

  // FINDING: a function held in a store array is wrapped anew on every read, like an array method. It is therefore never equal to anything, and includes() and indexOf() miss even a value that was just read from the same array.
  it('a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array', () => {
    const first = () => 'first';
    const second = () => 'second';
    const store = createClassyStore({callbacks: [first, second]});
    const firstRead = store.callbacks[0];
    const secondRead = store.callbacks[0];

    expect(secondRead).not.toBe(firstRead);
    expect(store.callbacks.includes(first)).toBe(false);
    expect(store.callbacks.indexOf(first)).toBe(-1);
    expect(store.callbacks.includes(firstRead)).toBe(false);
    expect(store.callbacks.indexOf(store.callbacks[1])).toBe(-1);
    // Calling an element still runs the original function.
    expect(store.callbacks[1]()).toBe('second');
    // The snapshot holds the originals, so the same lookups work there.
    expect(snapshot(store).callbacks.indexOf(second)).toBe(1);
  });

  // FINDING: because indexOf() returns -1 for every function, the usual way to remove a callback, splice(indexOf(fn), 1), becomes splice(-1, 1) and removes the last callback in the array.
  it('splice(indexOf(fn), 1) on a store array of functions removes the last function, not the one asked for', () => {
    const first = () => 'first';
    const second = () => 'second';
    const third = () => 'third';
    const store = createClassyStore({callbacks: [first, second, third]});

    store.callbacks.splice(store.callbacks.indexOf(first), 1);

    expect(snapshot(store).callbacks.map((callback) => callback())).toEqual([
      'first',
      'second',
    ]);
  });

  // FINDING: a class stored as data is read back as a wrapper function, so its static members are undefined and `instanceof` against the value read from the store is false. Only `new` reaches the class.
  it('a class stored as data is read back as a wrapper without its static members', () => {
    class Model {
      static label = 'model';
      constructor(readonly name: string) {}
    }
    const store = createClassyStore({Model});

    expect(store.Model).not.toBe(Model);
    expect(store.Model.label).toBeUndefined();
    expect(new store.Model('row') instanceof store.Model).toBe(false);
    // The snapshot holds the class itself.
    expect(snapshot(store).Model).toBe(Model);
    expect(snapshot(store).Model.label).toBe('model');
  });
});

describe('the raw objects behind a store, after writes through it', () => {
  // FINDING: a store writes what it is given into the raw object: a raw object stays raw, but a proxy is stored as the proxy. The raw graph therefore ends up holding store proxies.
  it('keep a raw object that was assigned, and hold the proxy itself when a proxy was assigned', () => {
    const rawRow = {n: 0};
    const from = createClassyStore({row: rawRow});
    const rawTo: {fresh: {n: number} | null; row: {n: number} | null} = {
      fresh: null,
      row: null,
    };
    const to = createClassyStore(rawTo);
    const fresh = {n: 1};

    to.fresh = fresh;
    to.row = from.row;

    expect(rawTo.fresh).toBe(fresh);
    expect(rawTo.row).toBe(from.row);
    expect(rawTo.row).not.toBe(rawRow);
  });

  // FINDING: an in-place reorder reads elements as proxies and writes them back, so the raw array's own elements are replaced by their proxies and no longer equal the objects it was built from.
  it('hold proxies in place of the raw elements once a store array was reversed in place', () => {
    const first = {id: 1};
    const second = {id: 2};
    const rawList = [first, second];
    const store = createClassyStore({list: rawList});
    const firstProxy = store.list[0];

    store.list.reverse();

    expect(rawList[1]).toBe(firstProxy);
    expect(rawList[1]).not.toBe(first);
    expect(rawList.includes(first)).toBe(false);
  });
});
