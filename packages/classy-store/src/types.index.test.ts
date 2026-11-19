import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {Snapshot, SubscribeOptions} from './index';
import * as entry from './index';
import {createClassyStore, snapshot, subscribe} from './index';

// Type tests for the main entry, `@codebelt/classy-store`. `batch`,
// `shallowEqual` and `PROXYABLE` are asserted in types.exports.test.ts, and
// callable snapshot members in types.snapshot.test.ts.
//
// A test under a `FINDING:` comment pins a type that looks like a bug or a
// surprise. It records that type; it does not endorse it.

describe('main entry point types', () => {
  test('the entry exports six values and no others', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<
      | 'batch'
      | 'createClassyStore'
      | 'PROXYABLE'
      | 'shallowEqual'
      | 'snapshot'
      | 'subscribe'
    >();
    expect(Object.keys(entry).sort()).toEqual([
      'PROXYABLE',
      'batch',
      'createClassyStore',
      'shallowEqual',
      'snapshot',
      'subscribe',
    ]);
  });

  test('createClassyStore accepts any object and returns it under its own type', () => {
    expectTypeOf(createClassyStore).toEqualTypeOf<
      <T extends object>(instance: T) => T
    >();
  });

  test('snapshot accepts any object and returns the Snapshot of its type', () => {
    expectTypeOf(snapshot).toEqualTypeOf<
      <T extends object>(proxyStore: T) => Snapshot<T>
    >();
  });

  test('subscribe takes an object, a callback and optional options, and returns an unsubscribe function', () => {
    expectTypeOf(subscribe).toEqualTypeOf<
      (
        proxy: object,
        callback: () => void,
        options?: SubscribeOptions,
      ) => () => void
    >();
  });

  test('SubscribeOptions has one optional boolean field, sync', () => {
    expectTypeOf<SubscribeOptions>().toEqualTypeOf<{sync?: boolean}>();
  });

  test('Snapshot makes objects and arrays deeply readonly and leaves leaf types as they are', () => {
    type State = {
      count: number;
      label: string | null;
      nested: {flag: boolean};
      rows: {id: number}[];
      optional?: {id: number};
      when: Date;
      pattern: RegExp;
      failure: Error;
      lookup: Map<string, {id: number}>;
      seen: Set<{id: number}>;
      weakLookup: WeakMap<object, {id: number}>;
      weakSeen: WeakSet<object>;
      pending: Promise<{id: number}>;
      tag: symbol;
      big: bigint;
      rename: (label: string) => void;
    };

    expectTypeOf<Snapshot<State>>().toEqualTypeOf<{
      readonly count: number;
      readonly label: string | null;
      readonly nested: {readonly flag: boolean};
      readonly rows: readonly {readonly id: number}[];
      readonly optional?: {readonly id: number};
      readonly when: Date;
      readonly pattern: RegExp;
      readonly failure: Error;
      readonly lookup: Map<string, {id: number}>;
      readonly seen: Set<{id: number}>;
      readonly weakLookup: WeakMap<object, {id: number}>;
      readonly weakSeen: WeakSet<object>;
      readonly pending: Promise<{id: number}>;
      readonly tag: symbol;
      readonly big: bigint;
      readonly rename: (label: string) => void;
    }>();
  });

  // FINDING: a tuple matches the array branch of Snapshot, so its positions and length are lost: Snapshot<[string, number]> is readonly (string | number)[], not readonly [string, number].
  test('Snapshot turns a tuple into a readonly array of the union of its members', () => {
    expectTypeOf<Snapshot<{pair: [string, number]}>>().toEqualTypeOf<{
      readonly pair: readonly (string | number)[];
    }>();
  });
});
