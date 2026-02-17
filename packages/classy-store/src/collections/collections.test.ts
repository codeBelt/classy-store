import {describe, expect, test} from 'bun:test';
import {createClassyStore, subscribe} from '../core/core';
import {snapshot} from '../snapshot/snapshot';
import {reactiveMap, reactiveSet} from './collections';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Flush the microtask queue so batched notifications fire. */
const flush = () => new Promise<void>((r) => queueMicrotask(r));

// ── ReactiveMap ───────────────────────────────────────────────────────────────

describe('reactiveMap()', () => {
  test('initialises empty', () => {
    const m = reactiveMap<string, number>();
    expect(m.size).toBe(0);
    expect(m.has('x')).toBe(false);
    expect(m.get('x')).toBeUndefined();
  });

  test('initialises from iterable', () => {
    const m = reactiveMap([
      ['a', 1],
      ['b', 2],
    ] as [string, number][]);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBe(2);
  });

  test('deduplicates initial entries (last value wins, like native Map)', () => {
    const m = reactiveMap([
      ['a', 1],
      ['b', 2],
      ['a', 3],
    ] as [string, number][]);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(3); // last value wins
    expect(m.get('b')).toBe(2);
  });

  test('set / get / has / delete / clear', () => {
    const m = reactiveMap<string, number>();
    m.set('x', 10);
    expect(m.has('x')).toBe(true);
    expect(m.get('x')).toBe(10);
    expect(m.size).toBe(1);

    m.set('x', 20); // overwrite
    expect(m.get('x')).toBe(20);
    expect(m.size).toBe(1);

    expect(m.delete('x')).toBe(true);
    expect(m.has('x')).toBe(false);
    expect(m.delete('x')).toBe(false); // already gone

    m.set('a', 1);
    m.set('b', 2);
    m.clear();
    expect(m.size).toBe(0);
  });

  test('iteration helpers', () => {
    const m = reactiveMap([
      ['a', 1],
      ['b', 2],
    ] as [string, number][]);
    expect([...m.keys()]).toEqual(['a', 'b']);
    expect([...m.values()]).toEqual([1, 2]);
    expect([...m.entries()]).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect([...m]).toEqual([
      ['a', 1],
      ['b', 2],
    ]);

    const collected: [string, number][] = [];
    m.forEach((v, k) => {
      collected.push([k, v]);
    });
    expect(collected).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  test('triggers store subscription on set', async () => {
    const s = createClassyStore({users: reactiveMap<string, string>()});
    let count = 0;
    subscribe(s, () => count++);

    s.users.set('id1', 'Alice');
    await flush();
    expect(count).toBe(1);
    expect(s.users.get('id1')).toBe('Alice');
  });

  test('triggers store subscription on delete', async () => {
    const s = createClassyStore({
      users: reactiveMap([['id1', 'Alice']] as [string, string][]),
    });
    let count = 0;
    subscribe(s, () => count++);

    s.users.delete('id1');
    await flush();
    expect(count).toBe(1);
    expect(s.users.has('id1')).toBe(false);
  });

  test('triggers store subscription on clear', async () => {
    const s = createClassyStore({
      users: reactiveMap([
        ['a', 1],
        ['b', 2],
      ] as [string, number][]),
    });
    let count = 0;
    subscribe(s, () => count++);

    s.users.clear();
    await flush();
    expect(count).toBe(1);
    expect(s.users.size).toBe(0);
  });

  test('snapshot captures map data', async () => {
    const s = createClassyStore({
      m: reactiveMap([['k', 'v']] as [string, string][]),
    });
    const snap = snapshot(s);
    expect(snap.m._entries).toEqual([['k', 'v']]);
    // Snapshot is frozen
    expect(Object.isFrozen(snap.m)).toBe(true);
  });
});

// ── ReactiveSet ───────────────────────────────────────────────────────────────

describe('reactiveSet()', () => {
  test('initialises empty', () => {
    const s = reactiveSet<string>();
    expect(s.size).toBe(0);
    expect(s.has('x')).toBe(false);
  });

  test('initialises from iterable (deduplicates)', () => {
    const s = reactiveSet([1, 2, 2, 3]);
    expect(s.size).toBe(3);
    expect(s.has(2)).toBe(true);
  });

  test('add / has / delete / clear', () => {
    const s = reactiveSet<number>();
    s.add(1);
    expect(s.has(1)).toBe(true);
    expect(s.size).toBe(1);

    s.add(1); // no-op
    expect(s.size).toBe(1);

    expect(s.delete(1)).toBe(true);
    expect(s.has(1)).toBe(false);
    expect(s.delete(1)).toBe(false);

    s.add(10);
    s.add(20);
    s.clear();
    expect(s.size).toBe(0);
  });

  test('iteration helpers', () => {
    const s = reactiveSet([1, 2, 3]);
    expect([...s.keys()]).toEqual([1, 2, 3]);
    expect([...s.values()]).toEqual([1, 2, 3]);
    expect([...s.entries()]).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect([...s]).toEqual([1, 2, 3]);

    const collected: number[] = [];
    s.forEach((v) => {
      collected.push(v);
    });
    expect(collected).toEqual([1, 2, 3]);
  });

  test('triggers store subscription on add', async () => {
    const s = createClassyStore({tags: reactiveSet<string>()});
    let count = 0;
    subscribe(s, () => count++);

    s.tags.add('urgent');
    await flush();
    expect(count).toBe(1);
    expect(s.tags.has('urgent')).toBe(true);
  });

  test('triggers store subscription on delete', async () => {
    const s = createClassyStore({tags: reactiveSet(['a', 'b'])});
    let count = 0;
    subscribe(s, () => count++);

    s.tags.delete('a');
    await flush();
    expect(count).toBe(1);
    expect(s.tags.has('a')).toBe(false);
  });

  test('triggers store subscription on clear', async () => {
    const s = createClassyStore({tags: reactiveSet(['a', 'b'])});
    let count = 0;
    subscribe(s, () => count++);

    s.tags.clear();
    await flush();
    expect(count).toBe(1);
    expect(s.tags.size).toBe(0);
  });

  test('snapshot captures set data', async () => {
    const s = createClassyStore({t: reactiveSet([1, 2, 3])});
    const snap = snapshot(s);
    expect(snap.t._items).toEqual([1, 2, 3]);
    expect(Object.isFrozen(snap.t)).toBe(true);
  });
});

// ── Integration: used inside a class store ────────────────────────────────────

describe('collections inside class store', () => {
  class ProjectStore {
    members = reactiveMap<string, {name: string; role: string}>();
    labels = reactiveSet<string>();

    addMember(id: string, name: string, role: string) {
      this.members.set(id, {name, role});
    }

    addLabel(label: string) {
      this.labels.add(label);
    }
  }

  test('class methods mutate collections reactively', async () => {
    const s = createClassyStore(new ProjectStore());
    let count = 0;
    subscribe(s, () => count++);

    s.addMember('u1', 'Alice', 'admin');
    s.addLabel('bug');
    await flush();

    expect(count).toBe(1); // batched into one notification
    expect(s.members.get('u1')).toEqual({name: 'Alice', role: 'admin'});
    expect(s.labels.has('bug')).toBe(true);
  });
});

// ── ReactiveMap — additional edge cases ────────────────────────────────────

describe('reactiveMap() — edge cases', () => {
  test('supports numeric keys', () => {
    const m = reactiveMap<number, string>();
    m.set(1, 'one');
    m.set(2, 'two');
    expect(m.get(1)).toBe('one');
    expect(m.size).toBe(2);
    expect(m.delete(1)).toBe(true);
    expect(m.size).toBe(1);
  });

  test('supports object keys with Object.is comparison', () => {
    const key1 = {id: 1};
    const key2 = {id: 2};
    const m = reactiveMap<object, string>();
    m.set(key1, 'first');
    m.set(key2, 'second');

    expect(m.get(key1)).toBe('first');
    expect(m.get(key2)).toBe('second');

    // Different object with same shape is NOT the same key
    expect(m.get({id: 1})).toBeUndefined();
  });

  test('set() returns this for chaining', () => {
    const m = reactiveMap<string, number>();
    const result = m.set('a', 1);
    expect(result).toBe(m);

    // Chaining
    m.set('b', 2).set('c', 3);
    expect(m.size).toBe(3);
  });

  test('handles NaN as key (Object.is(NaN, NaN) is true)', () => {
    const m = reactiveMap<number, string>();
    m.set(Number.NaN, 'nan-value');

    expect(m.has(Number.NaN)).toBe(true);
    expect(m.get(Number.NaN)).toBe('nan-value');
    expect(m.size).toBe(1);

    // Overwriting NaN key
    m.set(Number.NaN, 'updated');
    expect(m.size).toBe(1);
    expect(m.get(Number.NaN)).toBe('updated');
  });

  test('delete returns false for non-existent key', () => {
    const m = reactiveMap<string, number>();
    expect(m.delete('missing')).toBe(false);
  });

  test('forEach receives the map as third argument', () => {
    const m = reactiveMap([['a', 1]] as [string, number][]);
    m.forEach((_v, _k, map) => {
      expect(map).toBe(m);
    });
  });

  test('snapshot of mutated ReactiveMap reflects latest state', async () => {
    const s = createClassyStore({m: reactiveMap<string, number>()});
    s.m.set('x', 10);
    s.m.set('y', 20);
    await flush();

    const snap = snapshot(s);
    expect(snap.m._entries).toEqual([
      ['x', 10],
      ['y', 20],
    ]);
  });
});

// ── ReactiveSet — additional edge cases ────────────────────────────────────

describe('reactiveSet() — edge cases', () => {
  test('add() returns this for chaining', () => {
    const s = reactiveSet<number>();
    const result = s.add(1);
    expect(result).toBe(s);

    s.add(2).add(3);
    expect(s.size).toBe(3);
  });

  test('handles NaN values (Object.is(NaN, NaN) is true)', () => {
    const s = reactiveSet<number>();
    s.add(Number.NaN);

    expect(s.has(Number.NaN)).toBe(true);
    expect(s.size).toBe(1);

    // Adding NaN again should be no-op
    s.add(Number.NaN);
    expect(s.size).toBe(1);

    expect(s.delete(Number.NaN)).toBe(true);
    expect(s.size).toBe(0);
  });

  test('delete returns false for non-existent value', () => {
    const s = reactiveSet<string>();
    expect(s.delete('missing')).toBe(false);
  });

  test('forEach receives the set as third argument', () => {
    const s = reactiveSet([1]);
    s.forEach((_v, _k, set) => {
      expect(set).toBe(s);
    });
  });

  test('entries returns [value, value] pairs matching Set spec', () => {
    const s = reactiveSet([10, 20]);
    expect([...s.entries()]).toEqual([
      [10, 10],
      [20, 20],
    ]);
  });

  test('keys and values return the same sequence', () => {
    const s = reactiveSet(['a', 'b', 'c']);
    expect([...s.keys()]).toEqual([...s.values()]);
  });

  test('clear on empty set does not throw', () => {
    const s = reactiveSet<number>();
    expect(() => s.clear()).not.toThrow();
  });

  test('snapshot of mutated ReactiveSet reflects latest state', async () => {
    const s = createClassyStore({tags: reactiveSet<string>()});
    s.tags.add('a');
    s.tags.add('b');
    s.tags.delete('a');
    await flush();

    const snap = snapshot(s);
    expect(snap.tags._items).toEqual(['b']);
  });

  test('add duplicate after delete re-adds the value', () => {
    const s = reactiveSet([1, 2, 3]);
    s.delete(2);
    expect(s.has(2)).toBe(false);
    s.add(2);
    expect(s.has(2)).toBe(true);
    expect(s.size).toBe(3);
  });
});
