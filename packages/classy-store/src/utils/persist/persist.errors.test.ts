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
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persistence error propagation', () => {
  test.each([
    {
      description: 'save',
      method: 'save' as const,
      adapter: 'setItem',
      operation: 'write',
    },
    {
      description: 'clear',
      method: 'clear' as const,
      adapter: 'removeItem',
      operation: 'remove',
    },
    {
      description: 'rehydrate',
      method: 'rehydrate' as const,
      adapter: 'getItem',
      operation: 'read',
    },
  ])('$description preserves a synchronous adapter failure when onError throws', async ({
    method,
    adapter,
    operation,
  }) => {
    const failure = new Error('adapter failure');
    const onError = mock(() => {
      throw new Error('reporting failure');
    });
    const handle = persist(createClassyStore({count: 0}), {
      name: 'qa-synchronous-error',
      skipHydration: true,
      storage: {
        ...storage,
        [adapter]: () => {
          throw failure;
        },
      },
      onError,
    });
    handles.push(handle);
    await expect(handle[method]()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure, operation);
    expect(handle.getSnapshot().lastError).toEqual({error: failure, operation});
  });

  test('an issued save rejects after disposal without reporting or starting queued work', async () => {
    const pending = deferred<void>();
    const failure = new Error('late adapter failure');
    const onError = mock(() => {});
    const removeItem = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'qa-disposed-error',
      skipHydration: true,
      storage: {...storage, setItem: () => pending.promise, removeItem},
      onError,
    });
    handles.push(handle);
    const saving = handle.save().catch((error: unknown) => error);
    const clearing = handle.clear().catch((error: unknown) => error);
    handle.dispose();
    const disposedStatus = handle.getSnapshot();
    pending.reject(failure);
    expect(await saving).toBe(failure);
    expect(await clearing).toBeInstanceOf(Error);
    expect(handle.getSnapshot()).toBe(disposedStatus);
    expect(removeItem).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('a failed expiration removal rejects hydration and releases a queued save', async () => {
    const removal = deferred<void>();
    const removalStarted = deferred<void>();
    const failure = new Error('expiration removal failed');
    const onError = mock(() => {});
    const setItem = mock((_name: string, _value: string) => {});
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'qa-expiration-queue',
      skipHydration: true,
      clearOnExpire: true,
      debounce: 1000,
      storage: {
        getItem: () => JSON.stringify({version: 0, state: {}, expiresAt: 1}),
        setItem,
        removeItem: () => {
          removalStarted.resolve();
          return removal.promise;
        },
      },
      onError,
    });
    handles.push(handle);
    const hydration = handle.rehydrate().catch((error: unknown) => error);
    await removalStarted.promise;
    await tick();
    store.count = 3;
    await tick();
    const saving = handle.save();
    expect(setItem).not.toHaveBeenCalled();
    removal.reject(failure);
    expect(await hydration).toBe(failure);
    await saving;
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure, 'remove');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setItem.mock.calls[0][1]).state.count).toBe(3);
    expect(handle.getSnapshot().lastError).toBeNull();
  });

  test('a read failure superseded by clear settles without overwriting newer status', async () => {
    const reading = deferred<string | null>();
    const onError = mock(() => {});
    const store = createClassyStore({count: 3});
    const handle = persist(store, {
      name: 'qa-obsolete-error',
      skipHydration: true,
      storage: {...storage, getItem: () => reading.promise},
      onError,
    });
    handles.push(handle);
    const hydration = handle.rehydrate();
    await handle.clear();
    reading.reject(new Error('obsolete read'));
    await expect(hydration).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
    expect(handle.getSnapshot()).toMatchObject({
      isHydrated: true,
      lastError: null,
    });
    expect(store.count).toBe(3);
  });

  test('automatic serialization failure reports once and a later explicit save recovers', async () => {
    let failing = true;
    const failure = new Error('serialization failed');
    const setItem = mock(() => {});
    const onError = mock(() => {});
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'qa-automatic-serialization',
      skipHydration: true,
      storage: {...storage, setItem},
      properties: [
        {
          key: 'count',
          serialize: (value) => {
            if (failing) throw failure;
            return value;
          },
          deserialize: Number,
        },
      ],
      onError,
    });
    handles.push(handle);
    store.count = 4;
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure, 'write');
    expect(setItem).not.toHaveBeenCalled();
    failing = false;
    await handle.save();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot().lastError).toBeNull();
  });
});
