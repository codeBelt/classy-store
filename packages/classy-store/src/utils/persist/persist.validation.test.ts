import {afterEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {createClassyStore} from '../../index';
import type {PersistHandle} from '../index';
import {persist} from '../index';

const stored = (state: Record<string, unknown>, extra: object = {}) =>
  JSON.stringify({version: 0, state, ...extra});
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

/** Synchronous storage that holds one record. */
function recordStorage(initial: string | null = null) {
  let saved = initial;
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

describe('persist stored records that are not an envelope', () => {
  test.each([
    ['the JSON value null', 'null'],
    ['a number', '42'],
    ['a string', '"text"'],
    ['an object without state', '{"version":0}'],
    ['an envelope whose state is null', '{"version":0,"state":null}'],
    ['an envelope whose state is a string', '{"version":0,"state":"text"}'],
  ])('%s is skipped without reporting an error', async (_name, record) => {
    const onError = mock(() => {});
    const store = createClassyStore({count: 1});
    const handle = persist(store, {
      name: 'draft',
      storage: recordStorage(record).storage,
      skipHydration: true,
      onError,
    });
    handles.push(handle);

    await expect(handle.rehydrate()).resolves.toBeUndefined();

    expect(store.count).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    expect(handle.getSnapshot().lastError).toBeNull();
    expect(handle.isExpired).toBe(false);
  });
});

describe('persist record expiry', () => {
  test.each([
    {now: 4_999, isExpired: false, count: 7},
    {now: 5_000, isExpired: true, count: 0},
  ])(
    'a record with expiresAt 5000 read at $now has isExpired $isExpired',
    async ({now, isExpired, count}) => {
      const clock = spyOn(Date, 'now').mockReturnValue(now);
      const store = createClassyStore({count: 0});
      const handle = persist(store, {
        name: 'draft',
        storage: recordStorage(stored({count: 7}, {expiresAt: 5_000})).storage,
        skipHydration: true,
      });
      handles.push(handle);

      try {
        await handle.rehydrate();
      } finally {
        clock.mockRestore();
      }

      expect(handle.isExpired).toBe(isExpired);
      expect(store.count).toBe(count);
    },
  );

  test('a record saved with expireIn: Infinity never expires', async () => {
    const backing = recordStorage();
    const writer = persist(createClassyStore({count: 7}), {
      name: 'draft',
      storage: backing.storage,
      expireIn: Number.POSITIVE_INFINITY,
      skipHydration: true,
    });
    handles.push(writer);
    await writer.save();

    const store = createClassyStore({count: 0});
    const reader = persist(store, {
      name: 'draft',
      storage: backing.storage,
      expireIn: Number.POSITIVE_INFINITY,
    });
    handles.push(reader);
    await reader.hydrated;

    expect(reader.isExpired).toBe(false);
    expect(store.count).toBe(7);
  });
});

describe('persist default properties', () => {
  test('a stored value does not replace a method held as an own property', async () => {
    const store = createClassyStore({
      count: 0,
      reset() {
        this.count = 0;
      },
    });
    const handle = persist(store, {
      name: 'draft',
      storage: recordStorage(stored({count: 5, reset: 'not a function'}))
        .storage,
    });
    handles.push(handle);

    await handle.hydrated;

    expect(store.count).toBe(5);
    expect(typeof store.reset).toBe('function');
  });
});

describe('persist properties entries that are neither a key nor a full transform', () => {
  const serialize = mock(() => 'serialized');
  afterEach(() => {
    serialize.mockClear();
  });

  test.each<[string, unknown]>([
    ['null', null],
    ['a transform without a key', {serialize, deserialize: Number}],
    ['a transform without serialize', {key: 'other', deserialize: Number}],
  ])(
    '%s is ignored and the valid keys are still saved',
    async (_name, entry) => {
      const backing = recordStorage();
      const store = createClassyStore({count: 1, other: 2});
      const handle = persist(store, {
        name: 'draft',
        storage: backing.storage,
        skipHydration: true,
        // An untyped caller can pass anything here.
        properties: ['count', entry as 'count'],
      });
      handles.push(handle);

      await handle.save();

      expect(backing.saved).toBe('{"version":0,"state":{"count":1}}');
      expect(serialize).not.toHaveBeenCalled();
    },
  );
});
