import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {Ref} from 'vue';
import * as entry from './frameworks/vue/vue';
import {useClassyStore} from './frameworks/vue/vue';
import type {Snapshot} from './index';

// Type tests for `@codebelt/classy-store/vue`. The composable is never called
// here: each assertion reads the type of the composable itself.

type Counter = {count: number; nested: {label: string}};

describe('vue entry point types', () => {
  test('the entry exports one value, useClassyStore', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'useClassyStore'>();
    expect(Object.keys(entry)).toEqual(['useClassyStore']);
  });

  test('useClassyStore accepts any object and returns a Ref of its Snapshot', () => {
    expectTypeOf(useClassyStore).toEqualTypeOf<
      <T extends object>(proxyStore: T) => Ref<Snapshot<T>>
    >();
  });

  // FINDING: the result is typed as a plain Ref, so assigning to `.value` compiles. The Angular adapter returns a readonly Signal for the same job.
  test('the ref holds a deeply readonly value and is itself typed as writable', () => {
    type CounterSnapshot = {
      readonly count: number;
      readonly nested: {readonly label: string};
    };

    expectTypeOf(useClassyStore<Counter>).toEqualTypeOf<
      (proxyStore: Counter) => Ref<CounterSnapshot, CounterSnapshot>
    >();
  });
});
