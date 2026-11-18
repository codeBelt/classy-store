import {describe, expect, mock, test} from 'bun:test';
import {snapshot} from '../snapshot/snapshot';
import {batch, createClassyStore, subscribe} from './core';

type Row = {id: number};

const rows = (count: number): Row[] =>
  Array.from({length: count}, (_, index) => ({id: (index * 7919) % count}));

describe('transactions', () => {
  test('a store method notifies synchronous subscribers once, after it returns', () => {
    class Cart {
      items: number[] = [];
      total = 0;

      add(price: number) {
        this.items.push(price);
        this.total += price;
      }
    }
    const store = createClassyStore(new Cart());
    const seen: number[] = [];
    subscribe(store, () => seen.push(snapshot(store).total), {sync: true});

    store.add(5);

    // One notification, and it never observes the half-applied state.
    expect(seen).toEqual([5]);
    expect(snapshot(store).items).toEqual([5]);
  });

  test('direct writes outside a method still notify one by one', () => {
    const store = createClassyStore({a: 0, b: 0});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.a = 1;
    store.b = 1;

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['unshift', (items: Row[]) => items.unshift({id: -1})],
    ['splice', (items: Row[]) => items.splice(0, 1)],
    ['sort', (items: Row[]) => items.sort((a, b) => a.id - b.id)],
    ['reverse', (items: Row[]) => items.reverse()],
    ['fill', (items: Row[]) => items.fill({id: 0})],
    ['copyWithin', (items: Row[]) => items.copyWithin(0, 1)],
    [
      'forEach that edits every row',
      (items: Row[]) =>
        items.forEach((row) => {
          row.id += 1;
        }),
    ],
  ] as const)(
    '%s on a large array is one synchronous notification',
    (_name, run) => {
      const store = createClassyStore({items: rows(500)});
      const listener = mock(() => {
        snapshot(store);
      });
      subscribe(store, listener, {sync: true});

      run(store.items);

      expect(listener).toHaveBeenCalledTimes(1);
    },
  );

  test('a plain loop of row writes outside any method notifies per write', () => {
    const store = createClassyStore({items: rows(5)});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    for (const row of store.items) row.id += 1;

    expect(listener).toHaveBeenCalledTimes(5);
  });

  test('nested calls notify once, when the outermost call returns', () => {
    class Board {
      cells = [0, 0, 0];
      moves = 0;

      mark(index: number) {
        this.cells[index] = 1;
        this.moves++;
      }

      markAll() {
        this.cells.forEach((_, index) => {
          this.mark(index);
        });
      }
    }
    const store = createClassyStore(new Board());
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.markAll();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.moves).toBe(3);
  });

  test('a method that throws still reports the writes it made', () => {
    class Form {
      step = 0;

      advance() {
        this.step++;
        throw new Error('validation failed');
      }
    }
    const store = createClassyStore(new Form());
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    expect(() => store.advance()).toThrow('validation failed');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.step).toBe(1);

    // The failed call left no transaction open.
    store.step = 5;
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('an async method is a transaction only up to its first await', async () => {
    class Loader {
      loading = false;
      data: string | null = null;
      attempts = 0;

      async load() {
        this.loading = true;
        this.attempts++;
        await Promise.resolve();
        this.data = 'ready';
        this.loading = false;
      }
    }
    const store = createClassyStore(new Loader());
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    const pending = store.load();
    expect(listener).toHaveBeenCalledTimes(1);
    await pending;
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test('a subscriber may call a store method while being notified', () => {
    class Counter {
      count = 0;
      echo = 0;

      increment() {
        this.count++;
      }

      mirror() {
        this.echo = this.count;
      }
    }
    const store = createClassyStore(new Counter());
    subscribe(
      store,
      () => {
        if (store.echo !== store.count) store.mirror();
      },
      {sync: true},
    );

    store.increment();

    expect(store.echo).toBe(1);
  });

  test('batched subscribers still receive one notification per microtask', async () => {
    class Counter {
      count = 0;

      bump() {
        this.count++;
        this.count++;
      }
    }
    const store = createClassyStore(new Counter());
    const listener = mock(() => {});
    subscribe(store, listener);

    store.bump();
    store.bump();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('a class stored as data stays constructible', () => {
    class Model {
      constructor(readonly name: string) {}
    }
    const store = createClassyStore({Model});
    const instance = new store.Model('row');
    expect(instance).toBeInstanceOf(Model);
    expect(instance.name).toBe('row');
  });

  test('a later transaction does not notify a store written by an earlier one', () => {
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }
    }
    const first = createClassyStore(new Counter());
    const second = createClassyStore(new Counter());
    const onFirst = mock(() => {});
    const onSecond = mock(() => {});
    subscribe(first, onFirst, {sync: true});
    subscribe(second, onSecond, {sync: true});

    first.increment();
    second.increment();
    batch(() => {
      second.count = 5;
    });

    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).toHaveBeenCalledTimes(2);
  });
});

describe('batch()', () => {
  test('a loop of direct writes is one synchronous notification', () => {
    const store = createClassyStore({items: rows(3)});
    const lengths: number[] = [];
    subscribe(store, () => lengths.push(snapshot(store).items.length), {
      sync: true,
    });

    batch(() => {
      for (let index = 0; index < 500; index++) {
        store.items.push({id: index});
      }
    });

    // One notification, and it sees every write.
    expect(lengths).toEqual([503]);
  });

  test('groups writes to several fields and never exposes a partial state', () => {
    const store = createClassyStore({first: '', last: ''});
    const seen: string[] = [];
    subscribe(
      store,
      () => {
        const snap = snapshot(store);
        seen.push(`${snap.first} ${snap.last}`);
      },
      {sync: true},
    );

    batch(() => {
      store.first = 'Ada';
      store.last = 'Lovelace';
    });

    expect(seen).toEqual(['Ada Lovelace']);
  });

  test('reads inside the batch are current', () => {
    const store = createClassyStore({
      count: 0,
      get doubled() {
        return this.count * 2;
      },
    });

    batch(() => {
      store.count = 2;
      expect(store.doubled).toBe(4);
      expect(snapshot(store).count).toBe(2);
    });
  });

  test('passes the return value through', () => {
    const store = createClassyStore({count: 1});
    const result = batch(() => {
      store.count++;
      return store.count * 10;
    });
    expect(result).toBe(20);
  });

  test('nested batches and store methods notify once, at the outermost batch', () => {
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }
    }
    const store = createClassyStore(new Counter());
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    batch(() => {
      store.increment();
      batch(() => {
        store.increment();
        store.count += 10;
      });
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.count).toBe(12);
  });

  test('notifies each store that was written, once', () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const untouched = createClassyStore({value: 0});
    const onFirst = mock(() => {});
    const onSecond = mock(() => {});
    const onUntouched = mock(() => {});
    subscribe(first, onFirst, {sync: true});
    subscribe(second, onSecond, {sync: true});
    subscribe(untouched, onUntouched, {sync: true});

    batch(() => {
      first.value = 1;
      second.value = 1;
      first.value = 2;
    });

    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).toHaveBeenCalledTimes(1);
    expect(onUntouched).not.toHaveBeenCalled();
  });

  test('a batch that throws still reports the writes it made, then rethrows', () => {
    const store = createClassyStore({step: 0});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    expect(() =>
      batch(() => {
        store.step = 1;
        throw new Error('stop');
      }),
    ).toThrow('stop');

    expect(listener).toHaveBeenCalledTimes(1);
    // The failed batch left no transaction open.
    store.step = 2;
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('a batch with no effective write notifies no one', () => {
    const store = createClassyStore({count: 1});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    batch(() => {
      store.count = 1;
    });

    expect(listener).not.toHaveBeenCalled();
  });

  test('covers only the synchronous part of an async callback', async () => {
    const store = createClassyStore({loading: false, data: ''});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    const pending = batch(async () => {
      store.loading = true;
      await Promise.resolve();
      store.data = 'ready';
      store.loading = false;
    });

    expect(listener).toHaveBeenCalledTimes(1);
    await pending;
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test('batched subscribers still receive one notification per microtask', async () => {
    const store = createClassyStore({count: 0});
    const listener = mock(() => {});
    subscribe(store, listener);

    batch(() => {
      store.count++;
    });
    batch(() => {
      store.count++;
    });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
