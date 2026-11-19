import {describe, expect, expectTypeOf, test} from 'bun:test';
import * as entry from './frameworks/react/server';
import {prepareStoreForHydration} from './frameworks/react/server';

// Type tests for `@codebelt/classy-store/react/server`.

describe('react server entry point types', () => {
  test('the entry exports one value, prepareStoreForHydration', () => {
    expectTypeOf<
      keyof typeof entry
    >().toEqualTypeOf<'prepareStoreForHydration'>();
    expect(Object.keys(entry)).toEqual(['prepareStoreForHydration']);
  });

  test('prepareStoreForHydration accepts any object and returns it under its own, still mutable, type', () => {
    expectTypeOf(prepareStoreForHydration).toEqualTypeOf<
      <T extends object>(proxyStore: T) => T
    >();
  });
});
