import {describe, expect, it} from 'bun:test';
import {createClassyStore} from '../core/core';
import {snapshot} from './snapshot';

/** Helper: flush the queueMicrotask-based batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('snapshot()', () => {
  // ── Freezing ──────────────────────────────────────────────────────────────

  describe('freezing', () => {
    it('returns a deeply frozen object', () => {
      const s = createClassyStore({user: {name: 'Alice'}, items: [1, 2, 3]});
      const snap = snapshot(s);

      expect(Object.isFrozen(snap)).toBe(true);
      expect(Object.isFrozen(snap.user)).toBe(true);
      expect(Object.isFrozen(snap.items)).toBe(true);
    });

    it('throws when attempting to mutate a snapshot', () => {
      const s = createClassyStore({count: 0});
      const snap = snapshot(s);

      expect(() => {
        (snap as {count: number}).count = 1;
      }).toThrow();
    });
  });

  // ── Version cache ─────────────────────────────────────────────────────────

  describe('version cache', () => {
    it('returns the same snapshot object when version has not changed', () => {
      const s = createClassyStore({count: 0});
      const snap1 = snapshot(s);
      const snap2 = snapshot(s);

      expect(snap1).toBe(snap2); // identical reference
    });

    it('returns a new snapshot after mutation + flush', async () => {
      const s = createClassyStore({count: 0});
      const snap1 = snapshot(s);

      s.count = 1;
      await flush();

      const snap2 = snapshot(s);
      expect(snap1).not.toBe(snap2);
      expect(snap1.count).toBe(0);
      expect(snap2.count).toBe(1);
    });
  });

  // ── Structural sharing ────────────────────────────────────────────────────

  describe('structural sharing', () => {
    it('unchanged nested objects retain the same reference across snapshots', async () => {
      const s = createClassyStore({
        user: {name: 'Alice'},
        settings: {theme: 'dark'},
      });
      const snap1 = snapshot(s);

      // Mutate only `user`, leave `settings` untouched.
      s.user.name = 'Bob';
      await flush();

      const snap2 = snapshot(s);
      expect(snap2).not.toBe(snap1); // root changed
      expect(snap2.user).not.toBe(snap1.user); // user changed
      expect(snap2.settings).toBe(snap1.settings); // settings unchanged → same ref
    });

    it('unchanged array elements retain the same reference', async () => {
      const s = createClassyStore({
        items: [
          {id: 1, name: 'a'},
          {id: 2, name: 'b'},
        ],
      });
      const snap1 = snapshot(s);

      // Mutate only the first item.
      (s.items[0] as {id: number; name: string}).name = 'z';
      await flush();

      const snap2 = snapshot(s);
      expect(snap2.items[0]).not.toBe(snap1.items[0]); // changed
      expect(snap2.items[1]).toBe(snap1.items[1]); // unchanged → same ref
    });
  });

  // ── Getter evaluation ─────────────────────────────────────────────────────

  describe('getter evaluation', () => {
    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }

      get label() {
        return `Count: ${this.count}`;
      }

      setCount(value: number) {
        this.count = value;
      }
    }

    it('getters evaluate correctly on the snapshot', () => {
      const s = createClassyStore(new Store());
      const snap = snapshot(s);

      expect(snap.doubled).toBe(10);
      expect(snap.label).toBe('Count: 5');
    });

    it('getters reflect mutations in subsequent snapshots', async () => {
      const s = createClassyStore(new Store());

      s.setCount(10);
      await flush();

      const snap = snapshot(s);
      expect(snap.doubled).toBe(20);
      expect(snap.label).toBe('Count: 10');
    });
  });

  // ── Array snapshots ───────────────────────────────────────────────────────

  describe('array snapshots', () => {
    it('array push is reflected in new snapshot', async () => {
      const s = createClassyStore({items: ['a', 'b']});
      const snap1 = snapshot(s);

      s.items.push('c');
      await flush();

      const snap2 = snapshot(s);
      expect(snap1.items).toEqual(['a', 'b']);
      expect(snap2.items).toEqual(['a', 'b', 'c']);
    });

    it('array splice is reflected in new snapshot', async () => {
      const s = createClassyStore({items: ['a', 'b', 'c']});
      const snap1 = snapshot(s);

      s.items.splice(1, 1);
      await flush();

      const snap2 = snapshot(s);
      expect(snap1.items).toEqual(['a', 'b', 'c']);
      expect(snap2.items).toEqual(['a', 'c']);
    });

    it('replacing array by reference triggers new snapshot', async () => {
      const s = createClassyStore({items: [1, 2, 3]});
      const snap1 = snapshot(s);

      s.items = [4, 5];
      await flush();

      const snap2 = snapshot(s);
      expect(snap1.items).toEqual([1, 2, 3]);
      expect(snap2.items).toEqual([4, 5]);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('snapshot of an empty store', () => {
      const s = createClassyStore({});
      const snap = snapshot(s);
      expect(snap).toEqual({});
      expect(Object.isFrozen(snap)).toBe(true);
    });

    it('snapshot captures null and undefined values', () => {
      const s = createClassyStore({
        a: null as string | null,
        b: undefined as string | undefined,
      });
      const snap = snapshot(s);
      expect(snap.a).toBeNull();
      expect(snap.b).toBeUndefined();
    });
  });

  // ── Subclass inheritance ─────────────────────────────────────────────────

  describe('subclass inheritance', () => {
    class Base {
      count = 0;
      settings = {theme: 'dark'};

      increment() {
        this.count++;
      }

      get doubled() {
        return this.count * 2;
      }
    }

    class Derived extends Base {
      extra = 'hello';

      setExtra(value: string) {
        this.extra = value;
      }

      get label() {
        return `${this.extra}:${this.count}`;
      }
    }

    it('snapshot preserves instanceof for the derived class', () => {
      const s = createClassyStore(new Derived());
      const snap = snapshot(s);

      expect(snap instanceof Derived).toBe(true);
      expect(snap instanceof Base).toBe(true);
    });

    it('snapshot includes own properties from all inheritance levels', () => {
      const s = createClassyStore(new Derived());
      const snap = snapshot(s);

      // Base-level properties
      expect(snap.count).toBe(0);
      expect(snap.settings).toEqual({theme: 'dark'});
      // Derived-level properties
      expect(snap.extra).toBe('hello');
    });

    it('structural sharing works across inheritance levels', async () => {
      const s = createClassyStore(new Derived());
      const snap1 = snapshot(s);

      // Mutate only derived-level property, leave base-level nested object untouched
      s.setExtra('world');
      await flush();

      const snap2 = snapshot(s);
      expect(snap2).not.toBe(snap1); // root changed
      expect(snap2.extra).toBe('world');
      expect(snap2.settings).toBe(snap1.settings); // base-level nested object unchanged
    });

    it('getters from multiple inheritance levels evaluate correctly in snapshot', () => {
      const s = createClassyStore(new Derived());
      s.count = 5;
      s.extra = 'tag';

      const snap = snapshot(s);

      expect(snap.doubled).toBe(10); // base getter
      expect(snap.label).toBe('tag:5'); // derived getter
    });
  });

  // ── Cross-snapshot getter memoization ──────────────────────────────────

  describe('cross-snapshot getter memoization', () => {
    it('getter result is stable across snapshots when deps unchanged', async () => {
      class Store {
        items = [1, 2, 3];
        label = 'hello';
        get total() {
          return this.items.reduce((a: number, b: number) => a + b, 0);
        }
      }

      const s = createClassyStore(new Store());
      const snap1 = snapshot(s);
      const total1 = snap1.total;

      // Mutate a property the getter does NOT depend on
      s.label = 'world';
      await flush();

      const snap2 = snapshot(s);
      const total2 = snap2.total;

      // items didn't change → structural sharing → same total reference
      expect(total1).toBe(total2);
      // But snap1.items should be the same ref as snap2.items
      expect(snap1.items).toBe(snap2.items);
    });

    it('getter result changes when deps change', async () => {
      class Store {
        count = 5;
        get doubled() {
          return this.count * 2;
        }
      }

      const s = createClassyStore(new Store());
      const snap1 = snapshot(s);

      s.count = 10;
      await flush();

      const snap2 = snapshot(s);
      expect(snap1.doubled).toBe(10);
      expect(snap2.doubled).toBe(20);
    });

    it('same getter accessed multiple times on same snapshot returns same value', () => {
      class Store {
        count = 5;
        get computed() {
          return {value: this.count}; // new object each call
        }
      }

      const s = createClassyStore(new Store());
      const snap = snapshot(s);

      const result1 = snap.computed;
      const result2 = snap.computed;

      // Per-snapshot cache should return the same reference
      expect(result1).toBe(result2);
    });
  });

  // ── Leaf types (non-proxyable) ────────────────────────────────────────

  describe('leaf types', () => {
    it('Date values pass through unchanged', () => {
      const date = new Date('2026-01-01');
      const s = createClassyStore({created: date});
      const snap = snapshot(s);

      expect(snap.created).toBe(date); // same reference
      expect(snap.created instanceof Date).toBe(true);
    });

    it('RegExp values pass through unchanged', () => {
      const regex = /test/gi;
      const s = createClassyStore({pattern: regex});
      const snap = snapshot(s);

      expect(snap.pattern).toBe(regex);
    });

    it('null and undefined pass through', () => {
      const s = createClassyStore({
        a: null as string | null,
        b: undefined as number | undefined,
      });
      const snap = snapshot(s);

      expect(snap.a).toBeNull();
      expect(snap.b).toBeUndefined();
    });

    it('functions are excluded from snapshot keys (methods)', () => {
      class Store {
        count = 0;
        increment() {
          this.count++;
        }
      }

      const s = createClassyStore(new Store());
      const snap = snapshot(s);

      // The snapshot should not have the method as an own enumerable property
      // (it lives on the prototype). It shouldn't be in Object.keys.
      const keys = Object.keys(snap);
      expect(keys).not.toContain('increment');
    });
  });

  // ── Untracked nested objects ──────────────────────────────────────────

  describe('untracked nested objects', () => {
    it('deep-clones untracked nested objects', () => {
      const s = createClassyStore({data: {nested: {value: 1}}});

      // Access data but not data.nested through the proxy
      const snap = snapshot(s);

      expect(snap.data.nested.value).toBe(1);
      expect(Object.isFrozen(snap.data)).toBe(true);
      expect(Object.isFrozen(snap.data.nested)).toBe(true);
    });

    it('snapshot of deeply nested arrays freezes all levels', () => {
      const s = createClassyStore({
        matrix: [
          [1, 2],
          [3, 4],
        ],
      });
      const snap = snapshot(s);

      expect(Object.isFrozen(snap.matrix)).toBe(true);
      expect(Object.isFrozen(snap.matrix[0])).toBe(true);
      expect(Object.isFrozen(snap.matrix[1])).toBe(true);
      expect(snap.matrix[0]).toEqual([1, 2]);
    });
  });

  // ── Snapshot after delete ─────────────────────────────────────────────

  describe('snapshot after delete', () => {
    it('deleted property is absent from snapshot', async () => {
      const s = createClassyStore({a: 1, b: 2} as Record<string, number>);
      const snap1 = snapshot(s);

      delete s.b;
      await flush();

      const snap2 = snapshot(s);
      expect(snap1.b).toBe(2);
      expect('b' in snap2).toBe(false);
    });
  });

  // ── Snapshot with empty/special structures ─────────────────────────────

  describe('special structures', () => {
    it('snapshot of store with empty array', () => {
      const s = createClassyStore({items: [] as number[]});
      const snap = snapshot(s);
      expect(snap.items).toEqual([]);
      expect(Object.isFrozen(snap.items)).toBe(true);
    });

    it('snapshot of store with nested empty objects', () => {
      const s = createClassyStore({config: {a: {}, b: {}}});
      const snap = snapshot(s);
      expect(snap.config.a).toEqual({});
      expect(snap.config.b).toEqual({});
      expect(Object.isFrozen(snap.config.a)).toBe(true);
    });

    it('snapshot is taken synchronously (before flush)', () => {
      const s = createClassyStore({count: 0});
      s.count = 42;
      // No flush — snapshot should already reflect the mutation
      const snap = snapshot(s);
      expect(snap.count).toBe(42);
    });

    it('throws a clear error when the store contains a circular reference', () => {
      const raw: {self: unknown; data: {parent: unknown}} = {
        self: null,
        data: {parent: null},
      };
      raw.self = raw;
      raw.data.parent = raw.data;
      const s = createClassyStore(raw);
      expect(() => snapshot(s)).toThrow(/circular reference/);
    });

    it('throws on a self-referencing array (tracked sub-tree)', () => {
      const raw: {items: unknown[]} = {items: []};
      raw.items.push(raw.items);
      const s = createClassyStore(raw);
      expect(() => snapshot(s)).toThrow(/circular reference/);
    });

    it('throws on a circular reference inside an untracked nested plain object', () => {
      // An untracked path triggers when a plain nested object has never been
      // read through the proxy (no child internal exists), so snapshot() goes
      // through deepFreezeClone for it. We freeze the snapshot at the root
      // BEFORE accessing inner refs, so `outer` is untracked at that point.
      const inner: {self: unknown} = {self: null};
      inner.self = inner;
      const s = createClassyStore({outer: {nested: inner}});
      expect(() => snapshot(s)).toThrow(/circular reference/);
    });
  });
});
