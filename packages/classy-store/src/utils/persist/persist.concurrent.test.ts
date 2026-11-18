import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore, subscribe} from '../../core/core';
import {subscribeKey} from '../subscribe-key/subscribe-key';
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
    {trigger: 'manual', editAfterClear: false, debounce: 0},
    {trigger: 'initial', editAfterClear: true, debounce: 0},
    {trigger: 'storage', editAfterClear: false, debounce: 10},
    {trigger: 'storage', editAfterClear: true, debounce: 10},
  ])(
    'clear during $trigger restore wins until a later local write (editAfterClear=$editAfterClear)',
    async ({trigger, editAfterClear, debounce}) => {
      let saved: string | null = JSON.stringify({
        version: 0,
        state: {count: 1, tail: 2},
      });
      const events: string[] = [];
      const store = createClassyStore({label: 'initial', count: 0, tail: 0});
      const handle = persist(store, {
        name: 'draft',
        skipHydration: trigger !== 'initial',
        syncTabs: trigger === 'storage',
        debounce,
        storage: {
          getItem: () => saved,
          setItem: (_key, value) => {
            saved = value;
            events.push('write');
          },
          removeItem: () => {
            saved = null;
            events.push('clear');
          },
        },
      });
      handles.push(handle);
      let cleared: Promise<void> | undefined;
      const stop = subscribeKey(
        store,
        'count',
        () => {
          store.label = 'normalized';
          cleared = handle.clear();
          if (editAfterClear) store.label = 'later';
        },
        {sync: true},
      );
      try {
        if (trigger === 'storage') {
          globalThis.dispatchEvent(
            new StorageEvent('storage', {key: 'draft', newValue: saved}),
          );
        } else if (trigger === 'manual') {
          await handle.rehydrate();
        } else {
          await handle.hydrated;
        }
        await cleared;
        await new Promise((resolve) => setTimeout(resolve, debounce + 5));
        expect(store.tail).toBe(2);
        expect(events).toEqual(editAfterClear ? ['clear', 'write'] : ['clear']);
        if (editAfterClear) {
          expect(JSON.parse(String(saved)).state.label).toBe('later');
        } else {
          expect(saved).toBeNull();
          store.label = 'next edit';
          await new Promise((resolve) => setTimeout(resolve, debounce + 5));
          expect(JSON.parse(String(saved)).state.label).toBe('next edit');
        }
      } finally {
        stop();
      }
    },
  );

  for (const trigger of ['initial', 'manual', 'storage']) {
    for (const storedLabel of [false, true]) {
      test.each([false, true])(
        `${trigger} restore preserves a subscriber's label edit (stored=${storedLabel}, labelFirst=%s)`,
        async (labelFirst) => {
          const store = createClassyStore(
            labelFirst
              ? {label: 'pending', count: 0, tail: 0}
              : {count: 0, label: 'pending', tail: 0},
          );
          const record = JSON.stringify({
            version: 0,
            state: {
              count: 1,
              ...(storedLabel ? {label: 'disk'} : {}),
              tail: 2,
            },
          });
          const write = mock((_key: string, _value: string) => {});
          const stop = subscribeKey(
            store,
            'count',
            () => {
              store.label = 'ready';
            },
            {sync: true},
          );
          const handle = persist(store, {
            name: 'draft',
            skipHydration: trigger !== 'initial',
            syncTabs: trigger === 'storage',
            storage: {
              getItem: () => record,
              setItem: write,
              removeItem: () => {},
            },
          });
          handles.push(handle);
          try {
            if (trigger === 'storage') {
              globalThis.dispatchEvent(
                new StorageEvent('storage', {key: 'draft', newValue: record}),
              );
            } else if (trigger === 'manual') {
              await handle.rehydrate();
            } else {
              await handle.hydrated;
            }
            await tick();
            expect(store.label).toBe('ready');
            expect(write).toHaveBeenCalledTimes(1);
            expect(JSON.parse(write.mock.calls[0][1]).state).toEqual({
              count: 1,
              label: 'ready',
              tail: 2,
            });
          } finally {
            stop();
          }
        },
      );
    }
  }

  test('custom merge preserves nested edits and a deleted field while restoring other fields', async () => {
    const store = createClassyStore<{
      count: number;
      preferences: {label: string};
      flag?: boolean;
      tail: number;
    }>({
      count: 0,
      preferences: {label: 'pending'},
      flag: undefined,
      tail: 0,
    });
    const record = JSON.stringify({
      version: 0,
      state: {count: 1, preferences: {label: 'disk'}, flag: true, tail: 2},
    });
    const write = mock((_key: string, _value: string) => {});
    const stop = subscribeKey(
      store,
      'count',
      () => {
        store.preferences.label = 'ready';
        delete store.flag;
      },
      {sync: true},
    );
    const handle = persist(store, {
      name: 'draft',
      skipHydration: true,
      storage: {getItem: () => record, setItem: write, removeItem: () => {}},
      merge: (stored, current) => ({...current, ...stored}),
    });
    handles.push(handle);
    try {
      await handle.rehydrate();
      await tick();
      expect(store.preferences.label).toBe('ready');
      expect(Object.hasOwn(store, 'flag')).toBe(false);
      expect(write).toHaveBeenCalledTimes(1);
      expect(JSON.parse(write.mock.calls[0][1]).state).toEqual({
        count: 1,
        preferences: {label: 'ready'},
        tail: 2,
      });
    } finally {
      stop();
    }
  });

  test('publishes expiry while asynchronous removal is still pending', async () => {
    const removal = deferred<void>();
    const started = deferred<void>();
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      skipHydration: true,
      clearOnExpire: true,
      storage: {
        getItem: () =>
          JSON.stringify({version: 0, state: {count: 1}, expiresAt: 0}),
        setItem: () => {},
        removeItem() {
          started.resolve();
          return removal.promise;
        },
      },
    });
    handles.push(handle);
    const hydration = handle.rehydrate();
    try {
      await started.promise;
      await tick();
      expect(handle.getSnapshot().isExpired).toBe(true);
    } finally {
      removal.resolve();
      await hydration;
    }
  });

  test.each([
    {sync: true, storageEvent: false, subscribeFirst: false},
    {sync: false, storageEvent: false, subscribeFirst: true},
    {sync: true, storageEvent: true, subscribeFirst: true},
    {sync: false, storageEvent: true, subscribeFirst: false},
  ])(
    'saves subscriber edits once (sync=$sync, storageEvent=$storageEvent, subscribeFirst=$subscribeFirst)',
    async ({sync, storageEvent, subscribeFirst}) => {
      const store = createClassyStore({count: 0, other: 0});
      const normalize = () => {
        if (store.count === 1) store.count = 3;
      };
      let stop = subscribeFirst
        ? subscribe(store, normalize, {sync})
        : undefined;
      const saved = JSON.stringify({version: 0, state: {count: 1, other: 2}});
      const setItem = mock((_key: string, _value: string) => {});
      const handle = persist(store, {
        name: 'draft',
        skipHydration: true,
        syncTabs: storageEvent,
        storage: {getItem: () => saved, setItem, removeItem: () => {}},
      });
      handles.push(handle);
      stop ??= subscribe(store, normalize, {sync});
      try {
        if (storageEvent) {
          globalThis.dispatchEvent(
            new StorageEvent('storage', {key: 'draft', newValue: saved}),
          );
        } else {
          await handle.rehydrate();
        }
        await tick();
        expect(store.count).toBe(3);
        expect(setItem).toHaveBeenCalledTimes(1);
        expect(JSON.parse(setItem.mock.calls[0][1]).state).toEqual({
          count: 3,
          other: 2,
        });
      } finally {
        stop();
      }
    },
  );

  test.each([
    {description: 'successful', fails: false},
    {description: 'failed', fails: true},
  ])(
    'keeps a newer save behind a $description pending write',
    async ({fails}) => {
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
    },
  );

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
  ])(
    'clear cancels a pending $description save and later edits still persist',
    async ({debounce}) => {
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
    },
  );

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

  test('a third write waits for the second after the first has finished', async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const started: number[] = [];
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      skipHydration: true,
      storage: {
        getItem: () => null,
        setItem: () => {
          const index = started.length;
          started.push(index);
          return gates[index].promise;
        },
        removeItem: () => {},
      },
    });
    handles.push(handle);

    const first = handle.save();
    const second = handle.save();
    await tick();
    expect(started).toEqual([0]);

    gates[0].resolve();
    await first;
    await tick();
    expect(started).toEqual([0, 1]);

    // The second write is in flight, so the third must queue behind it.
    const third = handle.save();
    await tick();
    expect(started).toEqual([0, 1]);

    gates[1].resolve();
    await second;
    await tick();
    expect(started).toEqual([0, 1, 2]);

    gates[2].resolve();
    await third;
  });
});
