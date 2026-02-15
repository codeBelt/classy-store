import {describe, expect, test} from 'bun:test';
import {reactiveMap, reactiveSet, snapshot, store, subscribe} from './index';

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
    const s = store({users: reactiveMap<string, string>()});
    let count = 0;
    subscribe(s, () => count++);

    s.users.set('id1', 'Alice');
    await flush();
    expect(count).toBe(1);
    expect(s.users.get('id1')).toBe('Alice');
  });

  test('triggers store subscription on delete', async () => {
    const s = store({
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
    const s = store({
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
    const s = store({m: reactiveMap([['k', 'v']] as [string, string][])});
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
    const s = store({tags: reactiveSet<string>()});
    let count = 0;
    subscribe(s, () => count++);

    s.tags.add('urgent');
    await flush();
    expect(count).toBe(1);
    expect(s.tags.has('urgent')).toBe(true);
  });

  test('triggers store subscription on delete', async () => {
    const s = store({tags: reactiveSet(['a', 'b'])});
    let count = 0;
    subscribe(s, () => count++);

    s.tags.delete('a');
    await flush();
    expect(count).toBe(1);
    expect(s.tags.has('a')).toBe(false);
  });

  test('triggers store subscription on clear', async () => {
    const s = store({tags: reactiveSet(['a', 'b'])});
    let count = 0;
    subscribe(s, () => count++);

    s.tags.clear();
    await flush();
    expect(count).toBe(1);
    expect(s.tags.size).toBe(0);
  });

  test('snapshot captures set data', async () => {
    const s = store({t: reactiveSet([1, 2, 3])});
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
    const s = store(new ProjectStore());
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
