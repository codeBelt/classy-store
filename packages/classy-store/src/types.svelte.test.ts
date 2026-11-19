import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {ClassyReadable} from './frameworks/svelte/svelte';
import * as entry from './frameworks/svelte/svelte';
import {toSvelteStore} from './frameworks/svelte/svelte';
import type {Snapshot} from './index';

// Type tests for `@codebelt/classy-store/svelte`.

type Counter = {count: number; nested: {label: string}};

describe('svelte entry point types', () => {
  test('the entry exports one value, toSvelteStore', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'toSvelteStore'>();
    expect(Object.keys(entry)).toEqual(['toSvelteStore']);
  });

  test('toSvelteStore accepts any object and returns a ClassyReadable of its Snapshot', () => {
    expectTypeOf(toSvelteStore).toEqualTypeOf<
      <T extends object>(proxyStore: T) => ClassyReadable<Snapshot<T>>
    >();
  });

  test('ClassyReadable has subscribe() alone, which takes a run callback and returns an unsubscribe function', () => {
    expectTypeOf<ClassyReadable<Counter>>().toEqualTypeOf<{
      subscribe: (run: (value: Counter) => void) => () => void;
    }>();
  });

  test('the readable of a store hands its subscribers a deeply readonly value', () => {
    expectTypeOf(toSvelteStore<Counter>).toEqualTypeOf<
      (proxyStore: Counter) => ClassyReadable<{
        readonly count: number;
        readonly nested: {readonly label: string};
      }>
    >();
  });
});
