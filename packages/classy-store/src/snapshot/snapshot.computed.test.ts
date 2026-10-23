import {describe, expect, it} from 'bun:test';
import {createClassyStore} from '../core/core';
import {snapshot} from './snapshot';

/** Helper: flush the queueMicrotask-based batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Snapshot memoization tests ──────────────────────────────────────────────

describe('computed getters — snapshot memoization', () => {
  // 9. Snapshot getter computes only once
  it('snapshot getter computes only once (verified by call counter)', () => {
    let callCount = 0;

    class Store {
      items = ['a', 'b', 'c'];

      get count() {
        callCount++;
        return this.items.length;
      }
    }

    const s = createClassyStore(new Store());
    const snap = snapshot(s);

    expect(snap.count).toBe(3);
    expect(snap.count).toBe(3);
    expect(snap.count).toBe(3);

    expect(callCount).toBe(1); // computed only once on the snapshot
  });

  // 10. Snapshot getter returns same reference on repeated access
  it('snapshot getter returns the same reference on repeated access', () => {
    class Store {
      items = ['a', 'b', 'c'];

      get filtered() {
        return this.items.filter((item) => item !== 'b');
      }
    }

    const s = createClassyStore(new Store());
    const snap = snapshot(s);

    const result1 = snap.filtered;
    const result2 = snap.filtered;

    expect(result1).toBe(result2); // same reference — memoized
    expect(result1).toEqual(['a', 'c']);
  });

  // 10b. Cross-snapshot reference stability when deps unchanged
  it('returns same reference across snapshots when getter deps have not changed', async () => {
    class TodoStore {
      todos = [{text: 'Buy milk', done: false}];
      theme = 'dark';

      get activeTodos() {
        return this.todos.filter((todo) => !todo.done);
      }

      setTheme(value: string) {
        this.theme = value;
      }
    }

    const s = createClassyStore(new TodoStore());

    const snap1 = snapshot(s);
    const result1 = snap1.activeTodos;

    s.setTheme('light');
    await flush();

    const snap2 = snapshot(s);
    expect(snap2).not.toBe(snap1); // different snapshot

    const result2 = snap2.activeTodos;
    expect(result1).toBe(result2); // SAME reference — cross-snapshot memo
  });

  // 11. Different snapshots compute independently
  it('different snapshots compute independently', async () => {
    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }

      setCount(value: number) {
        this.count = value;
      }
    }

    const s = createClassyStore(new Store());

    const snap1 = snapshot(s);
    expect(snap1.doubled).toBe(10);

    s.setCount(10);
    await flush();

    const snap2 = snapshot(s);
    expect(snap2.doubled).toBe(20);

    // snap1 still returns the old value
    expect(snap1.doubled).toBe(10);
  });

  // 11c. Snapshot getter recomputes when a sub-tree dep is replaced
  it('snapshot getter returns new value when dep sub-tree is replaced', async () => {
    class Store {
      items = [1, 2, 3];

      get count() {
        return this.items.length;
      }

      setItems(newItems: number[]) {
        this.items = newItems;
      }
    }

    const s = createClassyStore(new Store());

    const snap1 = snapshot(s);
    expect(snap1.count).toBe(3);

    s.setItems([10]);
    await flush();

    const snap2 = snapshot(s);
    expect(snap2.count).toBe(1); // must reflect the new items, not stale cache
  });

  // 12. Snapshot getter reads frozen snapshot data correctly
  it('snapshot getter reads frozen data correctly', () => {
    class Store {
      firstName = 'John';
      lastName = 'Doe';

      get fullName() {
        return `${this.firstName} ${this.lastName}`;
      }
    }

    const s = createClassyStore(new Store());
    const snap = snapshot(s);

    expect(snap.fullName).toBe('John Doe');
    expect(Object.isFrozen(snap)).toBe(true);
  });
});
