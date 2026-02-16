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
});
