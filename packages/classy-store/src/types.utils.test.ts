import {describe, expect, expectTypeOf, test} from 'bun:test';
import type {SubscribeOptions as MainSubscribeOptions, Snapshot} from './index';
import type {
  DevtoolsHandle,
  DevtoolsOptions,
  HistoryHandle,
  HistoryOptions,
  HistoryStatus,
  PersistHandle,
  PersistOperation,
  PersistOptions,
  PersistStatus,
  PropertyTransform,
  StorageAdapter,
  SubscribeOptions,
} from './utils/index';
import * as entry from './utils/index';
import {devtools, persist, subscribeKey, withHistory} from './utils/index';

// Type tests for `@codebelt/classy-store/utils`.

/**
 * The handles are intersections with an internal status type. This lists
 * their members as one object type, keeping `readonly` and `?`, so that the
 * whole handle can be compared with a written-out type.
 */
type Members<T> = {[K in keyof T]: T[K]};

type Draft = {title: string; tags: string[]};

describe('utils entry point types', () => {
  test('the entry exports four values and no others', () => {
    expectTypeOf<keyof typeof entry>().toEqualTypeOf<
      'devtools' | 'persist' | 'subscribeKey' | 'withHistory'
    >();
    expect(Object.keys(entry).sort()).toEqual([
      'devtools',
      'persist',
      'subscribeKey',
      'withHistory',
    ]);
  });

  test('devtools takes a store and optional options and returns a DevtoolsHandle', () => {
    expectTypeOf(devtools).toEqualTypeOf<
      <T extends object>(
        proxyStore: T,
        options?: DevtoolsOptions,
      ) => DevtoolsHandle
    >();
  });

  test('DevtoolsOptions has an optional name and an optional enabled flag', () => {
    expectTypeOf<DevtoolsOptions>().toEqualTypeOf<{
      name?: string;
      enabled?: boolean;
    }>();
  });

  test('DevtoolsHandle has dispose() and nothing else', () => {
    expectTypeOf<DevtoolsHandle>().toEqualTypeOf<{dispose: () => void}>();
  });

  test('withHistory takes a store and optional options and returns a HistoryHandle', () => {
    expectTypeOf(withHistory).toEqualTypeOf<
      <T extends object>(
        proxyStore: T,
        options?: HistoryOptions,
      ) => HistoryHandle
    >();
  });

  test('HistoryOptions has one optional number field, limit', () => {
    expectTypeOf<HistoryOptions>().toEqualTypeOf<{limit?: number}>();
  });

  test('HistoryStatus is four readonly booleans', () => {
    expectTypeOf<HistoryStatus>().toEqualTypeOf<{
      readonly canUndo: boolean;
      readonly canRedo: boolean;
      readonly isPaused: boolean;
      readonly isDisposed: boolean;
    }>();
  });

  test('HistoryHandle has the history controls, two readonly flags and a HistoryStatus source', () => {
    expectTypeOf<Members<HistoryHandle>>().toEqualTypeOf<{
      getSnapshot: () => HistoryStatus;
      getServerSnapshot: () => HistoryStatus;
      subscribe: (listener: () => void) => () => void;
      undo: () => void;
      redo: () => void;
      readonly canUndo: boolean;
      readonly canRedo: boolean;
      pause: () => void;
      resume: () => void;
      dispose: () => void;
    }>();
  });

  test('persist takes a store and required options typed by that store, and returns a PersistHandle', () => {
    expectTypeOf(persist).toEqualTypeOf<
      <T extends object>(
        proxyStore: T,
        options: PersistOptions<T>,
      ) => PersistHandle
    >();
  });

  test('PersistOptions requires name and storage, and every other option is optional', () => {
    expectTypeOf<PersistOptions<Draft>>().toEqualTypeOf<{
      name: string;
      storage: StorageAdapter;
      properties?: Array<keyof Draft | PropertyTransform<Draft>>;
      debounce?: number;
      version?: number;
      migrate?: (
        persistedState: Record<string, unknown>,
        oldVersion: number,
      ) => Record<string, unknown>;
      merge?:
        | 'shallow'
        | ((
            persisted: Record<string, unknown>,
            current: Record<string, unknown>,
          ) => Record<string, unknown>);
      skipHydration?: boolean;
      syncTabs?: boolean;
      expireIn?: number;
      clearOnExpire?: boolean;
      onError?: (error: unknown, operation: PersistOperation) => void;
    }>();
  });

  test('PropertyTransform serializes the readonly snapshot value of its key and deserializes to the mutable one', () => {
    type TitleTransform = {
      key: 'title';
      serialize: (value: string) => unknown;
      deserialize: (stored: unknown) => string;
    };
    type TagsTransform = {
      key: 'tags';
      serialize: (value: readonly string[]) => unknown;
      deserialize: (stored: unknown) => string[];
    };

    expectTypeOf<PropertyTransform<Draft>>().toEqualTypeOf<
      TitleTransform | TagsTransform
    >();
    expectTypeOf<
      PropertyTransform<Draft, 'tags'>
    >().toEqualTypeOf<TagsTransform>();
  });

  test('StorageAdapter methods may answer synchronously or with a promise', () => {
    expectTypeOf<StorageAdapter>().toEqualTypeOf<{
      getItem: (name: string) => string | null | Promise<string | null>;
      setItem: (name: string, value: string) => void | Promise<void>;
      removeItem: (name: string) => void | Promise<void>;
    }>();
  });

  test('PersistOperation is one of write, read, remove and parse', () => {
    expectTypeOf<PersistOperation>().toEqualTypeOf<
      'write' | 'read' | 'remove' | 'parse'
    >();
  });

  test('PersistStatus is three readonly flags and the readonly last error', () => {
    expectTypeOf<PersistStatus>().toEqualTypeOf<{
      readonly isHydrated: boolean;
      readonly isExpired: boolean;
      readonly isDisposed: boolean;
      readonly lastError: {
        readonly error: unknown;
        readonly operation: PersistOperation;
      } | null;
    }>();
  });

  test('PersistHandle has the persistence controls, two readonly flags and a PersistStatus source', () => {
    expectTypeOf<Members<PersistHandle>>().toEqualTypeOf<{
      getSnapshot: () => PersistStatus;
      getServerSnapshot: () => PersistStatus;
      subscribe: (listener: () => void) => () => void;
      dispose: () => void;
      hydrated: Promise<void>;
      readonly isHydrated: boolean;
      save: () => Promise<void>;
      clear: () => Promise<void>;
      rehydrate: () => Promise<void>;
      readonly isExpired: boolean;
    }>();
  });

  test('subscribeKey takes a key of the store and reports its snapshot value, and accepts SubscribeOptions', () => {
    expectTypeOf(subscribeKey).toEqualTypeOf<
      <T extends object, K extends keyof T & keyof Snapshot<T>>(
        proxyStore: T,
        key: K,
        callback: (
          value: Snapshot<T>[K],
          previousValue: Snapshot<T>[K],
        ) => void,
        options?: SubscribeOptions,
      ) => () => void
    >();
  });

  test('SubscribeOptions is the same type as the one the main entry exports', () => {
    expectTypeOf<SubscribeOptions>().toEqualTypeOf<MainSubscribeOptions>();
  });
});
