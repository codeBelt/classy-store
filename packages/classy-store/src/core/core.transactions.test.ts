import {describe, expect, mock, test} from 'bun:test';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore, subscribe} from './core';

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
});
