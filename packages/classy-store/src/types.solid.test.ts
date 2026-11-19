import {describe, expect, expectTypeOf, test} from 'bun:test';
import * as entry from './frameworks/solid/solid';
import {useClassyStore} from './frameworks/solid/solid';
import type {Snapshot} from './index';

// Type tests for `@codebelt/classy-store/solid`. The primitive is never called
// here: each assertion reads the type of the primitive itself.

type Counter = {count: number; nested: {label: string}};

describe('solid entry point types', () => {
  test('the entry exports one value, useClassyStore', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'useClassyStore'>();
    expect(Object.keys(entry)).toEqual(['useClassyStore']);
  });

  test('useClassyStore accepts any object and returns an accessor of its Snapshot', () => {
    expectTypeOf(useClassyStore).toEqualTypeOf<
      <T extends object>(proxyStore: T) => () => Snapshot<T>
    >();
  });

  test('the accessor takes no argument and yields a deeply readonly value', () => {
    expectTypeOf(useClassyStore<Counter>).toEqualTypeOf<
      (proxyStore: Counter) => () => {
        readonly count: number;
        readonly nested: {readonly label: string};
      }
    >();
  });
});
