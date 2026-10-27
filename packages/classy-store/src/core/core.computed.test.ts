import {describe, expect, it} from 'bun:test';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore} from './core';

/** Helper: flush the queueMicrotask-based batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Write proxy memoization tests ───────────────────────────────────────────

describe('computed getters — write proxy memoization', () => {
  // 1. Getter returns cached reference when deps unchanged
  it('returns the same reference when dependencies have not changed', () => {
    let callCount = 0;

    class Store {
      items = ['a', 'b', 'c'];
      filter = 'all';

      get filtered() {
        callCount++;
        if (this.filter === 'all') return this.items;
        return this.items.filter((item) => item === this.filter);
      }
    }

    const s = createClassyStore(new Store());

    const result1 = s.filtered;
    const result2 = s.filtered;
    const result3 = s.filtered;

    // Getter body should only run once — subsequent calls return cached.
    expect(callCount).toBe(1);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  // 2. Getter recomputes when a dependency changes
  it('recomputes when a dependency changes', () => {
    let callCount = 0;

    class Store {
      count = 5;

      get doubled() {
        callCount++;
        return this.count * 2;
      }

      setCount(value: number) {
        this.count = value;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.doubled).toBe(10);
    expect(callCount).toBe(1);

    s.setCount(10);
    expect(s.doubled).toBe(20);
    expect(callCount).toBe(2);
  });

  // 3. Unrelated property change does NOT invalidate getter
  it('does NOT recompute when an unrelated property changes', () => {
    let callCount = 0;

    class Store {
      count = 5;
      name = 'hello';

      get doubled() {
        callCount++;
        return this.count * 2;
      }

      setName(value: string) {
        this.name = value;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.doubled).toBe(10);
    expect(callCount).toBe(1);

    s.setName('world');
    expect(s.doubled).toBe(10);
    expect(callCount).toBe(1); // NOT recomputed — `name` is not a dependency
  });

  // 4. Nested getters: getter A reading getter B
  it('handles nested getters (getter reads another getter)', () => {
    let filteredCallCount = 0;
    let filteredCountCallCount = 0;

    class Store {
      items = ['a', 'b', 'c'];
      filter = 'all';

      get filtered(): string[] {
        filteredCallCount++;
        if (this.filter === 'all') return this.items;
        return (this.items as string[]).filter((item) => item === this.filter);
      }

      get filteredCount() {
        filteredCountCallCount++;
        return this.filtered.length;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.filteredCount).toBe(3);
    expect(filteredCallCount).toBe(1);
    expect(filteredCountCallCount).toBe(1);

    // Access again — both should be cached.
    expect(s.filteredCount).toBe(3);
    expect(filteredCallCount).toBe(1);
    expect(filteredCountCallCount).toBe(1);
  });

  // 5. Getter reading array property (push/splice invalidation)
  it('recomputes when an array dependency is mutated via push', async () => {
    let callCount = 0;

    class Store {
      items: string[] = ['a', 'b'];

      get count() {
        callCount++;
        return this.items.length;
      }

      addItem(item: string) {
        this.items.push(item);
      }
    }

    const s = createClassyStore(new Store());

    expect(s.count).toBe(2);
    expect(callCount).toBe(1);

    s.addItem('c');
    await flush();

    expect(s.count).toBe(3);
    expect(callCount).toBe(2);
  });

  // 6. Getter reading deeply nested object property
  it('recomputes when a deeply nested dependency changes', async () => {
    let callCount = 0;

    class Store {
      settings = {theme: 'dark', locale: 'en'};

      get currentTheme() {
        callCount++;
        return this.settings.theme;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.currentTheme).toBe('dark');
    expect(callCount).toBe(1);

    s.settings.theme = 'light';
    await flush();

    expect(s.currentTheme).toBe('light');
    expect(callCount).toBe(2);
  });

  // 7. Multiple getters with overlapping dependencies
  it('handles multiple getters with overlapping dependencies', () => {
    let sumCalls = 0;
    let avgCalls = 0;

    class Store {
      values = [1, 2, 3];

      get sum() {
        sumCalls++;
        return (this.values as number[]).reduce((a, b) => a + b, 0);
      }

      get average() {
        avgCalls++;
        return this.sum / this.values.length;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.sum).toBe(6);
    expect(s.average).toBe(2);
    expect(sumCalls).toBe(1); // called by sum, then reused by average
    expect(avgCalls).toBe(1);

    // Second access — all cached.
    expect(s.sum).toBe(6);
    expect(s.average).toBe(2);
    expect(sumCalls).toBe(1);
    expect(avgCalls).toBe(1);
  });

  // 8b. Inherited getter override — subclass getter wins
  it('uses the most-derived getter when a subclass overrides a parent getter', () => {
    class Base {
      count = 5;

      get label(): string {
        return `base:${this.count}`;
      }
    }

    class Derived extends Base {
      override get label(): string {
        return `derived:${this.count}`;
      }
    }

    const s = createClassyStore(new Derived());
    expect(s.label).toBe('derived:5');

    // Snapshot should also use the derived getter
    const snap = snapshot(s);
    expect(snap.label).toBe('derived:5');
  });

  // 8c. Getters from multiple inheritance levels
  it('getters from multiple inheritance levels work on write proxy and snapshot', () => {
    class Base {
      count = 5;

      get doubled() {
        return this.count * 2;
      }
    }

    class Derived extends Base {
      multiplier = 3;

      get tripled() {
        return this.count * this.multiplier;
      }
    }

    const s = createClassyStore(new Derived());

    // Write proxy: both getters work
    expect(s.doubled).toBe(10); // base getter
    expect(s.tripled).toBe(15); // derived getter

    // Snapshot: both getters work
    const snap = snapshot(s);
    expect(snap.doubled).toBe(10);
    expect(snap.tripled).toBe(15);
  });

  // 8d. Override + non-overridden getter coexistence
  it('overridden and non-overridden getters coexist correctly', () => {
    class Base {
      count = 5;

      get label(): string {
        return `base:${this.count}`;
      }

      get doubled() {
        return this.count * 2;
      }
    }

    class Derived extends Base {
      override get label(): string {
        return `derived:${this.count}`;
      }
      // `doubled` is NOT overridden — inherits from Base
    }

    const s = createClassyStore(new Derived());

    // Override wins for `label`
    expect(s.label).toBe('derived:5');
    // Non-overridden `doubled` uses Base version
    expect(s.doubled).toBe(10);

    // Same behavior in snapshot
    const snap = snapshot(s);
    expect(snap.label).toBe('derived:5');
    expect(snap.doubled).toBe(10);
  });

  // 8e. Multi-level getter chain (A -> B -> C)
  it('getters from three inheritance levels all work', () => {
    class LevelA {
      value = 2;

      get squared() {
        return this.value ** 2;
      }
    }

    class LevelB extends LevelA {
      get cubed() {
        return this.value ** 3;
      }
    }

    class LevelC extends LevelB {
      get label() {
        return `val=${this.value} sq=${this.squared} cu=${this.cubed}`;
      }
    }

    const s = createClassyStore(new LevelC());

    // Write proxy
    expect(s.squared).toBe(4);
    expect(s.cubed).toBe(8);
    expect(s.label).toBe('val=2 sq=4 cu=8');

    // Snapshot
    const snap = snapshot(s);
    expect(snap.squared).toBe(4);
    expect(snap.cubed).toBe(8);
    expect(snap.label).toBe('val=2 sq=4 cu=8');
  });

  // 9. Getter result updates after method call that mutates deps
  it('recomputes after a method mutates a dependency', () => {
    class Store {
      count = 0;

      get isPositive() {
        return this.count > 0;
      }

      increment() {
        this.count++;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.isPositive).toBe(false);

    s.increment();
    expect(s.isPositive).toBe(true);

    s.increment();
    expect(s.isPositive).toBe(true); // still true, but recomputed
    expect(s.count).toBe(2);
  });

  // 10. Getter recomputes when a sub-tree dependency is replaced by reference
  it('recomputes when a sub-tree property is replaced entirely', () => {
    let callCount = 0;

    class Store {
      items = [1, 2, 3];

      get count() {
        callCount++;
        return this.items.length;
      }

      setItems(newItems: number[]) {
        this.items = newItems;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.count).toBe(3);
    expect(callCount).toBe(1);

    // Replace the entire array (not mutation through child proxy).
    s.setItems([10]);
    expect(s.count).toBe(1);
    expect(callCount).toBe(2);
  });

  // 11. Getter returning undefined is correctly cached and invalidated
  it('correctly caches and invalidates a getter that returns undefined', () => {
    let callCount = 0;

    class Store {
      items: string[] = [];

      get first(): string | undefined {
        callCount++;
        return this.items.length > 0 ? this.items[0] : undefined;
      }

      addItem(item: string) {
        this.items.push(item);
      }
    }

    const s = createClassyStore(new Store());

    // First access: returns undefined, cached.
    expect(s.first).toBeUndefined();
    expect(callCount).toBe(1);

    // Second access: still undefined, cache hit.
    expect(s.first).toBeUndefined();
    expect(callCount).toBe(1);

    // Mutate deps → should recompute.
    s.addItem('hello');
    expect(s.first).toBe('hello');
    expect(callCount).toBe(2);
  });

  // 12. Getter with zero dependencies is cached forever
  it('getter with no deps (constant) is cached forever', () => {
    let callCount = 0;

    class Store {
      count = 0;

      get constant() {
        callCount++;
        return 42;
      }

      increment() {
        this.count++;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.constant).toBe(42);
    expect(callCount).toBe(1);

    // Mutate other properties — constant should never recompute.
    s.increment();
    s.increment();
    expect(s.constant).toBe(42);
    expect(callCount).toBe(1);
  });

  // 13. Getter that throws doesn't corrupt the cache
  it('getter that throws does not leave stale/corrupt cache entries', () => {
    let shouldThrow = true;

    class Store {
      count = 5;

      get computed() {
        if (shouldThrow) throw new Error('intentional error');
        return this.count * 2;
      }
    }

    const s = createClassyStore(new Store());

    // First access throws.
    expect(() => s.computed).toThrow('intentional error');

    // Fix the error condition.
    shouldThrow = false;

    // Should recompute successfully (no corrupt cache entry).
    expect(s.computed).toBe(10);
  });

  // 14. Computed getter recomputes when a dep is deleted
  it('recomputes when a dependency property is deleted', () => {
    class Store {
      data: Record<string, number> = {a: 1, b: 2};

      get sum() {
        let total = 0;
        for (const key of Object.keys(this.data)) {
          total += (this.data as Record<string, number>)[key];
        }
        return total;
      }
    }

    const s = createClassyStore(new Store());
    expect(s.sum).toBe(3);

    // Replace the data object entirely (delete is hard to test on child proxies
    // for computed deps, but replacing the dep triggers recompute).
    s.data = {a: 1};
    expect(s.sum).toBe(1);
  });

  // 15. Computed getter invalidates when an undefined-valued dep is deleted
  it('recomputes when a dep with value undefined is deleted', () => {
    let callCount = 0;

    class Store {
      data: Record<string, unknown> = {a: undefined};

      get hasA() {
        callCount++;
        return 'a' in this.data;
      }
    }

    const s = createClassyStore(new Store());

    expect(s.hasA).toBe(true);
    expect(callCount).toBe(1);

    // Cached — deps unchanged.
    expect(s.hasA).toBe(true);
    expect(callCount).toBe(1);

    // Delete the property whose value was `undefined`.
    // Before the fix, Object.is(undefined, undefined) would pass and the
    // cache would incorrectly return `true`.
    s.data = {};
    expect(s.hasA).toBe(false);
    expect(callCount).toBe(2);
  });
});
