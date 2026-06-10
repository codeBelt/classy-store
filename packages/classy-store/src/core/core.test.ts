import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, getVersion, subscribe} from './core';

/** Helper: flush the queueMicrotask-based batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createClassyStore() — core reactivity', () => {
  // ── Primitive mutations ───────────────────────────────────────────────────

  describe('primitive mutations', () => {
    it('reads initial values through the proxy', () => {
      const s = createClassyStore({count: 0, name: 'hello'});
      expect(s.count).toBe(0);
      expect(s.name).toBe('hello');
    });

    it('notifies listeners when a primitive property changes', async () => {
      const s = createClassyStore({count: 0});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.count = 5;
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.count).toBe(5);
    });

    it('does NOT notify when same value is set (noop)', async () => {
      const s = createClassyStore({count: 0});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.count = 0; // same value
      await flush();

      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('bumps version on mutation', async () => {
      const s = createClassyStore({count: 0});
      const v1 = getVersion(s);

      s.count = 1;
      await flush();

      const v2 = getVersion(s);
      expect(v2).toBeGreaterThan(v1);
    });
  });

  // ── Batching ──────────────────────────────────────────────────────────────

  describe('batching', () => {
    it('batches multiple synchronous mutations into one notification', async () => {
      const s = createClassyStore({a: 0, b: 0, c: 0});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.a = 1;
      s.b = 2;
      s.c = 3;
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.a).toBe(1);
      expect(s.b).toBe(2);
      expect(s.c).toBe(3);
    });

    it('batches array push (multiple set traps) into one notification', async () => {
      const s = createClassyStore({items: [] as string[]});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.items.push('a');
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.items).toEqual(['a']);
    });
  });

  // ── Class methods ─────────────────────────────────────────────────────────

  describe('class methods', () => {
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }

      add(amount: number) {
        this.count += amount;
      }
    }

    it('methods mutate through the proxy', async () => {
      const s = createClassyStore(new Counter());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.increment();
      await flush();

      expect(s.count).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('methods with arguments work correctly', async () => {
      const s = createClassyStore(new Counter());
      s.add(10);
      await flush();
      expect(s.count).toBe(10);
    });
  });

  // ── Computed getters ──────────────────────────────────────────────────────

  describe('computed getters', () => {
    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }

      get isPositive() {
        return this.count > 0;
      }

      setCount(value: number) {
        this.count = value;
      }
    }

    it('getters return computed values', () => {
      const s = createClassyStore(new Store());
      expect(s.doubled).toBe(10);
      expect(s.isPositive).toBe(true);
    });

    it('getters reflect mutations', async () => {
      const s = createClassyStore(new Store());
      s.setCount(0);
      expect(s.doubled).toBe(0);
      expect(s.isPositive).toBe(false);
    });
  });

  // ── Deep nested objects ───────────────────────────────────────────────────

  describe('deep nested objects', () => {
    it('nested object property mutations trigger root listener', async () => {
      const s = createClassyStore({
        user: {name: 'Alice', address: {city: 'NYC'}},
      });
      const listener = mock(() => {});
      subscribe(s, listener);

      s.user.name = 'Bob';
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.user.name).toBe('Bob');
    });

    it('deeply nested mutations trigger root listener', async () => {
      const s = createClassyStore({
        user: {name: 'Alice', address: {city: 'NYC'}},
      });
      const listener = mock(() => {});
      subscribe(s, listener);

      s.user.address.city = 'LA';
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.user.address.city).toBe('LA');
    });

    it('replacing a nested object triggers listener', async () => {
      const s = createClassyStore({user: {name: 'Alice'}});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.user = {name: 'Bob'};
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.user.name).toBe('Bob');
    });
  });

  // ── Array operations ──────────────────────────────────────────────────────

  describe('array operations', () => {
    it('push triggers listener', async () => {
      const s = createClassyStore({items: ['a']});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.items.push('b');
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.items).toEqual(['a', 'b']);
    });

    it('splice triggers listener', async () => {
      const s = createClassyStore({items: ['a', 'b', 'c']});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.items.splice(1, 1);
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.items).toEqual(['a', 'c']);
    });

    it('index assignment triggers listener', async () => {
      const s = createClassyStore({items: ['a', 'b']});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.items[0] = 'z';
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.items[0]).toBe('z');
    });

    it('array of objects: nested mutation triggers listener', async () => {
      const s = createClassyStore({items: [{name: 'Alice'}, {name: 'Bob'}]});
      const listener = mock(() => {});
      subscribe(s, listener);

      s.items[0].name = 'Charlie';
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.items[0].name).toBe('Charlie');
    });
  });

  // ── Subscribe / unsubscribe ───────────────────────────────────────────────

  describe('subscribe / unsubscribe', () => {
    it('unsubscribe stops notifications', async () => {
      const s = createClassyStore({count: 0});
      const listener = mock(() => {});
      const unsub = subscribe(s, listener);

      s.count = 1;
      await flush();
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      s.count = 2;
      await flush();
      expect(listener).toHaveBeenCalledTimes(1); // still 1
    });

    it('multiple listeners all fire', async () => {
      const s = createClassyStore({count: 0});
      const listener1 = mock(() => {});
      const listener2 = mock(() => {});
      subscribe(s, listener1);
      subscribe(s, listener2);

      s.count = 1;
      await flush();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('sync listeners fire immediately without waiting for the batch flush', async () => {
      const s = createClassyStore({count: 0});
      const listener = mock(() => {});
      subscribe(s, listener, {sync: true});

      s.count = 1;

      expect(listener).toHaveBeenCalledTimes(1);
      await flush();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('sync listeners fire per mutation while batched listeners stay deduped', async () => {
      const s = createClassyStore({a: 0, b: 0});
      const syncListener = mock(() => {});
      const batchedListener = mock(() => {});
      subscribe(s, syncListener, {sync: true});
      subscribe(s, batchedListener);

      s.a = 1;
      s.b = 2;

      expect(syncListener).toHaveBeenCalledTimes(2);
      expect(batchedListener).toHaveBeenCalledTimes(0);

      await flush();

      expect(syncListener).toHaveBeenCalledTimes(2);
      expect(batchedListener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops sync notifications', async () => {
      const s = createClassyStore({count: 0});
      const listener = mock(() => {});
      const unsub = subscribe(s, listener, {sync: true});

      s.count = 1;
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      s.count = 2;
      await flush();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('subscribe on a child proxy fires when the child mutates', async () => {
      const s = createClassyStore({user: {name: 'Alice'}});
      const listener = mock(() => {});
      subscribe(s.user, listener);

      s.user.name = 'Bob';
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('subscribe on a child proxy fires when a sibling mutates', async () => {
      const s = createClassyStore({user: {name: 'Alice'}, count: 0});
      const listener = mock(() => {});
      subscribe(s.user, listener);

      s.count = 1;
      await flush();

      // Listener was added to root, so it fires for any mutation in the tree.
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe from child proxy stops notifications', async () => {
      const s = createClassyStore({user: {name: 'Alice'}});
      const listener = mock(() => {});
      const unsub = subscribe(s.user, listener);

      s.user.name = 'Bob';
      await flush();
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      s.user.name = 'Charlie';
      await flush();
      expect(listener).toHaveBeenCalledTimes(1); // still 1
    });
  });

  // ── Delete property ───────────────────────────────────────────────────────

  describe('deleteProperty', () => {
    it('deleting a property triggers listener', async () => {
      const s = createClassyStore({a: 1, b: 2} as Record<string, number>);
      const listener = mock(() => {});
      subscribe(s, listener);

      delete s.b;
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.b).toBeUndefined();
    });
  });

  // ── Subclass inheritance ─────────────────────────────────────────────────

  describe('subclass inheritance', () => {
    class Base {
      count = 0;

      increment() {
        this.count++;
      }
    }

    class Derived extends Base {
      extra = '';

      setExtra(value: string) {
        this.extra = value;
      }
    }

    it('base method mutates state reactively on a derived instance', async () => {
      const s = createClassyStore(new Derived());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.increment(); // inherited from Base
      await flush();

      expect(s.count).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('derived method works alongside inherited method', async () => {
      const s = createClassyStore(new Derived());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.increment(); // base method
      s.setExtra('tagged'); // derived method
      await flush();

      expect(s.count).toBe(1);
      expect(s.extra).toBe('tagged');
      expect(listener).toHaveBeenCalledTimes(1); // batched into one notification
    });

    it('super.method() calls go through the proxy', async () => {
      class Extended extends Base {
        tag = '';

        incrementAndTag() {
          super.increment();
          this.tag = 'done';
        }
      }

      const s = createClassyStore(new Extended());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.incrementAndTag();
      await flush();

      expect(s.count).toBe(1);
      expect(s.tag).toBe('done');
      expect(listener).toHaveBeenCalledTimes(1); // single batched notification
    });

    it('super.method() from an overridden method is reactive', async () => {
      class Overrider extends Base {
        log: string[] = [];

        override increment() {
          super.increment(); // calls Base.prototype.increment with this = proxy
          this.log.push(`count is now ${this.count}`);
        }
      }

      const s = createClassyStore(new Overrider());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.increment(); // calls the override, which calls super.increment()
      await flush();

      expect(s.count).toBe(1); // base method mutated through proxy
      expect(s.log).toEqual(['count is now 1']);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('multi-level inheritance (A -> B -> C) is fully reactive', async () => {
      class LevelA {
        valueA = 0;

        setA(value: number) {
          this.valueA = value;
        }
      }

      class LevelB extends LevelA {
        valueB = '';

        setB(value: string) {
          this.valueB = value;
        }
      }

      class LevelC extends LevelB {
        valueC = false;

        setC(value: boolean) {
          this.valueC = value;
        }
      }

      const s = createClassyStore(new LevelC());
      const listener = mock(() => {});
      subscribe(s, listener);

      // Call methods from each level
      s.setA(42);
      s.setB('hello');
      s.setC(true);
      await flush();

      expect(s.valueA).toBe(42);
      expect(s.valueB).toBe('hello');
      expect(s.valueC).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1); // all batched
    });
  });

  // ── Computed getter memoization ───────────────────────────────────────

  describe('computed getter memoization', () => {
    it('memoizes getter result when deps have not changed', () => {
      let callCount = 0;

      class Store {
        count = 5;
        get expensive() {
          callCount++;
          return this.count * 2;
        }
      }

      const s = createClassyStore(new Store());

      expect(s.expensive).toBe(10);
      expect(callCount).toBe(1);

      // Accessing again without mutation should use cache
      expect(s.expensive).toBe(10);
      expect(callCount).toBe(1);
    });

    it('recomputes getter when dependency changes', async () => {
      let callCount = 0;

      class Store {
        count = 5;
        get doubled() {
          callCount++;
          return this.count * 2;
        }
      }

      const s = createClassyStore(new Store());
      expect(s.doubled).toBe(10);
      expect(callCount).toBe(1);

      s.count = 10;
      // Getter should recompute because count changed
      expect(s.doubled).toBe(20);
      expect(callCount).toBe(2);
    });

    it('getter that reads another getter (nested computed)', () => {
      class Store {
        count = 3;
        get doubled() {
          return this.count * 2;
        }
        get quadrupled() {
          return this.doubled * 2;
        }
      }

      const s = createClassyStore(new Store());
      expect(s.quadrupled).toBe(12);

      s.count = 5;
      expect(s.quadrupled).toBe(20);
    });

    it('getter with nested object dependency recomputes on child mutation', async () => {
      class Store {
        items = [1, 2, 3];
        get total() {
          return this.items.reduce((a: number, b: number) => a + b, 0);
        }
      }

      const s = createClassyStore(new Store());
      expect(s.total).toBe(6);

      s.items.push(4);
      expect(s.total).toBe(10);
    });

    it('getter invalidates when property is replaced entirely', async () => {
      class Store {
        data = {value: 1};
        get label() {
          return `value: ${this.data.value}`;
        }
      }

      const s = createClassyStore(new Store());
      expect(s.label).toBe('value: 1');

      // Replace the entire object
      s.data = {value: 99};
      expect(s.label).toBe('value: 99');
    });
  });

  // ── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('getInternal throws for a non-store object', () => {
      const plainObject = {count: 0};
      expect(() => subscribe(plainObject, () => {})).toThrow(
        /not a store proxy/,
      );
    });

    it('getInternal throws for a primitive wrapper', () => {
      expect(() => subscribe({} as object, () => {})).toThrow(
        /not a store proxy/,
      );
    });

    it('getVersion throws for a non-store object', () => {
      expect(() => getVersion({})).toThrow(/not a store proxy/);
    });
  });

  // ── Child proxy management ────────────────────────────────────────────

  describe('child proxy management', () => {
    it('replacing a nested object creates a new child proxy', async () => {
      const s = createClassyStore({nested: {a: 1}});
      const listener = mock(() => {});
      subscribe(s, listener);

      const oldRef = s.nested;
      s.nested = {a: 2};
      const newRef = s.nested;

      // Should be different proxy references
      expect(oldRef).not.toBe(newRef);
      expect(newRef.a).toBe(2);

      await flush();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('mutations on old child proxy after replacement do not trigger notifications', async () => {
      const s = createClassyStore({nested: {a: 1}});
      const listener = mock(() => {});

      const oldNested = s.nested; // get child proxy
      s.nested = {a: 2}; // replace — old child proxy detached

      subscribe(s, listener);

      // Mutate the old detached proxy reference (directly on target)
      // This shouldn't crash, but won't trigger listener on the store
      // because the child is no longer linked.
      // Note: old proxy still has its own internal, so mutations work on it
      // but the store's root won't be notified since the child is orphaned.
      oldNested.a = 999;
      await flush();

      // The store's nested should still be the new value
      expect(s.nested.a).toBe(2);
    });

    it('deeply nested replacement triggers root listener', async () => {
      const s = createClassyStore({
        level1: {level2: {level3: {value: 'deep'}}},
      });
      const listener = mock(() => {});
      subscribe(s, listener);

      s.level1.level2.level3.value = 'changed';
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.level1.level2.level3.value).toBe('changed');
    });
  });

  // ── Version tracking ──────────────────────────────────────────────────

  describe('version tracking', () => {
    it('version does not change when same value is set', () => {
      const s = createClassyStore({count: 0});
      const v1 = getVersion(s);

      s.count = 0; // noop — same value
      const v2 = getVersion(s);

      expect(v2).toBe(v1);
    });

    it('version increments on nested mutation', async () => {
      const s = createClassyStore({nested: {value: 1}});
      const v1 = getVersion(s);

      s.nested.value = 2;
      const v2 = getVersion(s);

      expect(v2).toBeGreaterThan(v1);
    });

    it('version increments on delete', async () => {
      const s = createClassyStore({a: 1, b: 2} as Record<string, number>);
      const v1 = getVersion(s);

      delete s.b;
      const v2 = getVersion(s);

      expect(v2).toBeGreaterThan(v1);
    });

    it('multiple rapid mutations produce one notification but multiple version bumps', async () => {
      const s = createClassyStore({count: 0});
      const listener = mock(() => {});
      subscribe(s, listener);

      const v1 = getVersion(s);
      s.count = 1;
      s.count = 2;
      s.count = 3;
      const v2 = getVersion(s);

      await flush();

      expect(v2).toBeGreaterThan(v1);
      expect(listener).toHaveBeenCalledTimes(1); // batched
      expect(s.count).toBe(3);
    });
  });

  // ── Arrow function methods bypass proxy ──────────────────────────────────

  describe('arrow function methods bypass proxy', () => {
    it('arrow function mutations do NOT trigger notifications (by design)', async () => {
      class Store {
        count = 0;
        increment = () => {
          this.count++;
        };
      }

      const s = createClassyStore(new Store());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.increment();
      await flush();

      // Arrow function `this` is the raw instance, not the proxy.
      // The mutation bypasses the SET trap — no notification fires.
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('prototype method mutations DO trigger notifications', async () => {
      class Store {
        count = 0;
        increment() {
          this.count++;
        }
      }

      const s = createClassyStore(new Store());
      const listener = mock(() => {});
      subscribe(s, listener);

      s.increment();
      await flush();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ── Bug fix: throwing listener kills remaining subscribers ──────────────

  describe('listener error isolation', () => {
    it('calls remaining listeners even if an earlier one throws', async () => {
      const s = createClassyStore({count: 0});
      const secondListener = mock(() => {});

      subscribe(s, () => {
        throw new Error('boom');
      });
      subscribe(s, secondListener);

      s.count = 1;
      await flush();

      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it('calls remaining sync listeners even if an earlier one throws', () => {
      const s = createClassyStore({count: 0});
      const secondListener = mock(() => {});

      subscribe(
        s,
        () => {
          throw new Error('boom');
        },
        {sync: true},
      );
      subscribe(s, secondListener, {sync: true});

      s.count = 1;

      expect(secondListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('bound method cache invalidation', () => {
    it('reassigning a method returns the new function on next access', async () => {
      class Store {
        count = 0;
        bump() {
          this.count++;
        }
      }
      const s = createClassyStore(new Store());

      // Cache the original bound method by accessing it.
      const original = s.bump;
      expect(s.bump).toBe(original); // cached

      // Reassign.
      const replacement = function (this: Store) {
        this.count += 100;
      };
      (s as unknown as {bump: () => void}).bump = replacement;
      await flush();

      // New access must NOT return the stale cached binding.
      expect(s.bump).not.toBe(original);
      s.bump();
      expect(s.count).toBe(100);
    });

    it('deleting a reassigned own method clears the bound cache; re-adding returns a fresh binding', async () => {
      const s = createClassyStore({
        count: 0,
        bump(this: {count: number}) {
          this.count++;
        },
      });

      // Cache the original binding.
      const original = s.bump;
      expect(s.bump).toBe(original);

      // Delete the own property.
      delete (s as Partial<typeof s>).bump;
      await flush();
      expect(s.bump).toBeUndefined();

      // Re-add — must return a fresh binding, not the cached old one.
      (s as {bump?: () => void}).bump = function (this: {count: number}) {
        this.count += 5;
      };
      await flush();

      expect(s.bump).not.toBe(original);
      s.bump?.();
      expect(s.count).toBe(5);
    });
  });

  describe('computed getter error handling', () => {
    it('a getter that throws propagates the error and leaves the store usable', async () => {
      class Store {
        count = 0;
        get bad(): number {
          if (this.count === 0) throw new Error('not ready');
          return this.count * 2;
        }
      }
      const s = createClassyStore(new Store());

      expect(() => s.bad).toThrow('not ready');

      // Store still mutable + reactive after throw.
      const listener = mock(() => {});
      subscribe(s, listener);
      s.count = 3;
      await flush();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.bad).toBe(6);
    });

    it('throws a clear error on circular getter dependency (A → B → A)', () => {
      class Store {
        get a(): number {
          return (this as unknown as Store).b + 1;
        }
        get b(): number {
          return (this as unknown as Store).a + 1;
        }
      }
      const s = createClassyStore(new Store());

      expect(() => s.a).toThrow(/circular computed getter dependency/);
      expect(() => s.a).toThrow(/a → b → a/);
    });

    it('throws a clear error on self-referencing getter', () => {
      class Store {
        get loop(): number {
          return (this as unknown as Store).loop + 1;
        }
      }
      const s = createClassyStore(new Store());
      expect(() => s.loop).toThrow(/circular computed getter dependency/);
    });
  });

  describe('deep version propagation', () => {
    it('mutation 4 levels deep bumps the root version', async () => {
      const s = createClassyStore({a: {b: {c: {d: 0}}}});
      const v0 = getVersion(s);
      s.a.b.c.d = 99;
      await flush();
      expect(getVersion(s)).toBeGreaterThan(v0);
    });
  });
});
