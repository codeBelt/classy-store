import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';
import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
import {findGetterDescriptor} from '../internal/internal';
import {
  createUtilityStatus,
  type UtilityStatusSource,
} from '../utilityStatus/utilityStatus';

// ── Types ────────────────────────────────────────────────────────────────────

export type HistoryOptions = {
  /** Maximum number of history entries. Default: 100. */
  limit?: number;
};

export type HistoryStatus = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isPaused: boolean;
  readonly isDisposed: boolean;
};

export type HistoryHandle = UtilityStatusSource<HistoryStatus> & {
  /** Restore the previous state. */
  undo: () => void;
  /** Restore the next state (after an undo). */
  redo: () => void;
  /** Whether there is a previous state to undo to. */
  readonly canUndo: boolean;
  /** Whether there is a next state to redo to. */
  readonly canRedo: boolean;
  /** Temporarily stop recording history entries. */
  pause: () => void;
  /** Resume recording history entries after a pause. */
  resume: () => void;
  /** Unsubscribe and clean up. */
  dispose: () => void;
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Add undo/redo capability to a store proxy via a snapshot stack.
 *
 * Captures a snapshot on each mutation and maintains a history array with a
 * pointer. `undo()` and `redo()` apply previous/next snapshots back to the
 * store proxy, skipping getters and methods.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 * @param options - Optional configuration (e.g., history limit).
 * @returns A `HistoryHandle` with undo/redo controls and a dispose function.
 */
export function withHistory<T extends object>(
  proxyStore: T,
  options?: HistoryOptions,
): HistoryHandle {
  const limit = options?.limit ?? 100;

  // Snapshot stack and pointer
  const history: Snapshot<T>[] = [snapshot(proxyStore)];
  let pointer = 0;
  let paused = false;
  let restoring = 0;
  let disposed = false;
  const status = createUtilityStatus<HistoryStatus>({
    canUndo: false,
    canRedo: false,
    isPaused: false,
    isDisposed: false,
  });
  const readStatus = (): HistoryStatus => ({
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    isPaused: paused,
    isDisposed: disposed,
  });

  /**
   * Apply a snapshot's data properties back to the store proxy.
   * Skips getters and methods — same pattern as `persist`.
   */
  function applySnapshot(snap: Snapshot<T>): void {
    const snapRecord = snap as Record<string, unknown>;
    const clones = new WeakMap<object, object>();

    for (const key of Object.keys(snapRecord)) {
      // Skip getters
      if (findGetterDescriptor(proxyStore, key)?.get) continue;
      // Skip methods
      if (typeof (proxyStore as Record<string, unknown>)[key] === 'function') {
        continue;
      }
      (proxyStore as Record<string, unknown>)[key] = cloneSnapshotValue(
        snapRecord[key],
        clones,
      );
    }
  }

  // Subscribe to store mutations
  const unsubscribeFromStore = subscribe(proxyStore, () => {
    if (paused || restoring > 0 || disposed) return;

    const snap = snapshot(proxyStore);

    // Truncate any redo entries after the current pointer
    if (pointer < history.length - 1) {
      history.length = pointer + 1;
    }

    // Push new snapshot
    history.push(snap);
    pointer = history.length - 1;

    // Enforce limit by shifting from front
    if (history.length > limit) {
      history.shift();
      pointer = history.length - 1;
    }
    status.update(readStatus());
  });

  const handle: HistoryHandle = {
    ...status.source,
    undo() {
      if (disposed || pointer <= 0) return;
      pointer--;
      restoring++;
      try {
        applySnapshot(history[pointer]);
      } finally {
        queueMicrotask(() => {
          restoring--;
        });
        status.update(readStatus());
      }
    },

    redo() {
      if (disposed || pointer >= history.length - 1) return;
      pointer++;
      restoring++;
      try {
        applySnapshot(history[pointer]);
      } finally {
        queueMicrotask(() => {
          restoring--;
        });
        status.update(readStatus());
      }
    },

    get canUndo() {
      return pointer > 0;
    },

    get canRedo() {
      return pointer < history.length - 1;
    },

    pause() {
      if (disposed) return;
      paused = true;
      status.update(readStatus());
    },

    resume() {
      if (disposed) return;
      paused = false;
      status.update(readStatus());
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeFromStore();
      history.length = 0;
      pointer = 0;
      status.dispose(readStatus());
    },
  };

  return handle;
}
