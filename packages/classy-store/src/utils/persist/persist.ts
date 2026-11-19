import {getVersion, snapshot, subscribe} from '../../storeRuntime';
import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
import {findGetterDescriptor} from '../internal/internal';
import {createUtilityStatus} from '../utilityStatus/utilityStatus';

import type {
  PersistHandle,
  PersistOperation,
  PersistOptions,
  PersistStatus,
  PropertyTransform,
} from './persist.types';

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
    if (findGetterDescriptor(proxyStore, key)?.get) continue;
    // Skip functions (methods).
    const value = (proxyStore as Record<string, unknown>)[key];
    if (typeof value === 'function') continue;
    result.push({key});
  }
  return result;
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
 * @returns A handle with lifecycle controls (dispose, save, clear, rehydrate, hydrated).
 */
export function persist<T extends object>(
  proxyStore: T,
  options: PersistOptions<T>,
): PersistHandle {
  const {
    name,
    storage,
    properties: propertiesOption,
    debounce: debounceMs = 0,
    version = 0,
    migrate,
    merge = 'shallow',
    skipHydration = false,
    syncTabs = false,
    expireIn,
    clearOnExpire = false,
    onError,
  } = options;

  /** Route a failure through `onError` (or swallow silently if not provided). */
  function reportError(error: unknown, operation: PersistOperation): void {
    if (disposed) return;
    lastError = Object.freeze({error, operation});
    status.update(readStatus());
    if (onError) {
      try {
        onError(error, operation);
      } catch {
        // User callback failed — nothing more we can do.
      }
    }
  }

  // ── Mutable state shared by handle closures ─────────────────────────────

  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let hydratedFlag = false;
  let expiredFlag = false;
  let hydrationRequest = 0;
  // Reads in flight, and whether a local edit asked to be saved meanwhile.
  let reading = 0;
  let saveAfterRead = false;
  let storageQueue: Promise<void> | undefined;
  let skipAutoSaveVersion: number | undefined;
  let clearedVersion: number | undefined;
  let lastError: PersistStatus['lastError'] = null;
  const readStatus = (): PersistStatus => ({
    isHydrated: hydratedFlag,
    isExpired: expiredFlag,
    isDisposed: disposed,
    lastError,
  });
  const status = createUtilityStatus<PersistStatus>(readStatus());

  function fail(error: unknown, operation: PersistOperation): never {
    reportError(error, operation);
    throw error;
  }

  function assertActive() {
    if (disposed) throw new Error('Persistence handle has been disposed');
  }

  function succeeded() {
    if (disposed) return;
    lastError = null;
    status.update(readStatus());
  }

  // Hydration promise + resolver.
  let resolveHydrated!: () => void;
  const hydratedPromise = new Promise<void>((resolve) => {
    resolveHydrated = resolve;
  });

  const resolvedProps = resolveProperties(proxyStore, propertiesOption);
  // Build a map of key → transform for fast lookup during save/restore.
  const transformMap = new Map<string, PropertyTransform<T>>();
  for (const prop of resolvedProps) {
    if (prop.transform) {
      transformMap.set(prop.key, prop.transform);
    }
  }
  const propKeys = resolvedProps.map((p) => p.key);

  /** Keep this handle's writes/removals in order, even with an async adapter. */
  function enqueueStorageMutation(
    operation: () => void | Promise<void>,
    kind: 'write' | 'remove',
  ): Promise<void> {
    const execute = async () => {
      assertActive();
      try {
        await operation();
        succeeded();
      } catch (error) {
        fail(error, kind);
      }
    };
    // Start the first operation immediately for synchronous storage adapters.
    const pending = storageQueue ? storageQueue.then(execute) : execute();
    // A failed operation rejects its caller without blocking later queued work.
    const completion = pending
      .catch(() => {})
      .finally(() => {
        if (storageQueue === completion) storageQueue = undefined;
      });
    storageQueue = completion;
    return pending;
  }

  // ── Save logic ─────────────────────────────────────────────────────────

  /** Serialize the current store state into a JSON string (versioned envelope). */
  function serializeState(): string {
    const snap = snapshot(proxyStore) as Record<string, unknown>;
    const state: Record<string, unknown> = Object.create(null);

    for (const key of propKeys) {
      let value = snap[key];
      const transform = transformMap.get(key);
      if (transform) {
        // The transform and value are paired by the same resolved property key.
        value = transform.serialize(value as never);
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
    assertActive();
    hydrationRequest++;
    let json: string;
    try {
      // Capture now; a queued save must represent the state requested by its caller.
      json = serializeState();
    } catch (error) {
      fail(error, 'write');
    }
    await enqueueStorageMutation(() => storage.setItem(name, json), 'write');
  }

  /** Save in the background, unless a read has yet to deliver stored data. */
  function autoSave(): void {
    // Writing now would replace the stored record with defaults before the
    // read can restore it. Save the merged state once the read settles.
    if (reading) {
      saveAfterRead = true;
      return;
    }
    // Background writes already report failures through status and onError.
    void writeToStorage().catch(() => {});
  }

  /** Write after the configured debounce (or immediately if it is 0). */
  function queueAutoSave(): void {
    if (debounceMs <= 0) {
      autoSave();
      return;
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      autoSave();
    }, debounceMs);
  }

  /** Schedule a save for a store notification. */
  function scheduleWrite(): void {
    if (disposed) return;
    // A preceding subscriber can edit during a batch, scheduling a second
    // notification for a revision this handle has already queued for saving.
    const current = getVersion(proxyStore);
    if (current === skipAutoSaveVersion || current === clearedVersion) return;
    skipAutoSaveVersion = current;
    queueAutoSave();
  }

  // ── Restore logic ──────────────────────────────────────────────────────

  /**
   * Parse a raw JSON string from storage, apply migration and transforms,
   * and merge the result into the store proxy. Returns whether data expired.
   *
   * `baseline` is the state the stored data is restored over. A field that no
   * longer matches it was edited locally in the meantime and keeps that edit.
   */
  function applyPersistedState(
    raw: string,
    baseline = snapshot(proxyStore) as Record<string, unknown>,
  ): boolean {
    const envelope = JSON.parse(raw) as PersistEnvelope;

    if (
      !envelope ||
      typeof envelope !== 'object' ||
      envelope.state === null ||
      typeof envelope.state !== 'object'
    ) {
      return false;
    }

    // Expiry check — skip hydration if data has expired.
    if (
      typeof envelope.expiresAt === 'number' &&
      Date.now() >= envelope.expiresAt
    ) {
      expiredFlag = true;
      return true;
    }

    let {state} = envelope;

    // Data stored under another schema version is usable only through
    // `migrate`. Without one, the store keeps its current state. A record
    // with no version counts as the default, version 0.
    const storedVersion =
      typeof envelope.version === 'number' ? envelope.version : 0;
    if (storedVersion !== version) {
      if (!migrate) return false;
      state = migrate(state, storedVersion);
    }

    const startVersion = getVersion(proxyStore);
    const current = snapshot(proxyStore) as Record<string, unknown>;

    // Per-property deserialize transforms.
    for (const key of Object.keys(state)) {
      const transform = transformMap.get(key);
      if (transform) {
        state[key] = transform.deserialize(state[key]);
      }
    }

    // A shallow restore writes only stored fields. Omitted defaults keep their
    // live identity, including edits made while other fields are restored.
    const merged =
      typeof merge === 'function'
        ? merge(
            state,
            Object.fromEntries(propKeys.map((key) => [key, current[key]])),
          )
        : state;
    const pending = new Set(
      propKeys.filter((key) => Object.hasOwn(merged, key)),
    );
    const clones = new WeakMap<object, object>();
    let expectedVersion = startVersion;

    // A subscriber can edit or delete a different field before its turn.
    // Snapshot identity catches nested edits as well as top-level replacements.
    function discardEditedFields() {
      const live = snapshot(proxyStore) as Record<string, unknown>;
      for (const key of pending) {
        if (
          Object.hasOwn(live, key) !== Object.hasOwn(baseline, key) ||
          !Object.is(live[key], baseline[key])
        )
          pending.delete(key);
      }
    }

    try {
      // The cached snapshot keeps its identity until something changes, so
      // this also covers edits made by `migrate`, a transform or `merge`.
      if (snapshot(proxyStore) !== baseline) discardEditedFields();
      for (const key of pending) {
        pending.delete(key);
        const before = getVersion(proxyStore);
        (proxyStore as Record<string, unknown>)[key] = cloneSnapshotValue(
          merged[key],
          clones,
        );
        const after = getVersion(proxyStore);
        if (after === before) continue;
        expectedVersion++;
        // Applying another stored field after clear() is still part of this
        // restore. A later subscriber/user edit has its own revision.
        if (clearedVersion === before && after === before + 1)
          clearedVersion = after;
        // A direct data-field assignment adds one revision. Any additional
        // revision came from user code and must survive the rest of this pass.
        if (after > before + 1 && pending.size) discardEditedFields();
      }
    } finally {
      skipAutoSaveVersion = expectedVersion;
    }
    return false;
  }

  /** Read from storage and apply to the store. */
  async function hydrateFromStorage(): Promise<void> {
    const request = ++hydrationRequest;
    // Stored fields are restored over this state. A field edited after this
    // point keeps its newer local value; every other field is still restored.
    const baseline = snapshot(proxyStore) as Record<string, unknown>;
    const isCurrent = () => !disposed && request === hydrationRequest;
    reading++;
    try {
      let raw: string | null;
      try {
        // A read requested after save()/clear() observes those operations' results.
        if (storageQueue) await storageQueue;
        if (!isCurrent()) return;
        raw = await storage.getItem(name);
      } catch (error) {
        if (isCurrent()) fail(error, 'read');
        return;
      }
      // Cleanup or a newer request can supersede an in-flight read. Obsolete
      // data must not replace current state or clear newer stored data.
      if (!isCurrent()) return;
      if (raw !== null) {
        // A debounced local write may be pending from a mutation issued
        // before the data arrived. Fold it into the save that follows the read.
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
          saveAfterRead = true;
        }
        let expired: boolean;
        try {
          expired = applyPersistedState(raw, baseline);
        } catch (error) {
          fail(error, 'parse');
        }
        if (expired && clearOnExpire) {
          const removal = enqueueStorageMutation(
            () => storage.removeItem(name),
            'remove',
          );
          status.update(readStatus());
          await removal;
        } else {
          succeeded();
        }
      } else {
        succeeded();
      }
    } finally {
      reading--;
      // Local edits made during the read are saved together with what it restored.
      if (!reading && saveAfterRead) {
        saveAfterRead = false;
        if (!disposed) queueAutoSave();
      }
    }
  }

  // ── Cross-tab sync ─────────────────────────────────────────────────────

  /** Handler for `window.storage` events. */
  function onStorageEvent(event: StorageEvent): void {
    if (disposed) return;
    if (event.key !== name) return;
    if (event.newValue === null) return; // cleared
    // Delivery is asynchronous: another tab or a local save may have already
    // replaced this event's value. Do not roll the UI back to an obsolete value.
    if (event.storageArea && event.storageArea.getItem(name) !== event.newValue)
      return;
    hydrationRequest++;
    // A pending local debounced write would otherwise overwrite the remote
    // state once its timer fires.
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    // Suppress writes triggered by mutations from this apply, otherwise
    // tabs ping-pong storage events forever.
    try {
      if (applyPersistedState(event.newValue) && clearOnExpire) {
        void enqueueStorageMutation(
          () => storage.removeItem(name),
          'remove',
        ).catch(() => {});
        status.update(readStatus());
      } else {
        succeeded();
      }
    } catch (error) {
      reportError(error, 'parse');
    }
  }

  // ── Initialize ─────────────────────────────────────────────────────────

  if (syncTabs) {
    globalThis.addEventListener('storage', onStorageEvent);
  }

  // Subscribe to store mutations.
  const unsubscribeFromStore = subscribe(proxyStore, scheduleWrite);

  // Kick off initial hydration (unless skipped).
  if (!skipHydration) {
    void hydrateFromStorage()
      .catch(() => {})
      .finally(() => {
        hydratedFlag = true;
        status.update(readStatus());
        resolveHydrated();
      });
  }

  // ── Build handle ───────────────────────────────────────────────────────

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unsubscribeFromStore();
    if (syncTabs) globalThis.removeEventListener('storage', onStorageEvent);
    status.dispose(readStatus());
  }

  const handle: PersistHandle = {
    ...status.source,
    get isHydrated() {
      return hydratedFlag;
    },

    get isExpired() {
      return expiredFlag;
    },

    hydrated: hydratedPromise,

    dispose,

    async save() {
      assertActive();
      // Cancel pending debounce and write immediately.
      saveAfterRead = false;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await writeToStorage();
    },

    async clear() {
      assertActive();
      hydrationRequest++;
      saveAfterRead = false;
      clearedVersion = getVersion(proxyStore);
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await enqueueStorageMutation(() => storage.removeItem(name), 'remove');
    },

    async rehydrate() {
      assertActive();
      expiredFlag = false;
      status.update(readStatus());
      try {
        await hydrateFromStorage();
      } finally {
        if (!hydratedFlag) {
          hydratedFlag = true;
          resolveHydrated();
        }
        status.update(readStatus());
      }
    },
  };

  return handle;
}
