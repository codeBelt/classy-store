import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';
import {findGetterDescriptor} from '../internal/internal';

// ── Types ────────────────────────────────────────────────────────────────────

export type HistoryOptions = {
  /** Maximum number of history entries. Default: 100. */
  limit?: number;
};

export type HistoryHandle = {
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

  /**
   * Apply a snapshot's data properties back to the store proxy.
   * Skips getters and methods — same pattern as `persist`.
   */
  function applySnapshot(snap: Snapshot<T>): void {
    const snapRecord = snap as Record<string, unknown>;

    for (const key of Object.keys(snapRecord)) {
      // Skip getters
      if (findGetterDescriptor(proxyStore, key)?.get) continue;
      // Skip methods
      if (typeof (proxyStore as Record<string, unknown>)[key] === 'function') {
        continue;
      }
      (proxyStore as Record<string, unknown>)[key] = snapRecord[key];
    }
  }

  // Subscribe to store mutations
  const unsubscribeFromStore = subscribe(proxyStore, () => {
    if (paused) return;

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
  });

  const handle: HistoryHandle = {
    undo() {
      if (pointer <= 0) return;
      pointer--;
      paused = true;
      try {
        applySnapshot(history[pointer]);
      } finally {
        queueMicrotask(() => {
          paused = false;
        });
      }
    },

    redo() {
      if (pointer >= history.length - 1) return;
      pointer++;
      paused = true;
      try {
        applySnapshot(history[pointer]);
      } finally {
        queueMicrotask(() => {
          paused = false;
        });
      }
    },

    get canUndo() {
      return pointer > 0;
    },

    get canRedo() {
      return pointer < history.length - 1;
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
    },

    dispose() {
      unsubscribeFromStore();
      history.length = 0;
      pointer = 0;
    },
  };

  return handle;
}
