import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {persist} from './persist';
import type {PersistHandle} from './persist.types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stored = (state: Record<string, unknown>, version = 0) =>
  JSON.stringify({version, state});
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

/** Storage whose read stays pending until the test releases it. */
function slowStorage(initial: string | null) {
  const read = deferred<string | null>();
  let saved = initial;
  const writes: string[] = [];
  return {
    release: () => read.resolve(saved),
    writes,
    get saved() {
      return saved;
    },
    storage: {
      getItem: () => read.promise,
      setItem: (_name: string, value: string) => {
        saved = value;
        writes.push(value);
      },
      removeItem: mock(() => {
        saved = null;
      }),
    },
  };
}

describe('persist hydration with local edits', () => {
  test('an edit to an unrelated field does not discard or overwrite stored data', async () => {
    const slow = slowStorage(stored({theme: 'dark', fontSize: 20}));
    const store = createClassyStore({
      theme: 'light',
      fontSize: 12,
      loading: false,
    });
    const handle = persist(store, {
      name: 'settings',
      storage: slow.storage,
      properties: ['theme', 'fontSize'],
    });
    handles.push(handle);

    store.loading = true; // Start-up state that is not even persisted.
    await tick();
    // The record must survive until the read can restore it.
    expect(slow.writes).toEqual([]);

    slow.release();
    await handle.hydrated;
    await tick();

    expect(store.theme).toBe('dark');
    expect(store.fontSize).toBe(20);
    expect(store.loading).toBe(true);
    expect(JSON.parse(slow.saved as string).state).toEqual({
      theme: 'dark',
      fontSize: 20,
    });
  });

  test('synchronous storage: an edit in the same tick as persist() keeps stored data', async () => {
    let saved: string | null = stored({theme: 'dark', fontSize: 20});
    const store = createClassyStore({
      theme: 'light',
      fontSize: 12,
      lastOpened: 0,
    });
    const handle = persist(store, {
      name: 'settings',
      properties: ['theme', 'fontSize'],
      storage: {
        getItem: () => saved,
        setItem: (_name, value) => {
          saved = value;
        },
        removeItem: () => {
          saved = null;
        },
      },
    });
    handles.push(handle);
    store.lastOpened = 123;

    await handle.hydrated;
    await tick();

    expect(store.theme).toBe('dark');
    expect(store.fontSize).toBe(20);
    expect(JSON.parse(saved as string).state).toEqual({
      theme: 'dark',
      fontSize: 20,
    });
  });

  test('only the field edited during the read keeps its local value', async () => {
    const slow = slowStorage(stored({theme: 'dark', fontSize: 20}));
    const store = createClassyStore({theme: 'light', fontSize: 12});
    const handle = persist(store, {name: 'settings', storage: slow.storage});
    handles.push(handle);

    store.fontSize = 16;
    await tick();
    slow.release();
    await handle.hydrated;
    await tick();

    expect(store.theme).toBe('dark');
    expect(store.fontSize).toBe(16);
    // The save issued after the read holds both the restored and the edited field.
    expect(slow.writes).toHaveLength(1);
    expect(JSON.parse(slow.saved as string).state).toEqual({
      theme: 'dark',
      fontSize: 16,
    });
  });

  test('a nested edit keeps that whole field and restores the others', async () => {
    const slow = slowStorage(
      stored({profile: {name: 'Stored', age: 40}, theme: 'dark'}),
    );
    const store = createClassyStore({
      profile: {name: 'Default', age: 0},
      theme: 'light',
    });
    const handle = persist(store, {name: 'user', storage: slow.storage});
    handles.push(handle);

    store.profile.name = 'Typed';
    slow.release();
    await handle.hydrated;

    expect(store.profile).toEqual({name: 'Typed', age: 0});
    expect(store.theme).toBe('dark');
  });

  test('an edit made while a debounced save is pending is saved after the read', async () => {
    const slow = slowStorage(stored({theme: 'dark', fontSize: 20}));
    const store = createClassyStore({theme: 'light', fontSize: 12});
    const handle = persist(store, {
      name: 'settings',
      storage: slow.storage,
      debounce: 5,
    });
    handles.push(handle);

    store.fontSize = 16;
    await tick(); // Arms the debounce while the read is still pending.
    slow.release();
    await handle.hydrated;
    expect(slow.writes).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(slow.writes).toHaveLength(1);
    expect(JSON.parse(slow.saved as string).state).toEqual({
      theme: 'dark',
      fontSize: 16,
    });
  });

  test('a read that finds nothing still saves the edit made while it was pending', async () => {
    const slow = slowStorage(null);
    const store = createClassyStore({count: 0});
    const handle = persist(store, {name: 'draft', storage: slow.storage});
    handles.push(handle);

    store.count = 3;
    await tick();
    expect(slow.writes).toEqual([]);
    slow.release();
    await handle.hydrated;
    await tick();

    expect(JSON.parse(slow.saved as string).state).toEqual({count: 3});
  });

  test('clear() during the read cancels the save an earlier edit asked for', async () => {
    const slow = slowStorage(stored({count: 1}));
    const store = createClassyStore({count: 0});
    const handle = persist(store, {name: 'draft', storage: slow.storage});
    handles.push(handle);

    store.count = 3;
    await tick();
    await handle.clear();
    slow.release();
    await handle.hydrated;
    await tick();

    expect(slow.storage.removeItem).toHaveBeenCalledTimes(1);
    expect(slow.writes).toEqual([]);
    expect(store.count).toBe(3);
  });

  test('plain hydration with no local edit writes nothing back', async () => {
    const slow = slowStorage(stored({count: 5}));
    const store = createClassyStore({count: 0});
    const handle = persist(store, {name: 'draft', storage: slow.storage});
    handles.push(handle);

    slow.release();
    await handle.hydrated;
    await tick();

    expect(store.count).toBe(5);
    expect(slow.writes).toEqual([]);
  });
});

describe('persist schema versions', () => {
  function syncStorage(initial: string) {
    let saved: string | null = initial;
    return {
      get saved() {
        return saved;
      },
      storage: {
        getItem: () => saved,
        setItem: (_name: string, value: string) => {
          saved = value;
        },
        removeItem: () => {
          saved = null;
        },
      },
    };
  }

  test('stored data from another version is ignored when there is no migrate', async () => {
    const backing = syncStorage(stored({theme: {name: 'dark'}}, 1));
    const onError = mock(() => {});
    const store = createClassyStore({theme: 'light'});
    const handle = persist(store, {
      name: 'settings',
      storage: backing.storage,
      version: 2,
      onError,
    });
    handles.push(handle);

    await handle.hydrated;

    expect(store.theme).toBe('light');
    expect(onError).not.toHaveBeenCalled();
    expect(handle.getSnapshot().lastError).toBeNull();
    // The old record is left alone until the next save replaces it.
    expect(JSON.parse(backing.saved as string).version).toBe(1);

    store.theme = 'solarized';
    await tick();
    expect(JSON.parse(backing.saved as string)).toEqual({
      version: 2,
      state: {theme: 'solarized'},
    });
  });

  test('migrate receives the stored state and its version', async () => {
    const backing = syncStorage(stored({theme: {name: 'dark'}}, 1));
    const store = createClassyStore({theme: 'light'});
    const handle = persist(store, {
      name: 'settings',
      storage: backing.storage,
      version: 2,
      migrate: (state, oldVersion) => ({
        theme: `${(state.theme as {name: string}).name}@${oldVersion}`,
      }),
    });
    handles.push(handle);

    await handle.hydrated;

    expect(store.theme).toBe('dark@1');
  });

  test('a record without a version counts as version 0', async () => {
    const record = JSON.stringify({state: {theme: 'dark'}});
    const current = createClassyStore({theme: 'light'});
    const sameVersion = persist(current, {
      name: 'settings',
      storage: syncStorage(record).storage,
    });
    const migrate = mock((state: Record<string, unknown>) => state);
    const newer = createClassyStore({theme: 'light'});
    const otherVersion = persist(newer, {
      name: 'settings',
      storage: syncStorage(record).storage,
      version: 1,
      migrate,
    });
    handles.push(sameVersion, otherVersion);

    await Promise.all([sameVersion.hydrated, otherVersion.hydrated]);

    expect(current.theme).toBe('dark');
    expect(newer.theme).toBe('dark');
    expect(migrate).toHaveBeenCalledWith({theme: 'dark'}, 0);
  });
});
