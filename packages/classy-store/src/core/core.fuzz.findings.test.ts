import {describe, expect, mock, test} from 'bun:test';
import {reactiveMap, reactiveSet} from '../collections/index';
import {createClassyStore, snapshot, subscribe} from '../index';

// What the differential test in core.fuzz.test.ts found: each case is one where
// the store and a plain mirror of it disagree. Every test here pins what the
// store does today, in its smallest form, and says what the mirror expected.
// The random run leaves out exactly these cases, or follows the store in them,
// at the places marked FINDING in core.fuzz.test.ts.

/** Ordinary subscribers are told on a microtask: let it run before asserting. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Row = {id: number; v: number};

describe('core — findings of the differential test', () => {
  describe('a delete that removes nothing counts as a write', () => {
    // FINDING: a delete that removes nothing counts as a write: subscribers are called and the snapshot is replaced by an equal one. Expected: no call and the same snapshot, as for a write of the value a property already has.
    test('deleting a key that is not there notifies and replaces the snapshot', async () => {
      const store = createClassyStore({dict: {} as Record<string, number>});
      const sync = mock(() => {});
      const ordinary = mock(() => {});
      subscribe(store, sync, {sync: true});
      subscribe(store, ordinary);
      const before = snapshot(store);

      delete store.dict.missing;

      expect(sync).toHaveBeenCalledTimes(1);
      expect(snapshot(store)).not.toBe(before);
      expect(snapshot(store).dict).not.toBe(before.dict);
      expect(snapshot(store)).toEqual(before);
      await flush();
      expect(ordinary).toHaveBeenCalledTimes(1);
    });

    test('a write of the value already there does neither, for comparison', async () => {
      const store = createClassyStore({dict: {present: 1}});
      const sync = mock(() => {});
      const ordinary = mock(() => {});
      subscribe(store, sync, {sync: true});
      subscribe(store, ordinary);
      const before = snapshot(store);

      store.dict.present = 1;

      expect(sync).toHaveBeenCalledTimes(0);
      expect(snapshot(store)).toBe(before);
      await flush();
      expect(ordinary).toHaveBeenCalledTimes(0);
    });

    // FINDING: the same for an array index that is not there, including one past the end.
    test('deleting an index past the end of a list notifies and replaces the snapshot', () => {
      const store = createClassyStore({list: [1, 2]});
      const sync = mock(() => {});
      subscribe(store, sync, {sync: true});
      const before = snapshot(store);

      delete store.list[5];

      expect(sync).toHaveBeenCalledTimes(1);
      expect(snapshot(store).list).not.toBe(before.list);
      expect(snapshot(store)).toEqual(before);
    });

    // FINDING: an array method that deletes a hole does the same: `sort` on a list that is in order already but has a hole, and `copyWithin` of a hole onto a hole. Expected: no call, as for `sort` on a list in order without holes.
    test('sort and copyWithin over holes notify though the list does not change', () => {
      const store = createClassyStore({list: [1, 2]});
      store.list.length = 4;
      const sync = mock(() => {});
      subscribe(store, sync, {sync: true});
      const before = snapshot(store);

      store.list.sort();

      expect(sync).toHaveBeenCalledTimes(1);
      expect(snapshot(store).list).not.toBe(before.list);
      expect(snapshot(store)).toEqual(before);

      store.list.copyWithin(2, 3);

      expect(sync).toHaveBeenCalledTimes(2);
      expect(snapshot(store)).toEqual(before);
    });

    test('sort on a list in order without holes does not notify, for comparison', () => {
      const store = createClassyStore({list: [1, 2]});
      const sync = mock(() => {});
      subscribe(store, sync, {sync: true});
      const before = snapshot(store);

      store.list.sort();

      expect(sync).toHaveBeenCalledTimes(0);
      expect(snapshot(store)).toBe(before);
    });
  });

  describe('getters', () => {
    // FINDING: a live getter that reads a property which does not exist is recomputed on every read. Expected: one computation until something it reads changes, as on a snapshot, and as when the property exists and holds `undefined`.
    test('a live getter that reads a missing property is recomputed on every read', () => {
      const runs = mock(() => {});
      class Holder {
        slot?: number = undefined;

        get view() {
          runs();
          return {slot: this.slot ?? 0};
        }
      }
      const store = createClassyStore(new Holder());

      const present = store.view;
      expect(store.view).toBe(present);
      expect(runs).toHaveBeenCalledTimes(1);

      delete store.slot;
      const missing = store.view;
      expect(store.view).not.toBe(missing);
      expect(store.view).toEqual({slot: 0});
      expect(runs).toHaveBeenCalledTimes(4);

      const frozen = snapshot(store);
      expect(frozen.view).toBe(frozen.view);
    });

    // FINDING: a live getter that asks which keys `this` has (`Object.keys(this)`, `key in this`) is never recomputed, so it is stale once a key is added or deleted. Expected: 1 key and no `b` after the delete, which is what a store that first reads the getter after the delete answers.
    test('a live getter that asks for the keys of `this` is stale after a delete', () => {
      class Bag {
        a = 1;
        b?: number = 2;

        get count() {
          return Object.keys(this).length;
        }

        get hasB() {
          return 'b' in this;
        }
      }
      const store = createClassyStore(new Bag());
      expect(store.count).toBe(2);
      expect(store.hasB).toBe(true);

      delete store.b;

      expect(Object.keys(store)).toEqual(['a']);
      expect(store.count).toBe(2);
      expect(store.hasB).toBe(true);

      const readLate = createClassyStore(new Bag());
      delete readLate.b;
      expect(readLate.count).toBe(1);
      expect(readLate.hasB).toBe(false);
    });

    // FINDING: a snapshot getter that asks which keys `this` has sees none at all: `Object.keys(this)` is empty and `key in this` is false. Expected: what the live getter answers, 2 and true here.
    test('a snapshot getter that asks for the keys of `this` sees no keys', () => {
      class Bag {
        a = 1;
        b?: number = 2;

        get count() {
          return Object.keys(this).length;
        }

        get hasB() {
          return 'b' in this;
        }
      }
      const store = createClassyStore(new Bag());
      const frozen = snapshot(store);

      expect(store.count).toBe(2);
      expect(store.hasB).toBe(true);
      expect('b' in frozen).toBe(true);
      expect(frozen.count).toBe(0);
      expect(frozen.hasB).toBe(false);
    });
  });

  describe('reactive collections', () => {
    // FINDING: +0 and -0 are two members of a reactive collection when added with `add` or `set`, and one when given to the constructor. Expected: one member, as in a native `Set` or `Map`.
    test('+0 and -0 are two members when added and one when constructed', () => {
      const store = createClassyStore({
        set: reactiveSet<number>([0]),
        map: reactiveMap<number, string>([[0, 'first']]),
      });

      store.set.add(-0);
      store.map.set(-0, 'second');

      expect(store.set.size).toBe(2);
      expect(store.map.size).toBe(2);
      expect(store.map.get(0)).toBe('first');
      expect(new Set([0]).add(-0).size).toBe(1);

      expect(reactiveSet([0, -0]).size).toBe(1);
      expect(
        reactiveMap([
          [0, 'first'],
          [-0, 'second'],
        ]).size,
      ).toBe(1);
    });

    // FINDING: a collection built from one object in two forms, raw and as its store proxy, holds it twice. Expected: once, which is what `add` and `set` give.
    test('a collection constructed from a row and its proxy holds the row twice', () => {
      const raw: Row = {id: 1, v: 1};
      const store = createClassyStore({
        rows: [raw],
        picked: reactiveSet<Row>(),
        notes: reactiveMap<Row, number>(),
      });
      const proxy = store.rows[0];

      store.picked = reactiveSet([raw, proxy]);
      store.notes = reactiveMap([
        [raw, 1],
        [proxy, 2],
      ]);

      expect(store.picked.size).toBe(2);
      expect(store.notes.size).toBe(2);
      expect(store.notes.get(proxy)).toBe(1);
      expect(store.picked.delete(raw)).toBe(true);
      expect(store.picked.has(raw)).toBe(true);

      store.picked = reactiveSet<Row>();
      store.picked.add(raw);
      store.picked.add(proxy);
      expect(store.picked.size).toBe(1);
    });

    // FINDING: a snapshot of a row given as a new map key or set member is stored as that frozen snapshot, yet it answers for the live row: `has(row)` is true and `set(row, …)` writes to its entry, while the stored key no longer follows the row. Expected: either the live row is stored, or the snapshot is a member of its own that the row does not name.
    test('a snapshot given as a new member is stored frozen and answers for the live row', () => {
      const store = createClassyStore({
        rows: [{id: 1, v: 1}] as Row[],
        picked: reactiveSet<Row>(),
        notes: reactiveMap<Row, number>(),
      });
      const row = store.rows[0];
      const frozen = snapshot(row) as Row;

      store.notes.set(frozen, 1);
      store.picked.add(frozen);
      row.v = 9;

      const [key] = store.notes.keys();
      const [member] = store.picked;
      expect(key).toBe(frozen);
      expect(member).toBe(frozen);
      expect(key.v).toBe(1);
      expect(store.notes.has(row)).toBe(true);
      expect(store.picked.has(row)).toBe(true);

      store.notes.set(row, 2);
      store.picked.add(row);
      expect(store.notes.size).toBe(1);
      expect(store.picked.size).toBe(1);
      expect(store.notes.get(row)).toBe(2);
      expect([...store.notes.keys()][0]).toBe(frozen);
    });
  });
});
