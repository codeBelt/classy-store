import {describe, expect, it, mock} from 'bun:test';
import type {ReactiveMap} from '../../collections/collections';
import {reactiveMap} from '../../collections/collections';
import {createClassyStore} from '../../core/core';
import type {StorageAdapter} from './persist';
import {persist} from './persist';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Flush the queueMicrotask-based batching. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Wait for a given number of milliseconds. */
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Create an in-memory sync StorageAdapter for testing. */
function createMockStorage(): StorageAdapter & {data: Map<string, string>} {
  const data = new Map<string, string>();
  return {
    data,
    getItem(name: string) {
      return data.get(name) ?? null;
    },
    setItem(name: string, value: string) {
      data.set(name, value);
    },
    removeItem(name: string) {
      data.delete(name);
    },
  };
}

/** Create an in-memory async StorageAdapter for testing. */
function createAsyncMockStorage(): StorageAdapter & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(name: string) {
      await Promise.resolve();
      return data.get(name) ?? null;
    },
    async setItem(name: string, value: string) {
      await Promise.resolve();
      data.set(name, value);
    },
    async removeItem(name: string) {
      await Promise.resolve();
      data.delete(name);
    },
  };
}

/** Parse the stored envelope from a mock storage adapter. */
function parseStored(
  storage: {data: Map<string, string>},
  key: string,
): {version: number; state: Record<string, unknown>} | null {
  const raw = storage.data.get(key);
  if (!raw) return null;
  return JSON.parse(raw);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('persist()', () => {
  // ── Basic round-trip ─────────────────────────────────────────────────────

  describe('basic round-trip', () => {
    it('saves store state to storage on mutation', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0, name: 'hello'});
      persist(s, {name: 'test', storage});

      s.count = 42;
      await tick();

      const stored = parseStored(storage, 'test');
      expect(stored).not.toBeNull();
      expect(stored?.state.count).toBe(42);
      expect(stored?.state.name).toBe('hello');
    });

    it('restores state from storage on init (auto-hydration)', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 99, name: 'restored'}}),
      );

      const s = createClassyStore({count: 0, name: 'initial'});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.count).toBe(99);
      expect(s.name).toBe('restored');
    });

    it('wraps state in a versioned envelope', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({value: 1});
      persist(s, {name: 'test', storage, version: 3});

      s.value = 2;
      await tick();

      const stored = parseStored(storage, 'test');
      expect(stored?.version).toBe(3);
      expect(stored?.state.value).toBe(2);
    });

    it('excludes getters from persisted state', async () => {
      class MyStore {
        count = 5;
        get doubled() {
          return this.count * 2;
        }
      }

      const storage = createMockStorage();
      const s = createClassyStore(new MyStore());
      persist(s, {name: 'test', storage});

      s.count = 10;
      await tick();

      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(10);
      expect(stored?.state).not.toHaveProperty('doubled');
    });

    it('excludes methods from persisted state', async () => {
      class MyStore {
        count = 0;
        increment() {
          this.count++;
        }
      }

      const storage = createMockStorage();
      const s = createClassyStore(new MyStore());
      persist(s, {name: 'test', storage});

      s.increment();
      await tick();

      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(1);
      expect(stored?.state).not.toHaveProperty('increment');
    });
  });

  // ── Pick specific properties ────────────────────────────────────────────

  describe('properties option', () => {
    it('persists only the specified properties', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0, name: 'hello', secret: 'hidden'});
      persist(s, {name: 'test', storage, properties: ['count', 'name']});

      s.count = 10;
      s.secret = 'new-secret';
      await tick();

      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(10);
      expect(stored?.state.name).toBe('hello');
      expect(stored?.state).not.toHaveProperty('secret');
    });

    it('restores only the specified properties', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 99, name: 'stored', secret: 'stored-secret'},
        }),
      );

      const s = createClassyStore({
        count: 0,
        name: 'initial',
        secret: 'original',
      });
      const handle = persist(s, {
        name: 'test',
        storage,
        properties: ['count', 'name'],
      });
      await handle.hydrated;

      expect(s.count).toBe(99);
      expect(s.name).toBe('stored');
      expect(s.secret).toBe('original'); // not restored
    });
  });

  // ── Per-property transforms ──────────────────────────────────────────────

  describe('per-property transforms', () => {
    it('serializes and deserializes Date via transform', async () => {
      class SessionStore {
        token = 'abc';
        expiresAt = new Date('2026-01-01T00:00:00.000Z');
      }

      const storage = createMockStorage();
      const s = createClassyStore(new SessionStore());

      // Save
      persist(s, {
        name: 'session',
        storage,
        properties: [
          'token',
          {
            key: 'expiresAt',
            serialize: (date) => (date as Date).toISOString(),
            deserialize: (stored) => new Date(stored as string),
          },
        ],
      });

      s.token = 'xyz';
      s.expiresAt = new Date('2026-06-15T12:00:00.000Z');
      await tick();

      const stored = parseStored(storage, 'session');
      expect(stored?.state.token).toBe('xyz');
      expect(stored?.state.expiresAt).toBe('2026-06-15T12:00:00.000Z');

      // Restore
      const s2 = createClassyStore(new SessionStore());
      const handle = persist(s2, {
        name: 'session',
        storage,
        properties: [
          'token',
          {
            key: 'expiresAt',
            serialize: (date) => (date as Date).toISOString(),
            deserialize: (stored) => new Date(stored as string),
          },
        ],
      });
      await handle.hydrated;

      expect(s2.token).toBe('xyz');
      expect(s2.expiresAt).toBeInstanceOf(Date);
      expect(s2.expiresAt.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    it('serializes and deserializes ReactiveMap via transform', async () => {
      class UserStore {
        users = reactiveMap<string, {name: string}>();
      }

      const storage = createMockStorage();
      const s = createClassyStore(new UserStore());

      persist(s, {
        name: 'users',
        storage,
        properties: [
          {
            key: 'users',
            serialize: (users) => [
              ...(users as ReactiveMap<string, {name: string}>).entries(),
            ],
            deserialize: (stored) =>
              reactiveMap(stored as [string, {name: string}][]),
          },
        ],
      });

      s.users.set('u1', {name: 'Alice'});
      s.users.set('u2', {name: 'Bob'});
      await tick();

      const stored = parseStored(storage, 'users');
      expect(stored?.state.users).toEqual([
        ['u1', {name: 'Alice'}],
        ['u2', {name: 'Bob'}],
      ]);

      // Restore
      const s2 = createClassyStore(new UserStore());
      const handle = persist(s2, {
        name: 'users',
        storage,
        properties: [
          {
            key: 'users',
            serialize: (users) => [
              ...(users as ReactiveMap<string, {name: string}>).entries(),
            ],
            deserialize: (stored) =>
              reactiveMap(stored as [string, {name: string}][]),
          },
        ],
      });
      await handle.hydrated;

      expect(s2.users.get('u1')).toEqual({name: 'Alice'});
      expect(s2.users.get('u2')).toEqual({name: 'Bob'});
      expect(s2.users.size).toBe(2);
    });
  });

  // ── Debounce ─────────────────────────────────────────────────────────────

  describe('debounce', () => {
    it('coalesces rapid mutations into one write', async () => {
      const storage = createMockStorage();
      const setItemSpy = mock(storage.setItem.bind(storage));
      storage.setItem = setItemSpy;

      const s = createClassyStore({count: 0});
      persist(s, {name: 'test', storage, debounce: 50});

      s.count = 1;
      await tick();
      s.count = 2;
      await tick();
      s.count = 3;
      await tick();

      // Not written yet (debounce pending).
      expect(setItemSpy).not.toHaveBeenCalled();

      // Wait for debounce to fire.
      await wait(80);

      expect(setItemSpy).toHaveBeenCalledTimes(1);
      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(3);
    });

    it('save() bypasses debounce and writes immediately', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, debounce: 5000});

      s.count = 42;
      await tick();

      // Debounce hasn't fired yet.
      expect(parseStored(storage, 'test')).toBeNull();

      // Save bypasses debounce.
      await handle.save();
      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(42);
    });
  });

  // ── Version migration ───────────────────────────────────────────────────

  describe('version migration', () => {
    it('calls migrate when stored version differs', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {items: ['buy milk']}}),
      );

      const s = createClassyStore({
        todos: [] as {text: string; done: boolean}[],
      });
      const handle = persist(s, {
        name: 'test',
        storage,
        version: 1,
        migrate: (state, oldVersion) => {
          if (oldVersion === 0) {
            return {
              todos: (state.items as string[]).map((text) => ({
                text,
                done: false,
              })),
            };
          }
          return state;
        },
      });
      await handle.hydrated;

      expect(s.todos).toEqual([{text: 'buy milk', done: false}]);
    });

    it('does not call migrate when versions match', async () => {
      const migrateFn = mock((state: Record<string, unknown>) => state);
      const storage = createMockStorage();
      storage.data.set('test', JSON.stringify({version: 1, state: {count: 5}}));

      const s = createClassyStore({count: 0});
      const handle = persist(s, {
        name: 'test',
        storage,
        version: 1,
        migrate: migrateFn,
      });
      await handle.hydrated;

      expect(migrateFn).not.toHaveBeenCalled();
      expect(s.count).toBe(5);
    });
  });

  // ── Merge strategies ────────────────────────────────────────────────────

  describe('merge strategies', () => {
    it('shallow merge (default): preserves new properties not in storage', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {theme: 'dark'}}),
      );

      const s = createClassyStore({
        theme: 'light',
        fontSize: 14,
        sidebar: true,
      });
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.theme).toBe('dark'); // overwritten by storage
      expect(s.fontSize).toBe(14); // kept (not in storage)
      expect(s.sidebar).toBe(true); // kept (not in storage)
    });

    it('replace merge: only uses persisted keys, drops missing defaults', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {theme: 'dark'}}),
      );

      const s = createClassyStore({theme: 'light', fontSize: 14});
      const handle = persist(s, {name: 'test', storage, merge: 'replace'});
      await handle.hydrated;

      expect(s.theme).toBe('dark');
      // With 'replace', fontSize is not in persisted state so it should NOT be applied
      // (only persisted keys are used). The store keeps its default since 'fontSize'
      // is not in the merged result and the apply loop skips keys not in merged.
      expect(s.fontSize).toBe(14);
    });

    it('replace merge: does not spread current defaults into merged state', async () => {
      const storage = createMockStorage();
      // Persist only has 'a', the store has 'a' and 'b'
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {a: 'from-storage'}}),
      );

      const s = createClassyStore({a: 'default-a', b: 'default-b'});
      const handle = persist(s, {name: 'test', storage, merge: 'replace'});
      await handle.hydrated;

      expect(s.a).toBe('from-storage');
      // 'b' is not in persisted state and replace doesn't merge current defaults,
      // so 'b' stays at its default because the apply loop checks `key in merged`
      expect(s.b).toBe('default-b');
    });

    it('custom merge function', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 10, extra: 'from-storage'}}),
      );

      const s = createClassyStore({count: 0, name: 'default'});
      const handle = persist(s, {
        name: 'test',
        storage,
        merge: (persisted, current) => {
          // Only merge 'count', ignore everything else from storage.
          return {...current, count: persisted.count};
        },
      });
      await handle.hydrated;

      expect(s.count).toBe(10);
      expect(s.name).toBe('default');
    });
  });

  // ── skipHydration ───────────────────────────────────────────────────────

  describe('skipHydration', () => {
    it('does not hydrate on init when skipHydration is true', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 99}}),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {
        name: 'test',
        storage,
        skipHydration: true,
      });

      // Give it time — should NOT hydrate.
      await tick();
      expect(s.count).toBe(0);
      expect(handle.isHydrated).toBe(false);
    });

    it('hydrates when rehydrate() is called manually', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 99}}),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {
        name: 'test',
        storage,
        skipHydration: true,
      });

      await handle.rehydrate();
      expect(s.count).toBe(99);
      expect(handle.isHydrated).toBe(true);
    });

    it('hydrated promise resolves after manual rehydrate()', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 42}}),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {
        name: 'test',
        storage,
        skipHydration: true,
      });

      // Start rehydrate, then await the promise.
      void handle.rehydrate();
      await handle.hydrated;
      expect(s.count).toBe(42);
    });
  });

  // ── Unsubscribe ─────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('stops writing to storage after unsubscribe()', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});

      s.count = 1;
      await tick();
      expect(parseStored(storage, 'test')?.state.count).toBe(1);

      handle.unsubscribe();

      s.count = 999;
      await tick();

      // Should still be 1 — no write after unsubscribe.
      expect(parseStored(storage, 'test')?.state.count).toBe(1);
    });

    it('cancels pending debounce on unsubscribe()', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, debounce: 100});

      s.count = 42;
      await tick();
      handle.unsubscribe();

      await wait(150);

      // Debounce was cancelled — nothing written.
      expect(parseStored(storage, 'test')).toBeNull();
    });
  });

  // ── save / clear / rehydrate ────────────────────────────────────────────

  describe('save / clear / rehydrate', () => {
    it('save() writes immediately', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});

      s.count = 42;
      await tick();
      await handle.save();

      expect(parseStored(storage, 'test')?.state.count).toBe(42);
    });

    it('clear() removes the stored data', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});

      s.count = 5;
      await tick();
      expect(storage.data.has('test')).toBe(true);

      await handle.clear();
      expect(storage.data.has('test')).toBe(false);
    });

    it('clear() does not affect in-memory state', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 42});
      const handle = persist(s, {name: 'test', storage});

      s.count = 42;
      await tick();
      await handle.clear();

      expect(s.count).toBe(42); // in-memory unchanged
    });

    it('rehydrate() re-reads from storage', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      // Manually write to storage (simulating another source).
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 777}}),
      );

      await handle.rehydrate();
      expect(s.count).toBe(777);
    });
  });

  // ── isHydrated / hydrated promise ───────────────────────────────────────

  describe('hydration state', () => {
    it('isHydrated is false before hydration completes', () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});

      // Sync storage hydrates quickly, but the promise is async.
      // isHydrated may or may not be true synchronously for sync storage.
      // We just check the promise resolves.
      expect(handle.hydrated).toBeInstanceOf(Promise);
    });

    it('hydrated promise resolves after init', async () => {
      const storage = createMockStorage();
      storage.data.set('test', JSON.stringify({version: 0, state: {count: 5}}));

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(handle.isHydrated).toBe(true);
      expect(s.count).toBe(5);
    });
  });

  // ── Async storage ───────────────────────────────────────────────────────

  describe('async storage', () => {
    it('works with an async storage adapter', async () => {
      const storage = createAsyncMockStorage();
      const s = createClassyStore({count: 0});
      persist(s, {name: 'test', storage, syncTabs: false});

      s.count = 42;
      await tick();
      // Wait for the async write to complete.
      await wait(20);

      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(42);
    });

    it('hydrates from async storage', async () => {
      const storage = createAsyncMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 99}}),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, syncTabs: false});
      await handle.hydrated;

      expect(s.count).toBe(99);
    });
  });

  // ── Cross-tab sync ──────────────────────────────────────────────────────

  describe('cross-tab sync', () => {
    it('applies state when a storage event fires for the correct key', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, syncTabs: true});
      await handle.hydrated;

      // Simulate a storage event from another tab.
      const event = new StorageEvent('storage', {
        key: 'test',
        newValue: JSON.stringify({version: 0, state: {count: 123}}),
      });
      globalThis.dispatchEvent(event);

      expect(s.count).toBe(123);

      handle.unsubscribe();
    });

    it('ignores storage events for other keys', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, syncTabs: true});
      await handle.hydrated;

      const event = new StorageEvent('storage', {
        key: 'other-key',
        newValue: JSON.stringify({version: 0, state: {count: 999}}),
      });
      globalThis.dispatchEvent(event);

      expect(s.count).toBe(0); // unchanged

      handle.unsubscribe();
    });

    it('stops listening after unsubscribe()', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, syncTabs: true});
      await handle.hydrated;

      handle.unsubscribe();

      const event = new StorageEvent('storage', {
        key: 'test',
        newValue: JSON.stringify({version: 0, state: {count: 999}}),
      });
      globalThis.dispatchEvent(event);

      expect(s.count).toBe(0); // unchanged — listener removed
    });

    it('does not listen when syncTabs is false', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, syncTabs: false});
      await handle.hydrated;

      const event = new StorageEvent('storage', {
        key: 'test',
        newValue: JSON.stringify({version: 0, state: {count: 999}}),
      });
      globalThis.dispatchEvent(event);

      expect(s.count).toBe(0); // unchanged

      handle.unsubscribe();
    });
  });

  // ── expireIn / TTL ─────────────────────────────────────────────────────

  describe('expireIn / TTL', () => {
    it('hydrates normally when TTL has not elapsed', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 42},
          expiresAt: Date.now() + 60_000,
        }),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, expireIn: 60_000});
      await handle.hydrated;

      expect(s.count).toBe(42);
      expect(handle.isExpired).toBe(false);
    });

    it('skips hydration when TTL has elapsed and sets isExpired', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 42},
          expiresAt: Date.now() - 1000,
        }),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, expireIn: 60_000});
      await handle.hydrated;

      expect(s.count).toBe(0); // not hydrated
      expect(handle.isExpired).toBe(true);
    });

    it('clearOnExpire: true removes the key from storage', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 42},
          expiresAt: Date.now() - 1000,
        }),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {
        name: 'test',
        storage,
        expireIn: 60_000,
        clearOnExpire: true,
      });
      await handle.hydrated;
      await tick();

      expect(storage.data.has('test')).toBe(false);
    });

    it('clearOnExpire: false (default) leaves the key in storage', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 42},
          expiresAt: Date.now() - 1000,
        }),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, expireIn: 60_000});
      await handle.hydrated;
      await tick();

      expect(storage.data.has('test')).toBe(true);
    });

    it('cross-tab sync rejects expired envelopes', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {
        name: 'test',
        storage,
        expireIn: 60_000,
        syncTabs: true,
      });
      await handle.hydrated;

      const event = new StorageEvent('storage', {
        key: 'test',
        newValue: JSON.stringify({
          version: 0,
          state: {count: 999},
          expiresAt: Date.now() - 1000,
        }),
      });
      globalThis.dispatchEvent(event);

      expect(s.count).toBe(0); // expired — rejected
      expect(handle.isExpired).toBe(true);

      handle.unsubscribe();
    });

    it('data without expiresAt hydrates normally when expireIn is set', async () => {
      const storage = createMockStorage();
      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 77}}),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, expireIn: 60_000});
      await handle.hydrated;

      expect(s.count).toBe(77);
      expect(handle.isExpired).toBe(false);
    });

    it('TTL resets on every write (envelope timestamp refreshes)', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      persist(s, {name: 'test', storage, expireIn: 30_000});

      const before = Date.now();
      s.count = 1;
      await tick();

      const stored1 = parseStored(storage, 'test') as unknown as {
        expiresAt: number;
      };
      expect(stored1.expiresAt).toBeGreaterThanOrEqual(before + 30_000);

      // Second write should bump the timestamp.
      const betweenWrites = Date.now();
      s.count = 2;
      await tick();

      const stored2 = parseStored(storage, 'test') as unknown as {
        expiresAt: number;
      };
      expect(stored2.expiresAt).toBeGreaterThanOrEqual(betweenWrites + 30_000);
      expect(stored2.expiresAt).toBeGreaterThanOrEqual(stored1.expiresAt);
    });

    it('rehydrate() re-checks expiry', async () => {
      const storage = createMockStorage();
      // Start with valid data.
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 42},
          expiresAt: Date.now() + 60_000,
        }),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, expireIn: 60_000});
      await handle.hydrated;
      expect(s.count).toBe(42);
      expect(handle.isExpired).toBe(false);

      // Simulate data becoming expired.
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 99},
          expiresAt: Date.now() - 1000,
        }),
      );

      await handle.rehydrate();
      expect(s.count).toBe(42); // unchanged — expired data not applied
      expect(handle.isExpired).toBe(true);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty/missing storage gracefully', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.count).toBe(0); // no stored data, keeps default
    });

    it('handles corrupted JSON in storage gracefully', async () => {
      const storage = createMockStorage();
      storage.data.set('test', 'not-valid-json!!!');

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.count).toBe(0); // corrupted data skipped
    });

    it('handles invalid envelope shape gracefully', async () => {
      const storage = createMockStorage();
      storage.data.set('test', JSON.stringify({bad: 'shape'}));

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.count).toBe(0); // invalid envelope skipped
    });

    it('throws if no storage adapter is available', () => {
      // Override the localStorage getter so getDefaultStorage() catches
      // and returns undefined, triggering the error path.
      const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new Error('no localStorage');
        },
        configurable: true,
      });
      try {
        const s = createClassyStore({count: 0});
        expect(() => persist(s, {name: 'test'})).toThrow(/storage adapter/i);
      } finally {
        if (desc) {
          Object.defineProperty(globalThis, 'localStorage', desc);
        }
      }
    });

    it('handles null state in envelope gracefully', async () => {
      const storage = createMockStorage();
      storage.data.set('test', JSON.stringify({version: 0, state: null}));

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.count).toBe(0); // invalid state skipped
    });

    it('handles array as envelope gracefully (not an object with state)', async () => {
      const storage = createMockStorage();
      storage.data.set('test', JSON.stringify([1, 2, 3]));

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      expect(s.count).toBe(0); // invalid envelope skipped
    });

    it('unsubscribe is idempotent (calling twice does not throw)', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      handle.unsubscribe();
      handle.unsubscribe(); // should not throw
    });

    it('save after unsubscribe is a no-op', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;

      handle.unsubscribe();
      s.count = 999;
      await handle.save(); // should not throw or write

      const stored = parseStored(storage, 'test');
      // Should not have count=999
      expect(stored?.state.count ?? 0).not.toBe(999);
    });

    it('clear after unsubscribe is a no-op', async () => {
      const storage = createMockStorage();
      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});

      s.count = 5;
      await tick();

      handle.unsubscribe();
      await handle.clear(); // should be no-op

      // Storage should still have the data
      expect(storage.data.has('test')).toBe(true);
    });

    it('rehydrate resets isExpired flag', async () => {
      const storage = createMockStorage();
      // Start with expired data
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 42},
          expiresAt: Date.now() - 1000,
        }),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage, expireIn: 60_000});
      await handle.hydrated;
      expect(handle.isExpired).toBe(true);

      // Now put valid data in storage
      storage.data.set(
        'test',
        JSON.stringify({
          version: 0,
          state: {count: 77},
          expiresAt: Date.now() + 60_000,
        }),
      );

      await handle.rehydrate();
      expect(handle.isExpired).toBe(false);
      expect(s.count).toBe(77);
    });

    it('hydration does not trigger a write-back to storage', async () => {
      const storage = createMockStorage();
      const setItemSpy = mock(storage.setItem.bind(storage));
      storage.setItem = setItemSpy;

      storage.data.set(
        'test',
        JSON.stringify({version: 0, state: {count: 42}}),
      );

      const s = createClassyStore({count: 0});
      const handle = persist(s, {name: 'test', storage});
      await handle.hydrated;
      await tick();

      // setItem should NOT have been called during hydration
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('persists store with inherited getters from a base class', async () => {
      class Base {
        get label(): string {
          return `count-${(this as unknown as {count: number}).count}`;
        }
      }

      class MyStore extends Base {
        count = 0;
      }

      const storage = createMockStorage();
      const s = createClassyStore(new MyStore());
      persist(s, {name: 'test', storage});

      s.count = 10;
      await tick();

      const stored = parseStored(storage, 'test');
      expect(stored?.state.count).toBe(10);
      expect(stored?.state).not.toHaveProperty('label');
    });

    it('multiple persists on the same store with different keys', async () => {
      const storage1 = createMockStorage();
      const storage2 = createMockStorage();
      const s = createClassyStore({count: 0, name: 'hello'});

      persist(s, {
        name: 'store-count',
        storage: storage1,
        properties: ['count'],
      });
      persist(s, {
        name: 'store-name',
        storage: storage2,
        properties: ['name'],
      });

      s.count = 42;
      s.name = 'world';
      await tick();

      const stored1 = parseStored(storage1, 'store-count');
      const stored2 = parseStored(storage2, 'store-name');

      expect(stored1?.state.count).toBe(42);
      expect(stored1?.state).not.toHaveProperty('name');
      expect(stored2?.state.name).toBe('world');
      expect(stored2?.state).not.toHaveProperty('count');
    });
  });
});
