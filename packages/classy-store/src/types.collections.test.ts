import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {ReactiveMap, ReactiveSet} from './collections/index';
import * as entry from './collections/index';
import {reactiveMap, reactiveSet} from './collections/index';
import type {Snapshot} from './index';
import {createClassyStore, snapshot} from './index';

// Type tests for `@codebelt/classy-store/collections`.
//
// A test under a `FINDING:` comment pins a type that looks like a bug or a
// surprise. It records that type; it does not endorse it.

/** The members of a class instance as one object type, keeping `readonly`. */
type Members<T> = {[K in keyof T]: T[K]};

type Todo = {done: boolean};

describe('collections entry point types', () => {
  test('the entry exports the two factories as values, and the two classes as types only', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<
      'reactiveMap' | 'reactiveSet'
    >();
    expect(Object.keys(entry).sort()).toEqual(['reactiveMap', 'reactiveSet']);
  });

  test('reactiveMap takes optional entries and returns a ReactiveMap of their key and value types', () => {
    expectTypeOf(reactiveMap).toEqualTypeOf<
      <K, V>(initial?: Iterable<[K, V]>) => ReactiveMap<K, V>
    >();
  });

  test('reactiveSet takes optional values and returns a ReactiveSet of their type', () => {
    expectTypeOf(reactiveSet).toEqualTypeOf<
      <T>(initial?: Iterable<T>) => ReactiveSet<T>
    >();
  });

  // FINDING: the backing array `_entries` is a public, writable member of the published type. Its `@internal` tag is a comment only: the declarations are built without stripInternal.
  test('ReactiveMap has the Map methods, a readonly size and its backing array', () => {
    expectTypeOf<Members<ReactiveMap<string, Todo>>>().toEqualTypeOf<{
      _entries: [string, Todo][];
      readonly size: number;
      get: (key: string) => Todo | undefined;
      has: (key: string) => boolean;
      set: (key: string, value: Todo) => ReactiveMap<string, Todo>;
      delete: (key: string) => boolean;
      clear: () => void;
      keys: () => IterableIterator<string>;
      values: () => IterableIterator<Todo>;
      entries: () => IterableIterator<[string, Todo]>;
      forEach: (
        callback: (
          value: Todo,
          key: string,
          map: ReactiveMap<string, Todo>,
        ) => void,
      ) => void;
      [Symbol.iterator]: () => IterableIterator<[string, Todo]>;
    }>();
  });

  // FINDING: the backing array `_items` is a public, writable member of the published type, for the same reason as `_entries`.
  test('ReactiveSet has the Set methods, a readonly size and its backing array', () => {
    expectTypeOf<Members<ReactiveSet<Todo>>>().toEqualTypeOf<{
      _items: Todo[];
      readonly size: number;
      has: (value: Todo) => boolean;
      add: (value: Todo) => ReactiveSet<Todo>;
      delete: (value: Todo) => boolean;
      clear: () => void;
      keys: () => IterableIterator<Todo>;
      values: () => IterableIterator<Todo>;
      entries: () => IterableIterator<[Todo, Todo]>;
      forEach: (
        callback: (value: Todo, key: Todo, set: ReactiveSet<Todo>) => void,
      ) => void;
      [Symbol.iterator]: () => IterableIterator<Todo>;
    }>();
  });

  // FINDING: methods are snapshot leaves, so the snapshot of a collection keeps set(), delete(), clear() and add() callable in its type, and get() returns the mutable member type. Each of these compiles and throws a TypeError when it runs.
  test('the Snapshot of a collection makes its fields readonly and leaves every method, mutators included, as it was', () => {
    type TodoMap = ReactiveMap<string, Todo>;
    type TodoSet = ReactiveSet<Todo>;

    expectTypeOf<Snapshot<TodoMap>['_entries']>().toEqualTypeOf<
      readonly (readonly (string | {readonly done: boolean})[])[]
    >();
    expectTypeOf<Snapshot<TodoSet>['_items']>().toEqualTypeOf<
      readonly {readonly done: boolean}[]
    >();
    expectTypeOf<Snapshot<TodoMap>['get']>().toEqualTypeOf<
      (key: string) => Todo | undefined
    >();
    expectTypeOf<Snapshot<TodoMap>['set']>().toEqualTypeOf<
      (key: string, value: Todo) => TodoMap
    >();
    expectTypeOf<Snapshot<TodoMap>['delete']>().toEqualTypeOf<
      (key: string) => boolean
    >();
    expectTypeOf<Snapshot<TodoMap>['clear']>().toEqualTypeOf<() => void>();
    expectTypeOf<Snapshot<TodoSet>['add']>().toEqualTypeOf<
      (value: Todo) => TodoSet
    >();

    const frozen = snapshot(
      createClassyStore({
        todos: reactiveMap<string, Todo>([['first', {done: false}]]),
        tags: reactiveSet<string>(['urgent']),
      }),
    );
    const first = frozen.todos.get('first');
    expectTypeOf(first).toEqualTypeOf<Todo | undefined>();
    expect(() => {
      if (first) first.done = true;
    }).toThrow(TypeError);
    expect(() => frozen.todos.set('second', {done: true})).toThrow(TypeError);
    expect(() => frozen.todos.delete('first')).toThrow(TypeError);
    expect(() => frozen.todos.clear()).toThrow(TypeError);
    expect(() => frozen.tags.add('later')).toThrow(TypeError);
  });
});
