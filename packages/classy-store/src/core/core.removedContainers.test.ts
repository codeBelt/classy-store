import {describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// A container that leaves a store while nothing observes it stops following
// the objects below it, and catches up when a caller touches it again. These
// tests pin what a caller who kept a proxy into such a container reads back,
// through the public entry only. `core.characterisation.detached.test.ts`
// covers the plain cases; these are the sequences in which the catching up
// could go wrong. A comment starting with FINDING marks behaviour that looks
// like a bug; it is pinned all the same.

/** A value the test has just put in place. */
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value to be present');
  return value;
}

type Leaf = {x: number};
type Inner = {leaf: Leaf};
type Outer = {inner?: Inner};
type State = {outer?: Outer; pinned: Leaf};

/** A store whose `leaf` is held twice: deep inside `outer`, and by the root. */
function createState(): State {
  const leaf = {x: 1};
  return createClassyStore<State>({outer: {inner: {leaf}}, pinned: leaf});
}

describe('a list that left the store and shares a row with it', () => {
  it('shows a write made to the row after the list was read again, as well as one made before', () => {
    const row = {n: 1};
    const store = createClassyStore({rows: [row], pinned: [row]});
    const list = store.rows;
    const before = snapshot(list);
    store.rows = [];
    store.pinned[0].n = 2;

    // The read of `list[0]` is the first touch of the list since it left.
    list[0].n = 3;

    expect(before).toEqual([{n: 1}]);
    expect(snapshot(list)).toEqual([{n: 3}]);
  });
});

describe('an object held from a container that left the store', () => {
  it('shows a write to a child it shares with the store, after it was deleted from that container', () => {
    const store = createState();
    const outer = present(store.outer);
    const inner = present(outer.inner);
    const before = snapshot(inner);
    delete store.outer;
    delete outer.inner;
    // The container is observed for a while, and then is not any more.
    subscribe(outer, () => {})();

    store.pinned.x = 2;

    expect(before).toEqual({leaf: {x: 1}});
    expect(snapshot(inner)).toEqual({leaf: {x: 2}});
  });

  it('shows a write to a child it shares with the store, made before the container was frozen', () => {
    const store = createState();
    const outer = present(store.outer);
    const inner = present(outer.inner);
    // The subscriber keeps the object following its children while the
    // container leaves; it stops following them when the subscriber goes.
    const stop = subscribe(inner, () => {});
    const before = snapshot(inner);
    delete store.outer;
    stop();
    store.pinned.x = 2;

    Object.freeze(outer);

    expect(before).toEqual({leaf: {x: 1}});
    expect(snapshot(inner)).toEqual({leaf: {x: 2}});
  });

  // Each object catches up on its own when it is touched, so freezing the
  // container it came from changes nothing about it (decision 3).
  it('gives a current first snapshot once the container was frozen', () => {
    const store = createState();
    const outer = present(store.outer);
    const inner = present(outer.inner);
    const before = snapshot(inner);
    delete store.outer;
    store.pinned.x = 2;

    Object.freeze(outer);
    const first = snapshot(inner);
    const second = snapshot(inner);

    expect(inner.leaf.x).toBe(2);
    expect(first).not.toBe(before);
    expect(first).toEqual({leaf: {x: 2}});
    expect(second).toBe(first);
  });

  it('tells a subscriber added right after the container was frozen about a write to a child it shares with the store', () => {
    const store = createState();
    const outer = present(store.outer);
    const inner = present(outer.inner);
    delete store.outer;
    Object.freeze(outer);
    const calls: string[] = [];
    subscribe(inner, () => calls.push('inner'), {sync: true});

    store.pinned.x = 2;
    expect(calls).toEqual(['inner']);

    snapshot(inner);
    store.pinned.x = 3;
    expect(calls).toEqual(['inner', 'inner']);
  });

  it('lets a write through a held object reach the store when its parent is still shared with the store', () => {
    const shared = {leaf: {x: 1}};
    const store = createClassyStore<{
      outer?: {inner: typeof shared};
      pinned: typeof shared;
    }>({outer: {inner: shared}, pinned: shared});
    const leaf = store.pinned.leaf;
    expect(snapshot(store).pinned.leaf.x).toBe(1);
    const calls: string[] = [];
    subscribe(store, () => calls.push('store'), {sync: true});

    delete store.outer;
    leaf.x = 2;

    expect(calls).toEqual(['store', 'store']);
    expect(snapshot(store).pinned.leaf.x).toBe(2);
  });

  it('returns from a read below a frozen container that the object points back to', () => {
    const store = createClassyStore<{
      outer?: {inner: {x: number; back?: object}};
    }>({outer: {inner: {x: 1}}});
    const outer = present(store.outer);
    const inner = outer.inner;
    delete store.outer;
    Object.defineProperty(outer, 'inner', {
      writable: false,
      configurable: false,
    });
    snapshot(inner);
    snapshot(inner);
    inner.back = outer;
    subscribe(inner, () => {})();

    expect(inner.x).toBe(1);
    expect(snapshot(inner)).toEqual({x: 1, back: snapshot(outer)});
  });
});
