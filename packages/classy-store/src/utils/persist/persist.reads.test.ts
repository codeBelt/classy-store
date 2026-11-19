import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../index';
import type {PersistHandle} from '../index';
import {persist} from '../index';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stored = (state: Record<string, unknown>, extra: object = {}) =>
  JSON.stringify({version: 0, state, ...extra});
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persist reads in flight', () => {
  test.each([
    {trigger: 'save()', second: 0},
    {trigger: 'clear()', second: 0},
    {trigger: 'a record from another tab', second: 5},
  ])(
    '$trigger supersedes every read in flight, not only the latest',
    async ({trigger, second}) => {
      const reads = [deferred<string | null>(), deferred<string | null>()];
      let issued = 0;
      const store = createClassyStore({first: 0, second: 0});
      const handle = persist(store, {
        name: 'draft',
        skipHydration: true,
        syncTabs: true,
        storage: {
          getItem: () => reads[issued++].promise,
          setItem: () => {},
          removeItem: () => {},
        },
      });
      handles.push(handle);
      const older = handle.rehydrate();
      const newer = handle.rehydrate();

      if (trigger === 'save()') {
        await handle.save();
      } else if (trigger === 'clear()') {
        await handle.clear();
      } else {
        globalThis.dispatchEvent(
          new StorageEvent('storage', {
            key: 'draft',
            newValue: stored({second: 5}),
          }),
        );
      }

      // Both reads return records older than what just happened.
      reads[0].resolve(stored({first: 1}));
      reads[1].resolve(stored({first: 2}));
      await Promise.all([older, newer]);

      expect(store.first).toBe(0);
      expect(store.second).toBe(second);
    },
  );

  test('a read still waiting for an earlier write does not touch storage once the handle is disposed', async () => {
    const write = deferred<void>();
    const getItem = mock(() => null);
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      skipHydration: true,
      storage: {getItem, setItem: () => write.promise, removeItem: () => {}},
    });
    handles.push(handle);
    const saving = handle.save();
    const reading = handle.rehydrate();

    handle.dispose();
    write.resolve();
    await Promise.all([saving, reading]);

    expect(getItem).not.toHaveBeenCalled();
  });

  test('an explicit save during a read replaces the save an earlier edit was waiting for', async () => {
    const read = deferred<string | null>();
    const writes: string[] = [];
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: {
        getItem: () => read.promise,
        setItem: (_name, value) => {
          writes.push(value);
        },
        removeItem: () => {},
      },
    });
    handles.push(handle);

    store.count = 3;
    await tick(); // The edit now waits for the read before it is saved.
    await handle.save();
    read.resolve(stored({count: 1}));
    await handle.hydrated;
    await tick();

    expect(store.count).toBe(3);
    expect(writes.map((value) => JSON.parse(value).state)).toEqual([
      {count: 3},
    ]);
  });

  test('rehydrate() publishes the cleared expiry flag before its read settles', async () => {
    const read = deferred<string | null>();
    const getItem = mock<() => string | null | Promise<string | null>>()
      .mockReturnValueOnce(stored({count: 1}, {expiresAt: 1}))
      .mockReturnValueOnce(read.promise);
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      skipHydration: true,
      storage: {getItem, setItem: () => {}, removeItem: () => {}},
    });
    handles.push(handle);
    await handle.rehydrate();
    expect(handle.getSnapshot().isExpired).toBe(true);
    const listener = mock(() => {});
    const stop = handle.subscribe(listener);

    const rereading = handle.rehydrate();

    try {
      expect(handle.getSnapshot().isExpired).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      stop();
      read.resolve(null);
      await rereading;
    }
  });
});
