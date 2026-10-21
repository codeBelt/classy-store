import {describe, expect, expectTypeOf, test} from 'bun:test';
import {reactiveMap, reactiveSet} from './collections/collections';
import {createClassyStore} from './core/core';
import {snapshot} from './snapshot/snapshot';
import type {Snapshot} from './types';

function formatAmount(amount: number, prefix = '$'): string {
  return `${prefix}${amount}`;
}

function identity<Value>(value: Value): Value {
  return value;
}

function convert(value: number): string;
function convert(value: string): number;
function convert(value: string | number): string | number {
  return typeof value === 'number' ? String(value) : Number(value);
}

function joinValues(prefix: string, ...values: number[]): string {
  return `${prefix}${values.join(',')}`;
}

describe('Snapshot callable types', () => {
  test('preserves typed parameters, optional parameters, and rest parameters', () => {
    const state = snapshot(createClassyStore({formatAmount, joinValues}));

    expectTypeOf(state.formatAmount).toEqualTypeOf<typeof formatAmount>();
    expectTypeOf(state.joinValues).toEqualTypeOf<typeof joinValues>();
    expectTypeOf<Snapshot<typeof formatAmount>>().toEqualTypeOf<
      typeof formatAmount
    >();
    expectTypeOf(state.formatAmount(3)).toEqualTypeOf<string>();
    expect(state.formatAmount(3)).toBe('$3');
    expect(state.formatAmount(4, 'EUR ')).toBe('EUR 4');
    expect(state.joinValues('values: ', 1, 2, 3)).toBe('values: 1,2,3');
  });

  test('preserves generic inference and every overload', () => {
    const state = snapshot(createClassyStore({identity, convert}));

    expectTypeOf(state.identity).toEqualTypeOf<typeof identity>();
    expectTypeOf(state.convert).toEqualTypeOf<typeof convert>();
    expectTypeOf(state.identity('literal' as const)).toEqualTypeOf<'literal'>();
    expectTypeOf(state.identity({id: 1})).toEqualTypeOf<{id: number}>();
    expectTypeOf(state.convert(12)).toEqualTypeOf<string>();
    expectTypeOf(state.convert('12')).toEqualTypeOf<number>();
    expect(state.identity('literal')).toBe('literal');
    expect(state.convert(12)).toBe('12');
    expect(state.convert('12')).toBe(12);
  });

  test('keeps typed reactive collection queries callable', () => {
    const store = createClassyStore({
      values: reactiveMap<string, {label: string}>([
        ['first', {label: 'initial'}],
      ]),
      tags: reactiveSet<string>(['first']),
    });
    const initial = snapshot(store);

    expectTypeOf(initial.values.get).toEqualTypeOf<typeof store.values.get>();
    expectTypeOf(initial.tags.has).toEqualTypeOf<typeof store.tags.has>();
    expect(initial.values.get('first')).toEqual({label: 'initial'});
    expect(initial.tags.has('first')).toBe(true);

    store.values.set('second', {label: 'updated'});
    store.tags.add('second');
    expect(initial.values.get('second')).toBeUndefined();
    expect(initial.tags.has('second')).toBe(false);
    expect(snapshot(store).values.get('second')).toEqual({label: 'updated'});
    expect(snapshot(store).tags.has('second')).toBe(true);
  });

  test('still rejects assignment to readonly data, nested values, and arrays', () => {
    const state = snapshot(
      createClassyStore({
        title: 'initial',
        nested: {label: 'initial'},
        rows: [{label: 'initial'}],
        formatAmount,
      }),
    );

    expect(() => {
      // @ts-expect-error Snapshot properties remain readonly.
      state.title = 'changed';
    }).toThrow();
    expect(() => {
      // @ts-expect-error Nested snapshot properties remain readonly.
      state.nested.label = 'changed';
    }).toThrow();
    expect(() => {
      // @ts-expect-error Snapshot arrays do not expose mutable push.
      state.rows.push({label: 'changed'});
    }).toThrow();
    expect(() => {
      // @ts-expect-error Snapshot array elements remain deeply readonly.
      state.rows[0].label = 'changed';
    }).toThrow();
    expect(() => {
      // @ts-expect-error Callable properties themselves remain readonly.
      state.formatAmount = () => 'changed';
    }).toThrow();
  });
});
