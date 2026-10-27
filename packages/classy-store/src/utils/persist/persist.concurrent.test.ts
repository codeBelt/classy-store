import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {persist} from './persist';
import type {PersistHandle} from './persist.types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const envelope = (count: number) =>
  JSON.stringify({version: 0, state: {count}});
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persist async operation ordering', () => {
  test.each([
    {description: 'successful', fails: false},
    {description: 'failed', fails: true},
  ])('keeps a newer save behind a $description pending write', async ({
    fails,
  }) => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    let saved: string | null = null;
    const storage = {
      getItem: () => saved,
      setItem: mock(async (_name: string, value: string) => {
        await (JSON.parse(value).state.count === 1 ? firstWrite : secondWrite)
          .promise;
        saved = value;
      }),
      removeItem: () => {},
    };
    const onError = mock(() => {});
    const store = createClassyStore({count: 1});
    const handle = persist(store, {
      name: 'draft',
      storage,
      skipHydration: true,
      debounce: 1000,
      onError,
    });
    handles.push(handle);
    const first = handle.save();
    store.count = 2;
    await tick();
    const second = handle.save();
    store.count = 3; // The queued save must retain its requested value, 2.

    try {
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      if (fails) {
        firstWrite.reject(new Error('Write failed'));
        await expect(first).rejects.toThrow('Write failed');
      } else {
        firstWrite.resolve();
        await first;
      }
      await tick();
      expect(storage.setItem).toHaveBeenCalledTimes(2);
      secondWrite.resolve();
      await second;
      expect<string | null>(saved).toBe(envelope(2));
      expect(onError).toHaveBeenCalledTimes(fails ? 1 : 0);
    } finally {
      firstWrite.resolve();
      secondWrite.resolve();
      await Promise.allSettled([first, second]);
    }
  });

  test('drops queued saves after dispose while an issued write can finish', async () => {
    const pending = deferred<void>();
    const storage = {
      getItem: () => null,
      setItem: mock(() => pending.promise),
      removeItem: () => {},
    };
    const store = createClassyStore({count: 1});
    const handle = persist(store, {
      name: 'draft',
      storage,
      skipHydration: true,
    });
    handles.push(handle);
    const first = handle.save();
    const second = handle.save();
    handle.dispose();
    pending.resolve();
    await Promise.all([first, expect(second).rejects.toThrow('disposed')]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  test('clears storage after an already-issued save finishes', async () => {
    const pending = deferred<void>();
    let saved: string | null = null;
    const storage = {
      getItem: () => saved,
      setItem: async (_name: string, value: string) => {
        await pending.promise;
        saved = value;
      },
      removeItem: mock(() => {
        saved = null;
      }),
    };
    const store = createClassyStore({count: 1});
    const handle = persist(store, {
      name: 'draft',
      storage,
      skipHydration: true,
    });
    handles.push(handle);
    const saving = handle.save();
    const clearing = handle.clear();
    try {
      expect(storage.removeItem).not.toHaveBeenCalled();
    } finally {
      pending.resolve();
      await Promise.all([saving, clearing]);
    }
    expect(saved).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });

  test('ignores an older hydration result that finishes after a newer request', async () => {
    const older = deferred<string | null>();
    const newer = deferred<string | null>();
    const storage = {
      getItem: mock()
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise),
      setItem: mock(() => {}),
      removeItem: () => {},
    };
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage,
      skipHydration: true,
    });
    handles.push(handle);
    const first = handle.rehydrate();
    const second = handle.rehydrate();
    newer.resolve(envelope(2));
    await second;
    older.resolve(envelope(1));
    await first;
    expect(store.count).toBe(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('keeps edits made while initial hydration is reading storage', async () => {
    const pendingRead = deferred<string | null>();
    let saved: string | null = null;
    const storage = {
      getItem: () => pendingRead.promise,
      setItem: (_name: string, value: string) => {
        saved = value;
      },
      removeItem: () => {},
    };
    const store = createClassyStore({count: 0});
    const handle = persist(store, {name: 'draft', storage, debounce: 1000});
    handles.push(handle);
    store.count = 2;
    await tick();
    pendingRead.resolve(envelope(1));
    await handle.hydrated;
    expect(store.count).toBe(2);
    await handle.save();
    expect<string | null>(saved).toBe(envelope(2));
  });

  test.each([
    {description: 'batched', debounce: 0},
    {description: 'debounced', debounce: 20},
  ])('clear cancels a pending $description save and later edits still persist', async ({
    debounce,
  }) => {
    let saved: string | null = envelope(1);
    const storage = {
      getItem: () => saved,
      setItem: mock((_name: string, value: string) => {
        saved = value;
      }),
      removeItem: () => {
        saved = null;
      },
    };
    const store = createClassyStore({count: 1});
    const handle = persist(store, {
      name: 'draft',
      storage,
      debounce,
      skipHydration: true,
    });
    handles.push(handle);
    store.count = 2;
    if (debounce) await tick(); // Arm the timer; the zero-delay case still has a batched notification.
    await handle.clear();
    await new Promise((resolve) => setTimeout(resolve, debounce + 10));
    expect(saved).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    store.count = 3;
    await new Promise((resolve) => setTimeout(resolve, debounce + 10));
    expect(saved).toBe(envelope(3));
  });

  test('rehydrates from the result of a previously requested save', async () => {
    const pendingWrite = deferred<void>();
    let saved = envelope(0);
    const storage = {
      getItem: mock(() => saved),
      setItem: async (_name: string, value: string) => {
        await pendingWrite.promise;
        saved = value;
      },
      removeItem: () => {},
    };
    const store = createClassyStore({count: 1});
    const handle = persist(store, {
      name: 'draft',
      storage,
      skipHydration: true,
    });
    handles.push(handle);
    const saving = handle.save();
    const reading = handle.rehydrate();
    try {
      expect(storage.getItem).not.toHaveBeenCalled();
    } finally {
      pendingWrite.resolve();
      await Promise.all([saving, reading]);
    }
    expect(store.count).toBe(1);
  });
});
