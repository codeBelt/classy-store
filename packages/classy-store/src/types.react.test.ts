import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {UseClassyStoreSelectorOptions} from './frameworks/react/react';
import * as entry from './frameworks/react/react';
import {
  createStoreHook,
  useClassyStore,
  useHistoryStatus,
  useLocalStore,
  usePersistStatus,
} from './frameworks/react/react';
import type {Snapshot} from './index';
import type {
  HistoryHandle,
  HistoryStatus,
  PersistHandle,
  PersistStatus,
} from './utils/index';

// Type tests for `@codebelt/classy-store/react`. A hook is never called here:
// each assertion reads the type of the hook itself.

type Cart = {count: number; lines: {sku: string}[]};

describe('react entry point types', () => {
  test('the entry exports five values and no others', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<
      | 'createStoreHook'
      | 'useClassyStore'
      | 'useHistoryStatus'
      | 'useLocalStore'
      | 'usePersistStatus'
    >();
    expect(Object.keys(entry).sort()).toEqual([
      'createStoreHook',
      'useClassyStore',
      'useHistoryStatus',
      'useLocalStore',
      'usePersistStatus',
    ]);
  });

  test('useClassyStore has two overloads, the selector one first', () => {
    expectTypeOf(useClassyStore).toEqualTypeOf<{
      <T extends object, S>(
        proxyStore: T,
        selector: (snap: Snapshot<T>) => S,
        options?: UseClassyStoreSelectorOptions<S>,
      ): S;
      <T extends object>(proxyStore: T): Snapshot<T>;
    }>();
  });

  test('useClassyStore with a selector passes it the readonly snapshot and returns what it selects', () => {
    expectTypeOf(useClassyStore<Cart, number>).toEqualTypeOf<
      (
        proxyStore: Cart,
        selector: (snap: {
          readonly count: number;
          readonly lines: readonly {readonly sku: string}[];
        }) => number,
        options?: {isEqual?: (a: number, b: number) => boolean},
      ) => number
    >();
  });

  test('useClassyStore without a selector takes the store alone and returns its readonly snapshot', () => {
    expectTypeOf(useClassyStore<Cart>).toEqualTypeOf<
      (proxyStore: Cart) => {
        readonly count: number;
        readonly lines: readonly {readonly sku: string}[];
      }
    >();
  });

  test('UseClassyStoreSelectorOptions has one optional field, isEqual, comparing two selected values', () => {
    expectTypeOf<UseClassyStoreSelectorOptions<Cart>>().toEqualTypeOf<{
      isEqual?: (a: Cart, b: Cart) => boolean;
    }>();
  });

  test('createStoreHook returns a hook with two overloads, the selectorless one first', () => {
    expectTypeOf(createStoreHook).toEqualTypeOf<
      <T extends object>(
        proxyStore: T,
      ) => {
        (): Snapshot<T>;
        <S>(
          selector: (snap: Snapshot<T>) => S,
          options?: UseClassyStoreSelectorOptions<S>,
        ): S;
      }
    >();
  });

  test('useLocalStore takes a factory and returns the store under the type the factory returns', () => {
    expectTypeOf(useLocalStore).toEqualTypeOf<
      <T extends object>(factory: () => T) => T
    >();
  });

  test('useHistoryStatus takes a HistoryHandle and returns its HistoryStatus', () => {
    expectTypeOf(useHistoryStatus).toEqualTypeOf<
      (history: HistoryHandle) => HistoryStatus
    >();
  });

  test('usePersistStatus takes a PersistHandle and returns its PersistStatus', () => {
    expectTypeOf(usePersistStatus).toEqualTypeOf<
      (handle: PersistHandle) => PersistStatus
    >();
  });
});
