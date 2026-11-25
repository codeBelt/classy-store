import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {Signal} from '@angular/core';
import * as entry from './frameworks/angular/angular';
import {injectClassyStore} from './frameworks/angular/angular';
import type {Snapshot} from './index';

// Type tests for `@codebelt/classy-store/angular`. The return type for one
// store type is also asserted in types.exports.test.ts. The function is never
// called here: each assertion reads the type of the function itself.

type Counter = {count: number; nested: {label: string}};

describe('angular entry point types', () => {
  test('the entry exports one value, injectClassyStore', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'injectClassyStore'>();
    expect(Object.keys(entry)).toEqual(['injectClassyStore']);
  });

  test('injectClassyStore accepts any object and returns a readonly Signal of its Snapshot', () => {
    expectTypeOf(injectClassyStore).toEqualTypeOf<
      <T extends object>(proxyStore: T) => Signal<Snapshot<T>>
    >();
  });

  test('the signal yields a deeply readonly value and has no set() or update()', () => {
    type CounterSignal = ReturnType<typeof injectClassyStore<Counter>>;

    expectTypeOf<ReturnType<CounterSignal>>().toEqualTypeOf<{
      readonly count: number;
      readonly nested: {readonly label: string};
    }>();
    expectTypeOf<CounterSignal>().not.toHaveProperty('set');
    expectTypeOf<CounterSignal>().not.toHaveProperty('update');
  });
});
