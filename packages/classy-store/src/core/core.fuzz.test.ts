import {describe, expect, test} from 'bun:test';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore, subscribe} from './core';

// Differential test. After every random operation:
//   - the frozen snapshot holds exactly the live data,
//   - a visible change produced a new root snapshot and a sync notification,
//   - memoized getters, live and on the snapshot, match a fresh computation.
// Rows are aliased across lists, detached, retained, edited and reattached,
// which is where stale caches and missed owner links would show up.

/** Deterministic PRNG (mulberry32), so a failure names a seed that replays. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

type Leaf = {v: number};

class Root {
  a: Leaf[] = [];
  b: Leaf[] = [];
  dict: Record<string, Leaf> = {};
  slot: Leaf | null = null;
  n = 0;

  get sumA() {
    return this.a.reduce((total, row) => total + row.v, 0);
  }

  get dictSize() {
    return Object.keys(this.dict).length;
  }

  get slotPlusN() {
    return (this.slot?.v ?? 0) + this.n;
  }

  get combined() {
    return this.sumA + this.dictSize + this.slotPlusN;
  }

  bump() {
    this.n++;
    for (const row of this.a) row.v++;
  }
}

// Readonly, so that both the live store and a frozen snapshot fit.
type View = {
  readonly a: readonly Readonly<Leaf>[];
  readonly b: readonly Readonly<Leaf>[];
  readonly dict: Readonly<Record<string, Readonly<Leaf>>>;
  readonly slot: Readonly<Leaf> | null;
  readonly n: number;
};
type Getters = Pick<Root, 'sumA' | 'dictSize' | 'slotPlusN' | 'combined'>;

const data = (view: View) =>
  JSON.stringify({
    a: view.a,
    b: view.b,
    dict: view.dict,
    slot: view.slot,
    n: view.n,
  });

const getters = (view: Getters) =>
  JSON.stringify({
    sumA: view.sumA,
    dictSize: view.dictSize,
    slotPlusN: view.slotPlusN,
    combined: view.combined,
  });

function expectedGetters(view: View): string {
  const sumA = view.a.reduce((total, row) => total + row.v, 0);
  const dictSize = Object.keys(view.dict).length;
  const slotPlusN = (view.slot?.v ?? 0) + view.n;
  return JSON.stringify({
    sumA,
    dictSize,
    slotPlusN,
    combined: sumA + dictSize + slotPlusN,
  });
}

/** Run one seed. Returns a description of the first divergence, if any. */
function runSeed(seed: number, steps: number): string | undefined {
  const next = random(seed);
  const int = (bound: number) => Math.floor(next() * bound);
  const store = createClassyStore(new Root());
  let notified = 0;
  subscribe(store, () => notified++, {sync: true});
  const retained: Leaf[] = []; // Proxies kept by "user code", possibly detached.
  let counter = 0;
  const fresh = (): Leaf => ({v: ++counter});
  const history: string[] = [];

  for (let step = 0; step < steps; step++) {
    const before = data(store);
    const beforeSnapshot = snapshot(store);
    const beforeNotified = notified;
    const list = next() < 0.5 ? store.a : store.b;
    const operation = int(19);
    let name = '';
    switch (operation) {
      case 0:
        name = 'push';
        list.push(fresh());
        break;
      case 1:
        name = 'pop';
        list.pop();
        break;
      case 2:
        name = 'unshift';
        list.unshift(fresh());
        break;
      case 3:
        name = 'splice';
        list.splice(
          int(list.length + 1),
          int(3),
          ...(next() < 0.5 ? [fresh()] : []),
        );
        break;
      case 4:
        name = 'sort';
        list.sort((x, y) => y.v - x.v);
        break;
      case 5:
        name = 'reverse';
        list.reverse();
        break;
      case 6:
        name = 'truncate';
        list.length = int(list.length + 1);
        break;
      case 7:
        name = 'edit row';
        if (list.length) list[int(list.length)].v = ++counter;
        break;
      case 8:
        name = 'replace list with a filtered copy';
        if (next() < 0.5) store.a = store.a.filter(() => next() < 0.7);
        else store.b = store.b.filter(() => next() < 0.7);
        break;
      case 9:
        name = 'alias a row across lists';
        if (store.a.length) store.b.push(store.a[int(store.a.length)]);
        break;
      case 10:
        name = 'alias a row into the slot';
        store.slot = list.length ? list[int(list.length)] : null;
        break;
      case 11:
        name = 'alias a row into the dict';
        if (list.length) store.dict[`k${int(5)}`] = list[int(list.length)];
        break;
      case 12:
        name = 'delete a dict key';
        delete store.dict[`k${int(5)}`];
        break;
      case 13:
        name = 'retain a row';
        if (list.length) retained.push(list[int(list.length)]);
        break;
      case 14:
        name = 'edit a retained row';
        if (retained.length) retained[int(retained.length)].v = ++counter;
        break;
      case 15:
        name = 'reattach a retained row';
        if (retained.length) list.push(retained[int(retained.length)]);
        break;
      case 16:
        name = 'edit the slot';
        if (store.slot) store.slot.v = ++counter;
        break;
      case 17: {
        name = 'swap the lists';
        const held = store.a;
        store.a = store.b;
        store.b = held;
        break;
      }
      default:
        name = 'store method';
        store.bump();
    }
    history.push(name);

    const after = data(store);
    const current = snapshot(store);
    const problems: string[] = [];
    if (data(current) !== after) problems.push('snapshot data is stale');
    if (before !== after && current === beforeSnapshot)
      problems.push('root snapshot kept its identity after a visible change');
    if (before !== after && notified === beforeNotified)
      problems.push('no sync notification for a visible change');
    if (getters(store) !== expectedGetters(store))
      problems.push('a live getter is stale');
    if (getters(current) !== expectedGetters(store))
      problems.push('a snapshot getter is stale');
    if (problems.length) {
      return `seed ${seed}, step ${step}, after "${name}": ${problems.join('; ')}. Last operations: ${history.slice(-10).join(', ')}`;
    }
  }
  return undefined;
}

describe('core — randomized differential test', () => {
  test('snapshots, notifications and getters stay consistent under random edits', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const failure = runSeed(seed, 300);
      if (failure) failures.push(failure);
    }
    expect(failures).toEqual([]);
  });
});
