import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {persist} from './persist';
import type {PersistHandle, StorageAdapter} from './persist.types';

const handles: PersistHandle[] = [];
const storage: StorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const raw = JSON.stringify({version: 0, state: {count: 1}});
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persist public API', () => {
  test.each([
    {description: 'read', operation: 'read'},
    {description: 'decoding', operation: 'parse'},
    {description: 'expired-data removal', operation: 'remove'},
  ])('automatic hydration reports $description failures and settles without rejecting', async ({
    operation,
  }) => {
    const failure = new Error(operation);
    const onError = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'automatic-hydration-error',
      clearOnExpire: true,
      storage: {
        ...storage,
        getItem: async () => {
          if (operation === 'read') throw failure;
          return operation === 'parse'
            ? raw
            : JSON.stringify({version: 0, state: {}, expiresAt: 1});
        },
        removeItem: async () => {
          throw failure;
        },
      },
      properties: [
        {
          key: 'count',
          serialize: (value) => value,
          deserialize: () => {
            throw failure;
          },
        },
      ],
      onError,
    });
    handles.push(handle);
    await expect(handle.hydrated).resolves.toBeUndefined();
    expect(handle.getSnapshot()).toMatchObject({
      isHydrated: true,
      lastError: {error: failure, operation},
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test.each([
    {description: 'batched', debounce: 0},
    {description: 'debounced', debounce: 5},
  ])('automatic $description writes report rejection and recover on the next edit', async ({
    debounce,
  }) => {
    const failure = new Error('quota');
    let failing = true;
    const onError = mock(() => {});
    const setItem = mock(async () => {
      if (failing) throw failure;
    });
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'automatic-write-error',
      storage: {...storage, setItem},
      debounce,
      skipHydration: true,
      onError,
    });
    handles.push(handle);
    store.count = 1;
    await new Promise<void>((resolve) => setTimeout(resolve, debounce + 20));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot().lastError).toEqual({
      error: failure,
      operation: 'write',
    });
    failing = false;
    store.count = 2;
    await new Promise<void>((resolve) => setTimeout(resolve, debounce + 20));
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(handle.getSnapshot().lastError).toBeNull();
  });

  test('automatic tab expiration reports asynchronous removal failures', async () => {
    const failure = new Error('remove expired');
    const onError = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'tab-expiration-error',
      storage: {
        ...storage,
        removeItem: async () => {
          throw failure;
        },
      },
      skipHydration: true,
      syncTabs: true,
      clearOnExpire: true,
      onError,
    });
    handles.push(handle);
    globalThis.dispatchEvent(
      new StorageEvent('storage', {
        key: 'tab-expiration-error',
        newValue: JSON.stringify({version: 0, state: {}, expiresAt: 1}),
      }),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot()).toMatchObject({
      isExpired: true,
      lastError: {error: failure, operation: 'remove'},
    });
  });

  test('keeps auto-saving local edits while expired-data removal is pending', async () => {
    let finishRemoval!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishRemoval = resolve;
    });
    const setItem = mock((_name: string, _value: string) => {});
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'expiry-race',
      skipHydration: true,
      clearOnExpire: true,
      storage: {
        getItem: () =>
          JSON.stringify({version: 0, state: {}, expiresAt: Date.now() - 1}),
        removeItem: () => pending,
        setItem,
      },
    });
    handles.push(handle);
    const hydration = handle.rehydrate();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    store.count = 2;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(setItem).not.toHaveBeenCalled();
    finishRemoval();
    await hydration;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setItem.mock.calls[0][1]).state.count).toBe(2);
  });

  test.each([
    {description: 'save', method: 'save' as const},
    {description: 'clear', method: 'clear' as const},
  ])('rejects a queued $description skipped by disposal without invoking its adapter', async ({
    method,
  }) => {
    let finishWrite!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const setItem = mock(() => pending);
    const removeItem = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'queued-disposal',
      storage: {...storage, setItem, removeItem},
      skipHydration: true,
    });
    handles.push(handle);
    const issued = handle.save();
    const queued = handle[method]().catch((error: unknown) => error);
    handle.dispose();
    finishWrite();
    await issued;
    expect(await queued).toBeInstanceOf(Error);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(removeItem).not.toHaveBeenCalled();
  });

  test('automatic queued writes cancelled by disposal settle without reporting errors', async () => {
    let finishWrite!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const setItem = mock(() => pending);
    const onError = mock(() => {});
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'automatic-disposal',
      storage: {...storage, setItem},
      skipHydration: true,
      onError,
    });
    handles.push(handle);
    store.count = 1;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    store.count = 2;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    handle.dispose();
    finishWrite();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(handle.getSnapshot()).toMatchObject({
      isDisposed: true,
      lastError: null,
    });
  });

  test.each([
    {
      description: 'read',
      method: 'rehydrate' as const,
      adapterMethod: 'getItem' as const,
      operation: 'read',
    },
    {
      description: 'write',
      method: 'save' as const,
      adapterMethod: 'setItem' as const,
      operation: 'write',
    },
    {
      description: 'remove',
      method: 'clear' as const,
      adapterMethod: 'removeItem' as const,
      operation: 'remove',
    },
  ])('rejects $description failures and reports each error once', async ({
    method,
    adapterMethod,
    operation,
  }) => {
    const failure = new Error(`${operation} failed`);
    const onError = mock(() => {});
    let failing = true;
    const adapter = {
      ...storage,
      [adapterMethod]: async () => {
        if (failing) throw failure;
        return null;
      },
    };
    const handle = persist(createClassyStore({count: 0}), {
      name: 'api',
      storage: adapter,
      skipHydration: true,
      onError,
    });
    handles.push(handle);
    await expect(handle[method]()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot().lastError).toEqual({error: failure, operation});
    failing = false;
    await handle[method]();
    expect(handle.getSnapshot().lastError).toBeNull();
    if (method === 'rehydrate') {
      await handle.hydrated;
      expect(handle.isHydrated).toBe(true);
    }
  });

  test.each([
    {description: 'JSON', stage: 'json'},
    {description: 'transform', stage: 'transform'},
    {description: 'migration', stage: 'migration'},
    {description: 'merge', stage: 'merge'},
  ])('rejects a $description hydration failure once and settles initial hydration', async ({
    stage,
  }) => {
    const failure = new Error(stage);
    const onError = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'parse',
      storage: {
        ...storage,
        getItem: () => (stage === 'json' ? '{broken' : raw),
      },
      skipHydration: true,
      onError,
      version: 1,
      migrate: (value) => {
        if (stage === 'migration') throw failure;
        return value;
      },
      merge: (value) => {
        if (stage === 'merge') throw failure;
        return value;
      },
      properties: [
        {
          key: 'count',
          serialize: (value) => value,
          deserialize: (value) => {
            if (stage === 'transform') throw failure;
            return Number(value);
          },
        },
      ],
    });
    handles.push(handle);
    await expect(handle.rehydrate()).rejects.toBeInstanceOf(Error);
    await handle.hydrated;
    expect(handle.getSnapshot()).toMatchObject({
      isHydrated: true,
      lastError: {operation: 'parse'},
    });
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(handle.rehydrate()).rejects.toBeInstanceOf(Error);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  test('reports serialization failures and preserves the original error if onError throws', async () => {
    const failure = new Error('serialize');
    const setItem = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'serialize',
      storage: {...storage, setItem},
      skipHydration: true,
      properties: [
        {
          key: 'count',
          serialize: () => {
            throw failure;
          },
          deserialize: Number,
        },
      ],
      onError: () => {
        throw new Error('callback');
      },
    });
    handles.push(handle);
    await expect(handle.save()).rejects.toBe(failure);
    expect(handle.getSnapshot().lastError?.operation).toBe('write');
    expect(setItem).not.toHaveBeenCalled();
  });

  test('a rejected explicit save does not poison queued saves', async () => {
    let rejectFirst!: (error: Error) => void;
    const first = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const failure = new Error('first save');
    const setItem = mock(async () => {
      if (setItem.mock.calls.length === 1) await first;
    });
    const handle = persist(createClassyStore({count: 0}), {
      name: 'queue',
      storage: {...storage, setItem},
      skipHydration: true,
    });
    handles.push(handle);
    const failedSave = handle.save().catch((error: unknown) => error);
    const nextSave = handle.save();
    expect(setItem).toHaveBeenCalledTimes(1);
    rejectFirst(failure);
    expect(await failedSave).toBe(failure);
    await nextSave;
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(handle.getSnapshot().lastError).toBeNull();
  });

  test('publishes hydration and expiry changes even when store data never changes', async () => {
    let saved: string | null = null;
    const handle = persist(createClassyStore({count: 0}), {
      name: 'status',
      storage: {...storage, getItem: () => saved},
      skipHydration: true,
    });
    handles.push(handle);
    const initial = handle.getSnapshot();
    expect(Object.isFrozen(initial)).toBe(true);
    const listener = mock(() => {});
    const stop = handle.subscribe(listener);
    await handle.rehydrate();
    expect(handle.getSnapshot().isHydrated).toBe(true);
    expect(handle.getServerSnapshot()).toBe(initial);
    expect(initial.isHydrated).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    const hydrated = handle.getSnapshot();
    await handle.save();
    expect(handle.getSnapshot()).toBe(hydrated);
    saved = JSON.stringify({
      version: 0,
      state: {count: 9},
      expiresAt: Date.now() - 1,
    });
    await handle.rehydrate();
    expect(handle.getSnapshot().isExpired).toBe(true);
    saved = null;
    await handle.rehydrate();
    expect(handle.getSnapshot().isExpired).toBe(false);
    stop();
    listener.mockClear();
    handle.dispose();
    expect(listener).not.toHaveBeenCalled();
  });

  test('rehydration includes expired-data removal failures', async () => {
    const failure = new Error('remove expired');
    const handle = persist(createClassyStore({count: 0}), {
      name: 'expired',
      storage: {
        ...storage,
        getItem: () =>
          JSON.stringify({version: 0, state: {}, expiresAt: Date.now() - 1}),
        removeItem: () => {
          throw failure;
        },
      },
      skipHydration: true,
      clearOnExpire: true,
    });
    handles.push(handle);
    await expect(handle.rehydrate()).rejects.toBe(failure);
    expect(handle.getSnapshot()).toMatchObject({
      isExpired: true,
      lastError: {operation: 'remove'},
    });
  });

  test('dispose is the only cleanup method and rejects operations after cleanup', async () => {
    let resolveRead!: (raw: string | null) => void;
    const pending = new Promise<string | null>((resolve) => {
      resolveRead = resolve;
    });
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'dispose',
      storage: {...storage, getItem: () => pending},
    });
    handles.push(handle);
    const listener = mock(() => {});
    handle.subscribe(listener);
    expect('unsubscribe' in handle).toBe(false);
    handle.dispose();
    handle.dispose();
    resolveRead(raw);
    await handle.hydrated;
    expect(store.count).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot()).toMatchObject({
      isDisposed: true,
      isHydrated: handle.isHydrated,
    });
    await expect(handle.save()).rejects.toThrow('disposed');
    await expect(handle.clear()).rejects.toThrow('disposed');
    await expect(handle.rehydrate()).rejects.toThrow('disposed');
  });
});
