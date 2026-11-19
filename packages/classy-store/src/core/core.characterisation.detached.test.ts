import {describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// Characterisation tests for subtrees that leave a store while a caller still
// holds a proxy into them: who is told about a write, what the snapshots
// return, what happens when the subtree is put back, how a child with several
// owners behaves, and what the collector can free. They pin what the store
// does today, through the public entry only. `core.ownership.test.ts` and
// `core.memory.test.ts` assert part of this on internal state; here the same
// facts are shown by notifications, snapshots, getter results and collection.
// A comment starting with FINDING marks behaviour that looks like a bug or a
// surprise; it is pinned all the same.

/** Let the microtask that serves ordinary (batched) subscribers run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Both kinds of subscriber, for behaviour the two have in common. */
const kinds = [
  {kind: 'sync', options: {sync: true}},
  {kind: 'batched', options: {}},
] as const;

/** A value the test has just put in place. */
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value to be present');
  return value;
}

type Row = {n: number};

type State = {slot?: Row; rows: Row[]; parent: {child: Row}};

const createState = () =>
  createClassyStore<State>({
    slot: {n: 1},
    rows: [{n: 1}, {n: 2}],
    parent: {child: {n: 1}},
  });

/**
 * Each way a nested object can leave a store while the caller keeps its proxy.
 * `remove` returns that proxy; `left` is the store afterwards.
 */
const routes: {route: string; remove: (store: State) => Row; left: State}[] = [
  {
    route: 'delete',
    remove(store) {
      const held = present(store.slot);
      delete store.slot;
      return held;
    },
    left: {rows: [{n: 1}, {n: 2}], parent: {child: {n: 1}}},
  },
  {
    route: 'replacing its property',
    remove(store) {
      const held = present(store.slot);
      store.slot = {n: 100};
      return held;
    },
    left: {slot: {n: 100}, rows: [{n: 1}, {n: 2}], parent: {child: {n: 1}}},
  },
  {
    route: 'splice',
    remove(store) {
      const held = store.rows[0];
      store.rows.splice(0, 1);
      return held;
    },
    left: {slot: {n: 1}, rows: [{n: 2}], parent: {child: {n: 1}}},
  },
  {
    route: 'pop',
    remove(store) {
      const held = store.rows[1];
      store.rows.pop();
      return held;
    },
    left: {slot: {n: 1}, rows: [{n: 1}], parent: {child: {n: 1}}},
  },
  {
    route: 'a shorter array length',
    remove(store) {
      const held = store.rows[1];
      store.rows.length = 1;
      return held;
    },
    left: {slot: {n: 1}, rows: [{n: 1}], parent: {child: {n: 1}}},
  },
  {
    route: 'replacing its parent',
    remove(store) {
      const held = store.parent.child;
      store.parent = {child: {n: 100}};
      return held;
    },
    left: {slot: {n: 1}, rows: [{n: 1}, {n: 2}], parent: {child: {n: 100}}},
  },
];

describe('a write through a proxy held from before its object left the store', () => {
  it.each(routes)(
    'after $route, it reaches the subscribers of the held proxy and no subscriber of the store',
    async ({remove}) => {
      const store = createState();
      const held = remove(store);
      await flush();
      const calls: string[] = [];
      subscribe(store, () => calls.push('store, sync'), {sync: true});
      subscribe(store, () => calls.push('store, batched'));
      // Subscribed after the object left: that works like any subscription.
      subscribe(held, () => calls.push('held, sync'), {sync: true});
      subscribe(held, () => calls.push('held, batched'));

      held.n = 50;
      await flush();

      expect(calls).toEqual(['held, sync', 'held, batched']);
    },
  );

  it.each(routes)(
    'after $route, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was',
    ({remove, left}) => {
      const store = createState();
      const held = remove(store);
      const before = snapshot(store);

      held.n = 50;

      expect(snapshot(held)).toEqual({n: 50});
      expect(snapshot(store)).toBe(before);
      expect(snapshot(store)).toEqual(left);
    },
  );
});

describe('a container that left the store and is still held', () => {
  it.each(kinds)(
    'a write through a held row reaches the $kind subscribers of the row and of each removed container above it, innermost first, and not the store',
    async ({options}) => {
      const store = createClassyStore({section: {group: {row: {n: 1}}}});
      const section = store.section;
      const row = section.group.row;
      store.section = {group: {row: {n: 100}}};
      await flush();
      const calls: string[] = [];
      subscribe(store, () => calls.push('store'), options);
      subscribe(section, () => calls.push('section'), options);
      subscribe(section.group, () => calls.push('group'), options);
      subscribe(row, () => calls.push('row'), options);

      row.n = 2;
      await flush();

      expect(calls).toEqual(['row', 'group', 'section']);
    },
  );

  it('reading through a removed list gives the same row proxies as before the removal', () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const list = store.rows;
    const first = list[0];
    const second = list[1];

    store.rows = [];

    expect(list[0]).toBe(first);
    expect(list[1]).toBe(second);
  });

  it('a row pushed through a removed list shows in the snapshot of that list and not in the store', () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const list = store.rows;
    store.rows = [];

    list.push({n: 3});

    expect(snapshot(list)).toEqual([{n: 1}, {n: 2}, {n: 3}]);
    expect(snapshot(store)).toEqual({rows: []});
  });

  it('the snapshot of a removed list keeps the identity of the rows that did not change', () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const list = store.rows;
    store.rows = [];
    const before = snapshot(list);

    list[0].n = 10;
    const after = snapshot(list);

    expect(after).toEqual([{n: 10}, {n: 2}]);
    expect(after[1]).toBe(before[1]);
    expect(before).toEqual([{n: 1}, {n: 2}]);
  });

  it('a getter on a removed object refreshes when an object below it, shared with the store, is written in the store', () => {
    const item = {n: 1};
    const outer = {
      inner: {item},
      get doubled(): number {
        return this.inner.item.n * 2;
      },
    };
    const store = createClassyStore<{outer?: typeof outer; pinned: Row}>({
      outer,
      pinned: item,
    });
    const held = present(store.outer);
    const before = [held.doubled, snapshot(held).doubled];
    delete store.outer;

    store.pinned.n = 5;

    expect(before).toEqual([2, 2]);
    expect(held.doubled).toBe(10);
    expect(snapshot(held).doubled).toBe(10);
  });
});

describe('subscriptions on a node that leaves the store', () => {
  // FINDING: subscribe(store.user, ...) subscribes to the object that is there
  // at that moment, not to the property. This matches the documented scope
  // ("that node's subtree"), but once store.user is replaced the subscriber
  // hears nothing about the new object, and nothing tells it that it is now
  // watching an object outside the store.
  it('a subscriber given store.user stays with that object when store.user is replaced', () => {
    const store = createClassyStore({user: {name: 'a'}});
    const first = store.user;
    const calls: string[] = [];
    subscribe(store.user, () => calls.push(`first user is ${first.name}`), {
      sync: true,
    });

    store.user = {name: 'b'};
    store.user.name = 'c';
    expect(calls).toEqual([]);

    first.name = 'z';
    expect(calls).toEqual(['first user is z']);
  });

  it('a subscriber on a node is not called when that node is removed from the store or put back', async () => {
    const store = createClassyStore<{slot?: Row}>({slot: {n: 1}});
    const held = present(store.slot);
    const calls: string[] = [];
    subscribe(held, () => calls.push('sync'), {sync: true});
    subscribe(held, () => calls.push('batched'));

    delete store.slot;
    await flush();
    store.slot = held;
    await flush();

    expect(calls).toEqual([]);
  });

  it.each(kinds)(
    'a $kind subscriber removed from a node that left the store is not called again, and the node still takes writes',
    async ({options}) => {
      const store = createClassyStore<{slot?: Row}>({slot: {n: 1}});
      const held = present(store.slot);
      delete store.slot;
      await flush();
      const seen: number[] = [];
      const stop = subscribe(held, () => seen.push(snapshot(held).n), options);

      held.n = 2;
      await flush();
      stop();
      held.n = 3;
      await flush();

      expect(seen).toEqual([2]);
      expect(held.n).toBe(3);
      expect(snapshot(held)).toEqual({n: 3});
    },
  );

  it('a subscriber added to a list before it was removed still hears about a row that the list shares with the store', () => {
    const row = {n: 1};
    const store = createClassyStore({rows: [row], pinned: [row]});
    const list = store.rows;
    const seen: unknown[] = [];
    subscribe(list, () => seen.push(snapshot(list)), {sync: true});
    store.rows = [];

    store.pinned[0].n = 2;

    expect(seen).toEqual([[{n: 2}]]);
  });

  it('once that subscriber is removed, a write to the shared row in the store still shows in the next snapshot of the list', () => {
    const row = {n: 1};
    const store = createClassyStore({rows: [row], pinned: [row]});
    const list = store.rows;
    const stop = subscribe(list, () => {}, {sync: true});
    store.rows = [];
    const before = snapshot(list);
    stop();

    store.pinned[0].n = 3;

    expect(before).toEqual([{n: 1}]);
    expect(snapshot(list)).toEqual([{n: 3}]);
  });

  it('after the subscriber of a row in a removed list is removed, a write through an object held below that row shows in the snapshot of the list', () => {
    const store = createClassyStore({rows: [{detail: {n: 1}}]});
    const list = store.rows;
    const detail = list[0].detail;
    const before = snapshot(list);
    const stop = subscribe(list[0], () => {}, {sync: true});
    store.rows = [];
    stop();

    detail.n = 2;

    expect(before).toEqual([{detail: {n: 1}}]);
    expect(snapshot(list)).toEqual([{detail: {n: 2}}]);
  });
});

describe('putting a removed subtree back', () => {
  /** The two things a caller can write back: the proxy it held, or the raw object. */
  const writtenBack = [
    {what: 'the held proxy', pick: (held: Row, _raw: Row) => held},
    {what: 'the raw object', pick: (_held: Row, raw: Row) => raw},
  ];

  it.each(writtenBack)(
    'after $what is written to its old property, the store returns the proxy that was held',
    ({pick}) => {
      const raw = {n: 1};
      const store = createClassyStore<{slot?: Row}>({slot: raw});
      const held = present(store.slot);
      delete store.slot;

      store.slot = pick(held, raw);

      expect(store.slot).toBe(held);
    },
  );

  it.each(writtenBack)(
    'after $what is written back, the store snapshot shows the writes made through the held proxy while it was out',
    ({pick}) => {
      const raw = {n: 1};
      const store = createClassyStore<{slot?: Row}>({slot: raw});
      const held = present(store.slot);
      const before = snapshot(store);
      delete store.slot;
      held.n = 2;

      store.slot = pick(held, raw);

      expect(before).toEqual({slot: {n: 1}});
      expect(snapshot(store)).toEqual({slot: {n: 2}});
    },
  );

  // FINDING: the object is not in any store when it is changed, so writing it
  // directly is not a write that bypasses a proxy. Yet when it is written
  // back, the store reads 2 through the proxy while its snapshot still says 1:
  // the node and the snapshot made for the object before it left are reused,
  // and nothing compares them with the object. This test and the next one pin
  // the two outcomes; which one a caller gets depends on whether a snapshot
  // was taken before the object left.
  it('a raw object changed directly while it was out of the store and written back keeps the snapshot from before it left', () => {
    const raw = {n: 1};
    const store = createClassyStore<{slot?: Row}>({slot: raw});
    const before = snapshot(store);
    delete store.slot;
    raw.n = 2;

    store.slot = raw;

    expect(store.slot?.n).toBe(2);
    expect(snapshot(store)).toEqual({slot: {n: 1}});
    expect(snapshot(store).slot).toBe(before.slot);
  });

  // FINDING: the other half of the pair above.
  it('the same raw object shows its current value when no snapshot of it was taken before it left', () => {
    const raw = {n: 1};
    const store = createClassyStore<{slot?: Row}>({slot: raw});
    delete store.slot;
    raw.n = 2;

    store.slot = raw;

    expect(snapshot(store)).toEqual({slot: {n: 2}});
  });

  it('a subtree removed and written back unchanged keeps the snapshot it had before', () => {
    const store = createClassyStore<{slot?: Row}>({slot: {n: 1}});
    const held = present(store.slot);
    const before = snapshot(store);
    delete store.slot;

    store.slot = held;

    expect(snapshot(store).slot).toBe(before.slot);
  });

  it('once it is back, a write through an object held below it reaches the store subscribers again', async () => {
    const store = createClassyStore<{slot?: {inner: Row}}>({
      slot: {inner: {n: 1}},
    });
    const held = present(store.slot);
    const inner = held.inner;
    delete store.slot;
    store.slot = held;
    await flush();
    const calls: string[] = [];
    subscribe(store, () => calls.push('store, sync'), {sync: true});
    subscribe(store, () => calls.push('store, batched'));

    inner.n = 2;
    await flush();

    expect(calls).toEqual(['store, sync', 'store, batched']);
  });

  it('a batched store subscriber hears nothing of a write made while the subtree is out, and once of a later write together with the put-back', async () => {
    const store = createClassyStore<{slot?: Row}>({slot: {n: 1}});
    const held = present(store.slot);
    delete store.slot;
    await flush();
    const seen: unknown[] = [];
    subscribe(store, () => seen.push(snapshot(store)));

    held.n = 2;
    await flush();
    expect(seen).toEqual([]);

    held.n = 3;
    store.slot = held;
    await flush();
    expect(seen).toEqual([{slot: {n: 3}}]);
  });

  it('a row popped, written and pushed back keeps its proxy and shows its new value', () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const held = store.rows[1];
    store.rows.pop();
    held.n = 20;

    store.rows.push(held);

    expect(store.rows[1]).toBe(held);
    expect(snapshot(store)).toEqual({rows: [{n: 1}, {n: 20}]});
  });

  it('a write through a held row that kept its own subscriber while its list was out shows in the store once the list is back', () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const list = store.rows;
    const row = list[0];
    const before = snapshot(store);
    const calls: string[] = [];
    subscribe(row, () => calls.push('row'), {sync: true});
    store.rows = [];
    row.n = 5;

    store.rows = list;

    expect(calls).toEqual(['row']);
    expect(before).toEqual({rows: [{n: 1}, {n: 2}]});
    expect(snapshot(store)).toEqual({rows: [{n: 5}, {n: 2}]});
  });

  it('a store getter that reads the subtree follows it out and back, on the proxy and on the snapshot', () => {
    const store = createClassyStore<{slot?: Row; readonly label: string}>({
      slot: {n: 1},
      get label() {
        return this.slot ? `n is ${this.slot.n}` : 'no slot';
      },
    });
    const held = present(store.slot);
    const labels = [store.label, snapshot(store).label];

    delete store.slot;
    labels.push(store.label, snapshot(store).label);
    held.n = 2;
    store.slot = held;
    labels.push(store.label, snapshot(store).label);

    expect(labels).toEqual([
      'n is 1',
      'n is 1',
      'no slot',
      'no slot',
      'n is 2',
      'n is 2',
    ]);
  });

  it('a store getter that was not read while the subtree was out refreshes for a write that reached a shared child through another owner', () => {
    const record = {n: 1};
    const store = createClassyStore({
      section: {record},
      other: {record},
      get total(): number {
        return this.section.record.n;
      },
    });
    const held = store.section;
    const before = [store.total, snapshot(store).total];
    store.section = {record: {n: 100}};
    store.other.record.n = 5;

    store.section = held;

    expect(before).toEqual([1, 1]);
    expect(store.total).toBe(5);
    expect(snapshot(store).total).toBe(5);
    expect(snapshot(store).section).toEqual({record: {n: 5}});
  });
});

describe('a child with several owners', () => {
  it('held under two properties of one store, it leaves the store only when the second property lets go', () => {
    const record = {n: 1};
    const store = createClassyStore<{a?: Row; b?: Row}>({a: record, b: record});
    const held = present(store.a);
    delete store.a;
    const seen: unknown[] = [];
    subscribe(store, () => seen.push(snapshot(store)), {sync: true});

    held.n = 2;
    expect(seen).toEqual([{b: {n: 2}}]);

    // The delete is the second call; the write after it adds none.
    delete store.b;
    held.n = 3;
    expect(seen).toEqual([{b: {n: 2}}, {}]);
    expect(snapshot(held)).toEqual({n: 3});
  });

  it('held twice by one array, it leaves the store only when the second index lets go', () => {
    const record = {n: 1};
    const store = createClassyStore({rows: [record, record]});
    const held = store.rows[0];
    store.rows.pop();
    const seen: unknown[] = [];
    subscribe(store, () => seen.push(snapshot(store).rows), {sync: true});

    held.n = 2;
    expect(seen).toEqual([[{n: 2}]]);

    // The pop is the second call; the write after it adds none.
    store.rows.pop();
    held.n = 3;
    expect(seen).toEqual([[{n: 2}], []]);
    expect(snapshot(held)).toEqual({n: 3});
  });

  it('held by two arrays of one store, a write reaches the array that still holds it and the store, and then only its own subscriber', () => {
    const record = {n: 1};
    const store = createClassyStore({a: [record], b: [record]});
    const held = store.a[0];
    const calls: string[] = [];
    subscribe(store, () => calls.push('store'), {sync: true});
    subscribe(store.a, () => calls.push('a'), {sync: true});
    subscribe(store.b, () => calls.push('b'), {sync: true});
    subscribe(held, () => calls.push('record'), {sync: true});

    store.a.pop();
    calls.push('-- write after a let go');
    held.n = 2;
    store.b.pop();
    calls.push('-- write after b let go');
    held.n = 3;

    expect(calls).toEqual([
      'a',
      'store',
      '-- write after a let go',
      'record',
      'b',
      'store',
      'b',
      'store',
      '-- write after b let go',
      'record',
    ]);
  });

  it('held by two stores, a write reaches the store that still holds it, and then neither', () => {
    const child = {n: 1};
    const one = createClassyStore<{child?: Row}>({child});
    const two = createClassyStore<{child?: Row}>({child});
    const held = present(one.child);
    delete one.child;
    const oneBefore = snapshot(one);
    const calls: string[] = [];
    subscribe(one, () => calls.push('one'), {sync: true});
    subscribe(two, () => calls.push('two'), {sync: true});

    held.n = 2;
    expect(calls).toEqual(['two']);
    expect(snapshot(two)).toEqual({child: {n: 2}});
    expect(snapshot(one)).toBe(oneBefore);

    // The delete is the second call; the write after it adds none.
    delete two.child;
    held.n = 3;
    expect(calls).toEqual(['two', 'two']);
    expect(snapshot(held)).toEqual({n: 3});
  });

  it('let go by two stores and written into one of them again, it reports to that store only', () => {
    const child = {n: 1};
    const one = createClassyStore<{child?: Row}>({child});
    const two = createClassyStore<{child?: Row}>({child});
    const held = present(one.child);
    delete one.child;
    delete two.child;
    held.n = 2;
    one.child = held;
    const calls: string[] = [];
    subscribe(one, () => calls.push('one'), {sync: true});
    subscribe(two, () => calls.push('two'), {sync: true});

    held.n = 3;

    expect(calls).toEqual(['one']);
    expect(snapshot(one)).toEqual({child: {n: 3}});
    expect(snapshot(two)).toEqual({});
  });
});

describe('what the collector can free', () => {
  /**
   * Whether the collector has freed the object behind `reference`. A
   * collection cannot be forced in one call, so it is requested up to
   * `attempts` times with a task boundary before each, as in
   * `core.ownership.test.ts`. Tests that expect `false` ask fewer times: an
   * object that is still referenced stays however often the collector runs.
   */
  async function isCollected(
    reference: WeakRef<object>,
    attempts = 30,
  ): Promise<boolean> {
    for (
      let attempt = 0;
      attempt < attempts && reference.deref() !== undefined;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      Bun.gc(true);
    }
    return reference.deref() === undefined;
  }

  // Each test builds the objects it expects to be freed inside a helper
  // function, so that no local variable of the test itself refers to them.

  it('a store that is dropped while one of its children is held is collected, and the child goes on working', async () => {
    const dropStore = () => {
      const store = createClassyStore({child: {n: 1}, label: 'dropped'});
      subscribe(store, () => {});
      snapshot(store);
      return {child: store.child, dropped: new WeakRef(store)};
    };
    const {child, dropped} = dropStore();
    const seen: number[] = [];
    subscribe(child, () => seen.push(snapshot(child).n), {sync: true});

    expect(await isCollected(dropped)).toBe(true);

    child.n = 2;
    expect(seen).toEqual([2]);
  });

  it('a list that was replaced is collected while a row it held lives on in the store', async () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const replaceList = () => {
      const replaced = store.rows;
      store.rows = replaced.filter((row) => row.n === 1);
      return new WeakRef(replaced);
    };

    expect(await isCollected(replaceList())).toBe(true);

    store.rows[0].n = 5;
    expect(snapshot(store)).toEqual({rows: [{n: 5}]});
  });

  it('a row held from a removed list does not keep that list alive, and works once the list is gone', async () => {
    const removeList = () => {
      const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
      const list = store.rows;
      const row = list[0];
      store.rows = [];
      return {store, row, removed: new WeakRef(list)};
    };
    const {store, row, removed} = removeList();

    expect(await isCollected(removed)).toBe(true);

    const seen: number[] = [];
    subscribe(row, () => seen.push(snapshot(row).n), {sync: true});
    row.n = 9;
    expect(seen).toEqual([9]);
    expect(snapshot(store)).toEqual({rows: []});
  });

  it('a child shared by two stores lets a dropped store be collected, and still reports to the other store', async () => {
    const shareChild = () => {
      const child = {n: 1};
      const kept = createClassyStore({child, label: 'kept'});
      const dropped = createClassyStore({child, label: 'dropped'});
      dropped.child.n = 2;
      return {kept, dropped: new WeakRef(dropped)};
    };
    const {kept, dropped} = shareChild();

    expect(await isCollected(dropped)).toBe(true);

    const seen: unknown[] = [];
    subscribe(kept, () => seen.push(snapshot(kept)), {sync: true});
    kept.child.n = 3;
    expect(seen).toEqual([{child: {n: 3}, label: 'kept'}]);
  });

  it.each(kinds)(
    'a $kind subscriber is collected once its unsubscribe function was called and dropped, while its store lives on',
    async ({options}) => {
      const store = createClassyStore({n: 1});
      const subscribeAndStop = () => {
        const callback = () => {};
        const stop = subscribe(store, callback, options);
        stop();
        return new WeakRef(callback);
      };

      expect(await isCollected(subscribeAndStop())).toBe(true);

      expect(store.n).toBe(1);
    },
  );

  // FINDING: an unsubscribe function refers to the callback it removed. Code
  // that keeps the function after calling it (in a list of cleanups, say)
  // keeps the callback, and whatever the callback closes over, alive.
  it('an unsubscribe function that is kept after it was called keeps its callback alive', async () => {
    const store = createClassyStore({n: 1});
    const subscribeAndStop = () => {
      const callback = () => {};
      const stop = subscribe(store, callback, {sync: true});
      stop();
      return {stop, callback: new WeakRef(callback)};
    };
    const {stop, callback} = subscribeAndStop();

    expect(await isCollected(callback, 5)).toBe(false);

    // Calling it again is the use that keeps it referenced up to here.
    stop();
  });

  it('a removed subtree that nobody holds is collected when its store was not snapshotted while it was there', async () => {
    const store = createClassyStore({slot: {n: 1}});
    const removeSlot = () => {
      const removed = new WeakRef(store.slot);
      store.slot = {n: 2};
      return removed;
    };

    expect(await isCollected(removeSlot())).toBe(true);

    expect(snapshot(store)).toEqual({slot: {n: 2}});
  });

  // FINDING: a store keeps its last snapshot, and a snapshot leads back to the
  // raw object it was made from (and so to that object's proxy and node). A
  // subtree removed after a snapshot was taken therefore stays in memory, with
  // everything it holds, until snapshot() is called on the store again.
  it('a removed subtree that nobody holds is kept alive by the last snapshot of its store, until the next snapshot is taken', async () => {
    const store = createClassyStore({slot: {n: 1}});
    const removeSlot = () => {
      const removed = new WeakRef(store.slot);
      snapshot(store);
      store.slot = {n: 2};
      return removed;
    };
    const removed = removeSlot();

    expect(await isCollected(removed, 5)).toBe(false);

    snapshot(store);
    expect(await isCollected(removed)).toBe(true);
  });

  // FINDING: the cached result of a store getter refers to the child it read.
  // A subtree removed after the getter ran stays in memory until the getter is
  // read again, which may be never.
  it('a removed subtree that nobody holds is kept alive by a store getter that read it, until that getter is read again', async () => {
    const store = createClassyStore({
      slot: {n: 1},
      get doubled(): number {
        return this.slot.n * 2;
      },
    });
    const removeSlot = () => {
      const removed = new WeakRef(store.slot);
      const doubled = store.doubled;
      store.slot = {n: 2};
      return {removed, doubled};
    };
    const {removed, doubled} = removeSlot();

    expect(doubled).toBe(2);
    expect(await isCollected(removed, 5)).toBe(false);

    expect(store.doubled).toBe(4);
    expect(await isCollected(removed)).toBe(true);
  });

  // FINDING: a snapshot is a frozen copy, yet holding one keeps the store it
  // came from alive: the raw state, the proxy and the node with its
  // subscribers. The link is the record that maps a snapshot to its source.
  it('a store that is dropped while a snapshot of it is held is not collected until the snapshot is dropped too', async () => {
    const held: unknown[] = [];
    const dropStore = () => {
      const store = createClassyStore({child: {n: 1}});
      held.push(snapshot(store));
      return new WeakRef(store);
    };
    const dropped = dropStore();

    expect(await isCollected(dropped, 5)).toBe(false);
    expect(held).toEqual([{child: {n: 1}}]);

    held.length = 0;
    expect(await isCollected(dropped)).toBe(true);
  });
});
