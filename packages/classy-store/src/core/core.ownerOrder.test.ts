import {describe, expect, it} from 'bun:test';
import {createClassyStore, subscribe} from '../index';

// An object held by several owners tells them about a write in the order they
// took it. `core.characterisation.notifications.test.ts` pins that order for
// owners that never change. These tests pin what happens to an owner's place
// when it stops being observed, is given the object again, or leaves the store
// and comes back. A comment starting with FINDING marks behaviour that looks
// like a surprise; it is pinned all the same.

type Row = {count: number};
type Box = {inner: {record: Row}};

describe('the place of an owner among the owners of a shared object', () => {
  it('a store keeps its place when its last subscriber is removed', () => {
    const child = {count: 1};
    const one = createClassyStore({child});
    const two = createClassyStore({child});
    subscribe(one, () => {})();
    const calls: string[] = [];
    subscribe(two, () => calls.push('two'), {sync: true});
    subscribe(one, () => calls.push('one'), {sync: true});

    two.child.count = 2;

    expect(calls).toEqual(['one', 'two']);
  });

  it('a store keeps its place when it is assigned the object it already inherits', () => {
    const shared = {count: 1};
    const first = createClassyStore<{shared: Row}>(Object.create({shared}));
    // The store takes an inherited object when it is first read.
    const held = first.shared;
    const second = createClassyStore({shared});
    const calls: string[] = [];
    subscribe(second, () => calls.push('second'), {sync: true});
    subscribe(first, () => calls.push('first'), {sync: true});

    first.shared = held;
    calls.length = 0;
    second.shared.count = 2;

    expect(Object.hasOwn(first, 'shared')).toBe(true);
    expect(calls).toEqual(['first', 'second']);
  });

  /** What happened to the container while it was out of the store. */
  const trips: {
    meanwhile: string;
    observe: (box: Box) => () => void;
    place: string;
    order: string[];
  }[] = [
    {
      meanwhile: 'nothing observed it',
      observe: () => () => {},
      place: 'after',
      order: ['record', 'other', 'inner'],
    },
    {
      meanwhile: 'it had a subscriber',
      observe: (box) => subscribe(box, () => {}),
      place: 'before',
      order: ['record', 'inner', 'other'],
    },
  ];

  // FINDING: whether an owner keeps its place across a trip out of the store depends on whether anything observed it meanwhile.
  it.each(trips)(
    'an owner inside a container that left the store and came back, while $meanwhile, is called $place a later owner of the same record',
    ({observe, order}) => {
      const store = createClassyStore<{box: Box; other?: {record: Row}}>({
        box: {inner: {record: {count: 1}}},
      });
      const box = store.box;
      const record = box.inner.record;
      // The later owner of the record.
      store.other = {record};
      const stop = observe(box);
      store.box = {inner: {record: {count: 100}}};
      store.box = box;
      stop();
      const calls: string[] = [];
      subscribe(store.other, () => calls.push('other'), {sync: true});
      subscribe(box.inner, () => calls.push('inner'), {sync: true});
      subscribe(record, () => calls.push('record'), {sync: true});

      record.count = 2;

      expect(calls).toEqual(order);
    },
  );

  // FINDING: two owners inside one container swap places once that container has left the store and come back.
  it('two owners inside a container are called in the opposite order once the container left the store and came back', () => {
    type Pair = {left: {record: Row}; right: {record: Row}};
    const record = {count: 1};
    const store = createClassyStore<{box: Pair}>({
      box: {left: {record}, right: {record}},
    });
    const box = store.box;
    /** Who is called for one write to the record, with subscribers that do not outlive it. */
    const calledForOneWrite = () => {
      const calls: string[] = [];
      const stops = [
        subscribe(box.right, () => calls.push('right'), {sync: true}),
        subscribe(box.left, () => calls.push('left'), {sync: true}),
      ];
      box.left.record.count++;
      for (const stop of stops) stop();
      return calls;
    };
    const before = calledForOneWrite();

    store.box = {left: {record: {count: 0}}, right: {record: {count: 0}}};
    store.box = box;

    expect(before).toEqual(['left', 'right']);
    expect(calledForOneWrite()).toEqual(['right', 'left']);
  });
});
