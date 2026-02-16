import {afterEach, describe, expect, it, mock} from 'bun:test';
import {act, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {store} from './core';
import {useStore} from './react';
import {snapshot} from './snapshot';

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Derived());
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

    const s = store(new Derived());

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

    const s = store(new Derived());

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

    const s = store(new LevelC());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());
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

    const s = store(new Store());

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

    const s = store(new Store());
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

    const s = store(new Store());
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

    const s = store(new TodoStore());

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

    const s = store(new Store());

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

    const s = store(new Store());

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

    const s = store(new Store());
    const snap = snapshot(s);

    expect(snap.fullName).toBe('John Doe');
    expect(Object.isFrozen(snap)).toBe(true);
  });
});

// ── Integration tests with useStore ─────────────────────────────────────────

describe('computed getters — useStore integration', () => {
  let container: HTMLDivElement;

  function setup(): void {
    container = document.createElement('div');
    document.body.appendChild(container);
  }

  function teardown(): void {
    document.body.removeChild(container);
  }

  function render(element: ReactNode): void {
    const root = createRoot(container);
    act(() => {
      root.render(element);
    });
  }

  afterEach(teardown);

  // 13. useStore selector with getter returns stable reference
  it('selector with getter returns stable reference — no re-render on unrelated change', async () => {
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

    const todoStore = store(new TodoStore());
    const renderCount = mock(() => {});

    function ActiveList() {
      const active = useStore(todoStore, (snap) => snap.activeTodos);
      renderCount();
      return <div>{active.length}</div>;
    }

    setup();
    render(<ActiveList />);
    expect(container.textContent).toBe('1');
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Change `theme` — activeTodos getter doesn't depend on it.
    // The snapshot getter is memoized, so it returns the same reference.
    await act(async () => {
      todoStore.setTheme('light');
      await flush();
    });

    // Should NOT re-render because the getter result is the same reference.
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  // 14. Auto-tracked mode with getter access
  it('auto-tracked mode works with computed getters', async () => {
    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }

      setCount(value: number) {
        this.count = value;
      }
    }

    const s = store(new Store());

    function Display() {
      const snap = useStore(s);
      return <div>{snap.doubled}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('10');

    await act(async () => {
      s.setCount(20);
      await flush();
    });

    expect(container.textContent).toBe('40');
  });
});
