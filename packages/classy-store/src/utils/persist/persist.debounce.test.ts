import {afterEach, describe, expect, type Mock, spyOn, test} from 'bun:test';
import {createClassyStore, subscribe} from '../../index';
import type {PersistHandle} from '../index';
import {persist} from '../index';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

// Captured before any test replaces the timer functions.
const realSetTimeout = globalThis.setTimeout;
const tick = () => new Promise<void>((resolve) => realSetTimeout(resolve, 0));
const stored = (state: Record<string, unknown>) =>
  JSON.stringify({version: 0, state});
const statesOf = (writes: string[]) =>
  writes.map((value) => JSON.parse(value).state);

const handles: PersistHandle[] = [];
const spies: Mock<(...args: never[]) => unknown>[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
  for (const spy of spies.splice(0)) spy.mockRestore();
});

/**
 * Replaces the timer functions for one test, so the test decides when the
 * debounce elapses and can see whether a timer is still pending.
 */
function fakeClock() {
  let now = 0;
  let lastId = 0;
  const timers = new Map<number, {due: number; run: () => void}>();
  spies.push(
    spyOn(globalThis, 'setTimeout').mockImplementation(((
      run: () => void,
      delay = 0,
    ) => {
      timers.set(++lastId, {due: now + delay, run});
      return lastId;
    }) as unknown as typeof setTimeout),
    spyOn(globalThis, 'clearTimeout').mockImplementation(((id: number) => {
      timers.delete(id);
    }) as typeof clearTimeout),
  );
  return {
    get pending() {
      return timers.size;
    },
    advance(milliseconds: number) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.due > now) continue;
        timers.delete(id);
        timer.run();
      }
    },
  };
}

/** Synchronous storage that holds one record and remembers every write. */
function memoryStorage(initial: string | null = null) {
  let saved = initial;
  const writes: string[] = [];
  return {
    writes,
    storage: {
      getItem: () => saved,
      setItem: (_name: string, value: string) => {
        saved = value;
        writes.push(value);
      },
      removeItem: () => {
        saved = null;
      },
    },
  };
}

describe('persist debounce timer and dispose', () => {
  test('dispose() cancels the pending debounce timer', async () => {
    const clock = fakeClock();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: memoryStorage().storage,
      debounce: 100,
      skipHydration: true,
    });
    handles.push(handle);
    store.count = 1;
    await tick();
    expect(clock.pending).toBe(1);

    handle.dispose();

    expect(clock.pending).toBe(0);
  });

  test('a handle disposed by an earlier subscriber of the same change arms no timer', async () => {
    const clock = fakeClock();
    const store = createClassyStore({count: 0});
    let handle: PersistHandle | undefined;
    const stop = subscribe(store, () => handle?.dispose());
    handle = persist(store, {
      name: 'draft',
      storage: memoryStorage().storage,
      debounce: 100,
      skipHydration: true,
    });
    handles.push(handle);

    store.count = 1;
    await tick();
    stop();

    expect(handle.getSnapshot().isDisposed).toBe(true);
    expect(clock.pending).toBe(0);
  });

  test('a read that settles after dispose arms no timer for the edit that waited for it', async () => {
    const clock = fakeClock();
    const read = deferred<string | null>();
    const memory = memoryStorage();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: {...memory.storage, getItem: () => read.promise},
      debounce: 100,
    });
    handles.push(handle);
    store.count = 1;
    await tick();
    clock.advance(100); // The debounce elapses mid-read, so the save waits for the read.
    expect(memory.writes).toEqual([]);

    handle.dispose();
    read.resolve(null);
    await handle.hydrated;
    await tick();

    expect(clock.pending).toBe(0);
    expect(memory.writes).toEqual([]);
  });
});

describe('persist debounce and reads', () => {
  test('after a debounced save has run, reading the record back writes nothing', async () => {
    const clock = fakeClock();
    const memory = memoryStorage();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: memory.storage,
      debounce: 100,
      skipHydration: true,
    });
    handles.push(handle);
    store.count = 1;
    await tick();
    clock.advance(100);
    expect(statesOf(memory.writes)).toEqual([{count: 1}]);

    await handle.rehydrate();
    await tick();
    expect(clock.pending).toBe(0);
    clock.advance(100);

    expect(memory.writes).toHaveLength(1);
  });

  test.each([
    {trigger: 'save()', writes: 1},
    {trigger: 'clear()', writes: 0},
    {trigger: 'a record from another tab', writes: 0},
  ])(
    'a debounced save cancelled by $trigger is not revived by a later read',
    async ({trigger, writes}) => {
      const clock = fakeClock();
      const record = stored({count: 7});
      const written: string[] = [];
      const store = createClassyStore({count: 0});
      const handle = persist(store, {
        name: 'draft',
        debounce: 100,
        skipHydration: true,
        syncTabs: true,
        storage: {
          getItem: () => record,
          setItem: (_name, value) => {
            written.push(value);
          },
          removeItem: () => {},
        },
      });
      handles.push(handle);
      store.count = 1;
      await tick();
      expect(clock.pending).toBe(1);

      if (trigger === 'save()') {
        await handle.save();
      } else if (trigger === 'clear()') {
        await handle.clear();
      } else {
        globalThis.dispatchEvent(
          new StorageEvent('storage', {key: 'draft', newValue: record}),
        );
      }
      expect(clock.pending).toBe(0);

      await handle.rehydrate();
      await tick();
      clock.advance(100);

      expect(store.count).toBe(7);
      expect(written).toHaveLength(writes);
    },
  );

  test('a removal in another tab does not cancel a pending debounced save', async () => {
    const clock = fakeClock();
    const memory = memoryStorage();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: memory.storage,
      debounce: 100,
      skipHydration: true,
      syncTabs: true,
    });
    handles.push(handle);
    store.count = 1;
    await tick();

    globalThis.dispatchEvent(
      new StorageEvent('storage', {key: 'draft', newValue: null}),
    );
    clock.advance(100);

    expect(statesOf(memory.writes)).toEqual([{count: 1}]);
  });

  test('a read that finds nothing leaves a pending debounced save on its schedule', async () => {
    const clock = fakeClock();
    const memory = memoryStorage();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: memory.storage,
      debounce: 100,
      skipHydration: true,
    });
    handles.push(handle);
    store.count = 1;
    await tick();

    clock.advance(60);
    await handle.rehydrate();
    clock.advance(40); // 100 ms after the edit.

    expect(statesOf(memory.writes)).toEqual([{count: 1}]);
  });

  test('a read that restores data restarts the debounce of a pending save', async () => {
    const clock = fakeClock();
    const memory = memoryStorage(stored({theme: 'dark'}));
    const store = createClassyStore({theme: 'light', fontSize: 12});
    const handle = persist(store, {
      name: 'settings',
      storage: memory.storage,
      debounce: 100,
      skipHydration: true,
    });
    handles.push(handle);
    store.fontSize = 16;
    await tick();

    clock.advance(60);
    await handle.rehydrate();
    clock.advance(40); // 100 ms after the edit, 40 ms after the read.
    expect(memory.writes).toEqual([]);

    clock.advance(60); // 100 ms after the read.
    expect(statesOf(memory.writes)).toEqual([{theme: 'dark', fontSize: 16}]);
  });

  test('a save deferred by overlapping reads is debounced from the moment the last read settles', async () => {
    const clock = fakeClock();
    const reads = [deferred<string | null>(), deferred<string | null>()];
    let issued = 0;
    const memory = memoryStorage();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage: {...memory.storage, getItem: () => reads[issued++].promise},
      debounce: 100,
      skipHydration: true,
    });
    handles.push(handle);
    const older = handle.rehydrate();
    const newer = handle.rehydrate();
    store.count = 1;
    await tick();
    clock.advance(100); // The debounce elapses mid-read, so the save waits.

    reads[0].resolve(null);
    await older;
    clock.advance(50);
    reads[1].resolve(null);
    await newer;

    clock.advance(50); // 100 ms after the first read settled.
    expect(memory.writes).toEqual([]);
    clock.advance(50); // 100 ms after the last read settled.
    expect(statesOf(memory.writes)).toEqual([{count: 1}]);
  });
});
