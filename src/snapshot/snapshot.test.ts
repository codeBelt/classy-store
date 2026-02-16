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
});
