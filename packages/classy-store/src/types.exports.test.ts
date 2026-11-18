import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {Signal} from '@angular/core';
import {reactiveMap} from './collections/index';
import {injectClassyStore} from './frameworks/angular/angular';
import {
  batch,
  createClassyStore,
  PROXYABLE,
  type Snapshot,
  shallowEqual,
  snapshot,
  subscribe,
} from './index';
import {
  type DevtoolsHandle,
  devtools,
  type HistoryHandle,
  type PersistHandle,
  persist,
  subscribeKey,
  withHistory,
} from './utils/index';

describe('public entry point types', () => {
  test('the core entry exports its functions with stable signatures', () => {
    const store = createClassyStore({count: 0, user: {name: 'Ada'}});

    expectTypeOf(store).toEqualTypeOf<{count: number; user: {name: string}}>();
    expectTypeOf(snapshot(store)).toEqualTypeOf<
      Snapshot<{count: number; user: {name: string}}>
    >();
    expectTypeOf(subscribe(store, () => {})).toEqualTypeOf<() => void>();
    expectTypeOf(subscribe(store.user, () => {}, {sync: true})).toEqualTypeOf<
      () => void
    >();
    expectTypeOf(shallowEqual).toEqualTypeOf<<T>(a: T, b: T) => boolean>();
    expectTypeOf(batch).toEqualTypeOf<<T>(run: () => T) => T>();
    expectTypeOf(batch(() => store.count)).toEqualTypeOf<number>();
    expectTypeOf(batch(async () => 'done')).toEqualTypeOf<Promise<string>>();
  });

  test('PROXYABLE is a symbol that a class can use as a static key', () => {
    class Todo {
      static [PROXYABLE] = true;
      done = false;
    }
    // A unique symbol, so it can be a computed class member.
    expectTypeOf(PROXYABLE).toMatchTypeOf<symbol>();
    expect(typeof PROXYABLE).toBe('symbol');

    const store = createClassyStore({todos: [new Todo()]});
    expectTypeOf(snapshot(store).todos[0].done).toEqualTypeOf<boolean>();
    expect(() => {
      // @ts-expect-error A snapshot of an opted-in class is readonly.
      snapshot(store).todos[0].done = true;
    }).toThrow(TypeError);
  });

  test('every utility returns a handle with dispose()', () => {
    const store = createClassyStore({count: 0});
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const handles = [
      devtools(store, {enabled: false}),
      withHistory(store),
      persist(store, {name: 'types', storage, skipHydration: true}),
    ];

    expectTypeOf(
      devtools(store, {enabled: false}),
    ).toEqualTypeOf<DevtoolsHandle>();
    expectTypeOf<DevtoolsHandle['dispose']>().toEqualTypeOf<() => void>();
    expectTypeOf<HistoryHandle['dispose']>().toEqualTypeOf<() => void>();
    expectTypeOf<PersistHandle['dispose']>().toEqualTypeOf<() => void>();
    // @ts-expect-error devtools() no longer returns a bare dispose function.
    expectTypeOf(devtools(store, {enabled: false})).toBeCallableWith();
    for (const handle of handles) handle.dispose();
  });

  test('subscribeKey reports the readonly value of the watched key', () => {
    const store = createClassyStore({
      tags: ['a'],
      users: reactiveMap<string, number>(),
    });
    const stop = subscribeKey(store, 'tags', (value, previous) => {
      expectTypeOf(value).toEqualTypeOf<readonly string[]>();
      expectTypeOf(previous).toEqualTypeOf<readonly string[]>();
    });
    expectTypeOf(stop).toEqualTypeOf<() => void>();
    stop();
  });

  test('injectClassyStore returns a readonly signal of the snapshot', () => {
    expectTypeOf(injectClassyStore<{count: number}>).returns.toEqualTypeOf<
      Signal<Snapshot<{count: number}>>
    >();
  });
});
