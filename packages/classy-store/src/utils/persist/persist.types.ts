import type {Snapshot} from '../../types';
import type {UtilityStatusSource} from '../utilityStatus/utilityStatus';

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
export type PropertyTransform<T extends object, K extends keyof T = keyof T> = {
  [P in K]-?: {
    /** The property key determines both transform value types. */
    key: P;
    /** Serialize this property's readonly snapshot value. */
    serialize: (value: Snapshot<T[P]>) => unknown;
    /** Validate unknown stored data and restore this property's mutable value. */
    deserialize: (stored: unknown) => T[P];
  };
}[K];

/**
 * Options for `persist()`.
 */
export type PersistOptions<T extends object> = {
  /** Unique storage key. Required. */
  name: string;

  /**
   * Storage adapter. Required.
   * Any object with getItem/setItem/removeItem (sync or async).
   * Works with: localStorage, sessionStorage, AsyncStorage, localForage, etc.
   */
  storage: StorageAdapter;

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
   * - Custom function: receives `(persistedState, currentState)` and returns merged state.
   *   Enables deep merge or any custom logic.
   *
   * This matters when the store adds new properties that don't exist in old
   * persisted data. `'shallow'` preserves the new defaults.
   */
  merge?:
    | 'shallow'
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
   * Only meaningful for `localStorage` — `storage` events don't fire for
   * `sessionStorage` or async adapters.
   *
   * Default: `false`.
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

  /**
   * Called when a storage operation fails. Use this to surface quota
   * exhaustion, private-mode restrictions, network errors from async
   * adapters, or corrupted-data parse failures.
   *
   * Automatic operations report errors without rejecting. Explicit save,
   * clear, and rehydrate calls also reject their promise with the original error.
   */
  onError?: (error: unknown, operation: PersistOperation) => void;
};

/** Operation that can produce an `onError` callback invocation. */
export type PersistOperation = 'write' | 'read' | 'remove' | 'parse';

export type PersistStatus = {
  readonly isHydrated: boolean;
  readonly isExpired: boolean;
  readonly isDisposed: boolean;
  /** Latest failure; cleared by the next successful operation. */
  readonly lastError: Readonly<{
    error: unknown;
    operation: PersistOperation;
  }> | null;
};

/**
 * Handle returned by `persist()`. Provides control over the persist lifecycle.
 */
export type PersistHandle = UtilityStatusSource<PersistStatus> & {
  /**
   * Stop persisting, cancel pending debounce, and remove the storage listener.
   * Pending read results/errors are ignored; unstarted writes are cancelled.
   * Cancelled explicit writes/removals reject. Already-issued adapter I/O is not cancelled.
   * Safe to call repeatedly.
   */
  dispose: () => void;

  /** Resolves when the initial hydration attempt settles; inspect status for errors. */
  hydrated: Promise<void>;

  /** Whether a hydration attempt has settled, including failures or skipped results. */
  readonly isHydrated: boolean;

  /** Save current state after earlier writes, bypassing debounce. Rejects on failure or disposal. */
  save: () => Promise<void>;

  /** Cancel auto-saves and remove data after earlier writes. Rejects on failure or disposal. */
  clear: () => Promise<void>;

  /** Re-read after prior writes. Rejects on failure or disposal; ignores superseded reads. */
  rehydrate: () => Promise<void>;

  /** True if the last hydration found expired data (requires `expireIn`). */
  readonly isExpired: boolean;
};
