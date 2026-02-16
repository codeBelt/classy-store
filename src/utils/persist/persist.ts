import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {findGetterDescriptor} from '../internal/internal';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Storage adapter interface. Compatible with `localStorage`, `sessionStorage`,
 * `AsyncStorage`, `localForage`, or any custom implementation.
 *
 * Methods may return synchronously or asynchronously — `persist` handles both.
 */
export type StorageAdapter = {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
};

/**
 * Describes a per-property serialization transform.
 *
 * Use this when a property's value is not JSON-serializable (Date, ReactiveMap, etc.)
 * and needs custom conversion to/from a storable format.
 */
export type PropertyTransform<T extends object> = {
  /** The property key on the store class. */
  key: keyof T;

  /** Transform the value BEFORE saving to storage (after snapshot, before JSON.stringify). */
  serialize: (value: T[keyof T]) => unknown;

  /** Transform the value AFTER loading from storage (after JSON.parse, before applying to store). */
  deserialize: (stored: unknown) => T[keyof T];
};

/**
 * Options for `persist()`.
 */
export type PersistOptions<T extends object> = {
  /** Unique storage key. Required. */
  name: string;

  /**
   * Storage adapter. Defaults to `globalThis.localStorage`.
   * Any object with getItem/setItem/removeItem (sync or async).
   * Works with: localStorage, sessionStorage, AsyncStorage, localForage, etc.
   */
  storage?: StorageAdapter;

  /**
   * Which properties to persist.
   * Each entry is either a plain key (string) or a transform descriptor.
   * Defaults to all own enumerable data properties.
   *
   * **Getters and methods are always excluded.** Class getters (e.g., `get remaining()`)
   * are computed/derived values — they are not source-of-truth state. They recompute
   * automatically from the persisted data properties when accessed. Persisting a getter
   * result would be redundant and could produce stale values on restore.
   */
  properties?: Array<keyof T | PropertyTransform<T>>;

  /**
   * Debounce writes to storage (milliseconds).
   * Multiple rapid mutations coalesce into one write.
   * Default: 0 (write after every batched mutation).
   */
  debounce?: number;

  /**
   * Schema version number. Stored alongside the data.
   * When the stored version differs from this value, `migrate` is called.
   * Default: 0.
   */
  version?: number;

  /**
   * Migration function. Called when the stored version does not match `version`.
   * Receives the raw parsed state and the old version number.
   * Must return the state in the current shape.
   */
  migrate?: (
    persistedState: Record<string, unknown>,
    oldVersion: number,
  ) => Record<string, unknown>;

  /**
   * How to merge persisted state with current store state during hydration.
   *
   * - `'shallow'` (default): persisted values overwrite current values one key at a time.
   *   Properties not in storage keep their current value.
   * - `'replace'`: same behavior as `'shallow'` for flat stores — only stored keys are assigned.
   *   For nested objects, the entire object is replaced rather than merged.
   * - Custom function: receives `(persistedState, currentState)` and returns merged state.
   *   Enables deep merge or any custom logic.
   *
   * This matters when the store adds new properties that don't exist in old
   * persisted data. `'shallow'` preserves the new defaults.
   */
  merge?:
    | 'shallow'
    | 'replace'
    | ((
        persisted: Record<string, unknown>,
        current: Record<string, unknown>,
      ) => Record<string, unknown>);

  /**
   * If true, do NOT hydrate automatically on init.
   * You must call `handle.rehydrate()` manually (e.g., in a `useEffect` for SSR).
   * Default: false.
   */
  skipHydration?: boolean;

  /**
   * Sync state across browser tabs via the `window.storage` event.
   * When another tab writes to the same storage key, this tab automatically
   * re-hydrates from the new value.
   *
   * Only works with `localStorage` (storage events don't fire for sessionStorage
   * or async adapters).
   *
   * Default: `true` when storage is `localStorage`, `false` otherwise.
   */
  syncTabs?: boolean;

  /**
   * Time-to-live in milliseconds. After this duration, stored data is
   * considered expired and skipped during hydration. The TTL resets on
   * every write (active sessions stay fresh as long as mutations happen).
   */
  expireIn?: number;

  /**
   * When `true`, automatically remove the storage key if data is found
   * expired during hydration. Default: `false` (expired data is skipped
   * but left in storage).
   */
  clearOnExpire?: boolean;
};

/**
 * Handle returned by `persist()`. Provides control over the persist lifecycle.
 */
export type PersistHandle = {
  /** Stop persisting and clean up (unsubscribe + cancel pending debounce + remove storage event listener). */
  unsubscribe: () => void;

  /** Promise that resolves when initial hydration from storage is complete. */
  hydrated: Promise<void>;

  /** Whether hydration from storage has completed. */
  isHydrated: boolean;

  /** Manually trigger a write to storage (bypasses debounce). */
  save: () => Promise<void>;

  /** Clear this store's persisted data from storage. */
  clear: () => Promise<void>;

  /** Manually re-hydrate the store from storage. */
  rehydrate: () => Promise<void>;

  /** True if the last hydration found expired data (requires `expireIn`). */
  isExpired: boolean;
};

// ── Storage envelope ─────────────────────────────────────────────────────────

/** Internal shape of the JSON stored in storage. */
type PersistEnvelope = {
  version: number;
  state: Record<string, unknown>;
  expiresAt?: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Check if a value is a PropertyTransform descriptor (has `key` + `serialize`). */
function isTransform<T extends object>(
  entry: keyof T | PropertyTransform<T>,
): entry is PropertyTransform<T> {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'key' in entry &&
    'serialize' in entry
  );
}

/**
 * Build the normalized list of property keys and their optional transforms.
 * If `properties` is not provided, defaults to all own enumerable data properties
 * of the store (excluding getters and methods).
 */
function resolveProperties<T extends object>(
  proxyStore: T,
  properties?: Array<keyof T | PropertyTransform<T>>,
): Array<{key: string; transform?: PropertyTransform<T>}> {
  if (properties) {
    return properties.map((entry) => {
      if (isTransform(entry)) {
        return {key: entry.key as string, transform: entry};
      }
      return {key: entry as string};
    });
  }

  // Default: all own enumerable keys that are not getters or methods.
  const snap = snapshot(proxyStore) as Record<string, unknown>;
  const result: Array<{key: string}> = [];
  for (const key of Object.keys(snap)) {
    // Skip getters (they live on the prototype, but snapshot installs them).
    // We check the original store's target for getter descriptors.
    if (findGetterDescriptor(Object.getPrototypeOf(proxyStore), key)?.get)
      continue;
    // Skip functions (methods).
    const value = (proxyStore as Record<string, unknown>)[key];
    if (typeof value === 'function') continue;
    result.push({key});
  }
  return result;
}

/**
 * Detect if the given storage adapter is `globalThis.localStorage`.
 */
function isLocalStorage(storage: StorageAdapter): boolean {
  try {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.localStorage !== 'undefined' &&
      storage === (globalThis.localStorage as unknown as StorageAdapter)
    );
  } catch {
    return false;
  }
}

/**
 * Get the default storage adapter (`localStorage`), or `undefined` if unavailable.
 */
function getDefaultStorage(): StorageAdapter | undefined {
  try {
    if (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.localStorage !== 'undefined'
    ) {
      return globalThis.localStorage as unknown as StorageAdapter;
    }
  } catch {
    // SSR or restricted environment — no localStorage.
  }
  return undefined;
}

// ── Main implementation ──────────────────────────────────────────────────────

/**
 * Persist store state to a storage adapter.
 *
 * Subscribes to store mutations and writes the selected properties to storage
 * (with optional per-property transforms, debouncing, and versioned envelopes).
 * On init (or manual rehydrate), reads from storage and applies the state back
 * to the store proxy.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 * @param options - Persistence configuration.
 * @returns A handle with lifecycle controls (unsubscribe, save, clear, rehydrate, hydrated).
 */
export function persist<T extends object>(
  proxyStore: T,
  options: PersistOptions<T>,
): PersistHandle {
  const {
    name,
    properties: propertiesOption,
    debounce: debounceMs = 0,
    version = 0,
    migrate,
    merge = 'shallow',
    skipHydration = false,
    syncTabs: syncTabsOption,
    expireIn,
    clearOnExpire = false,
  } = options;

  const maybeStorage = options.storage ?? getDefaultStorage();
  if (!maybeStorage) {
    throw new Error(
      '@codebelt/classy-store: persist() requires a storage adapter. ' +
        'No localStorage found — provide a `storage` option.',
    );
  }
  const storage: StorageAdapter = maybeStorage;

  const resolvedProps = resolveProperties(proxyStore, propertiesOption);

  // Build a map of key → transform for fast lookup during save/restore.
  const transformMap = new Map<string, PropertyTransform<T>>();
  for (const prop of resolvedProps) {
    if (prop.transform) {
      transformMap.set(prop.key, prop.transform);
    }
  }

  const propKeys = resolvedProps.map((p) => p.key);

  // ── State ────────────────────────────────────────────────────────────────

  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let hydratedFlag = false;
  let expiredFlag = false;

  // Hydration promise + resolver.
  let resolveHydrated: () => void;
  let rejectHydrated: (error: unknown) => void;
  const hydratedPromise = new Promise<void>((resolve, reject) => {
    resolveHydrated = resolve;
    rejectHydrated = reject;
  });

  // ── Save logic ───────────────────────────────────────────────────────────

  /** Serialize the current store state into a JSON string (versioned envelope). */
  function serializeState(): string {
    const snap = snapshot(proxyStore) as Record<string, unknown>;
    const state: Record<string, unknown> = {};

    for (const key of propKeys) {
      let value = snap[key];
      const transform = transformMap.get(key);
      if (transform) {
        value = transform.serialize(value as T[keyof T]);
      }
      state[key] = value;
    }

    const envelope: PersistEnvelope = {version, state};
    if (expireIn != null) {
      envelope.expiresAt = Date.now() + expireIn;
    }
    return JSON.stringify(envelope);
  }

  /** Write the current state to storage. */
  async function writeToStorage(): Promise<void> {
    if (disposed) return;
    const json = serializeState();
    await storage.setItem(name, json);
  }

  /** Schedule a debounced write (or write immediately if debounce is 0). */
  function scheduleWrite(): void {
    if (disposed) return;

    if (debounceMs <= 0) {
      void writeToStorage();
      return;
    }

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void writeToStorage();
    }, debounceMs);
  }

  // ── Restore logic ────────────────────────────────────────────────────────

  /**
   * Parse a raw JSON string from storage, apply migration and transforms,
   * and merge the result into the store proxy.
   */
  function applyPersistedState(raw: string): void {
    let envelope: PersistEnvelope;
    try {
      envelope = JSON.parse(raw) as PersistEnvelope;
    } catch {
      // Corrupted data — skip.
      return;
    }

    if (
      !envelope ||
      typeof envelope !== 'object' ||
      typeof envelope.state !== 'object'
    ) {
      return;
    }

    // Expiry check — skip hydration if data has expired.
    if (
      typeof envelope.expiresAt === 'number' &&
      Date.now() >= envelope.expiresAt
    ) {
      expiredFlag = true;
      if (clearOnExpire) void storage.removeItem(name);
      return;
    }

    let {state} = envelope;

    // Version migration.
    if (migrate && envelope.version !== version) {
      state = migrate(state, envelope.version);
    }

    // Per-property deserialize transforms.
    for (const key of Object.keys(state)) {
      const transform = transformMap.get(key);
      if (transform) {
        state[key] = transform.deserialize(state[key]);
      }
    }

    // Build current state for merge.
    const currentSnap = snapshot(proxyStore) as Record<string, unknown>;
    const currentState: Record<string, unknown> = {};
    for (const key of propKeys) {
      currentState[key] = currentSnap[key];
    }

    // Merge strategy.
    let merged: Record<string, unknown>;
    if (typeof merge === 'function') {
      merged = merge(state, currentState);
    } else {
      // Both 'shallow' and 'replace' assign persisted keys onto the store.
      // The difference is conceptual for nested objects, but at this level
      // both just assign the persisted value per key.
      merged = {...currentState, ...state};
    }

    // Apply to store proxy (goes through SET traps → reactivity).
    for (const key of propKeys) {
      if (key in merged) {
        (proxyStore as Record<string, unknown>)[key] = merged[key];
      }
    }
  }

  /** Read from storage and apply to the store. */
  async function hydrateFromStorage(): Promise<void> {
    const raw = await storage.getItem(name);
    if (raw !== null) {
      applyPersistedState(raw);
    }
  }

  // ── Cross-tab sync ───────────────────────────────────────────────────────

  const shouldSyncTabs =
    syncTabsOption !== undefined ? syncTabsOption : isLocalStorage(storage);

  /** Handler for `window.storage` events. */
  function onStorageEvent(event: StorageEvent): void {
    if (disposed) return;
    if (event.key !== name) return;
    if (event.newValue === null) return; // cleared
    applyPersistedState(event.newValue);
  }

  if (
    shouldSyncTabs &&
    typeof globalThis !== 'undefined' &&
    typeof globalThis.addEventListener === 'function'
  ) {
    globalThis.addEventListener('storage', onStorageEvent);
  }

  // ── Subscribe to store mutations ─────────────────────────────────────────

  const unsubscribeFromStore = subscribe(proxyStore, scheduleWrite);

  // ── Kick off initial hydration ───────────────────────────────────────────

  if (!skipHydration) {
    void hydrateFromStorage()
      .then(() => {
        hydratedFlag = true;
        resolveHydrated();
      })
      .catch((error) => {
        hydratedFlag = true;
        rejectHydrated(error);
      });
  } else {
    // When hydration is skipped, the promise is left pending until
    // the user calls handle.rehydrate() manually.
  }

  // ── Build handle ─────────────────────────────────────────────────────────

  const handle: PersistHandle = {
    get isHydrated() {
      return hydratedFlag;
    },

    get isExpired() {
      return expiredFlag;
    },

    hydrated: hydratedPromise,

    unsubscribe() {
      if (disposed) return;
      disposed = true;

      // Cancel pending debounce.
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      // Unsubscribe from store mutations.
      unsubscribeFromStore();

      // Remove cross-tab sync listener.
      if (
        shouldSyncTabs &&
        typeof globalThis !== 'undefined' &&
        typeof globalThis.removeEventListener === 'function'
      ) {
        globalThis.removeEventListener('storage', onStorageEvent);
      }
    },

    async save() {
      if (disposed) return;
      // Cancel pending debounce and write immediately.
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await writeToStorage();
    },

    async clear() {
      await storage.removeItem(name);
    },

    async rehydrate() {
      await hydrateFromStorage();
      if (!hydratedFlag) {
        hydratedFlag = true;
        resolveHydrated();
      }
    },
  };

  return handle;
}
