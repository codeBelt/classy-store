import {getVersion, snapshot, subscribe} from '../../storeRuntime';
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

  const live = proxyStore as Record<string, unknown>;
  // The store revision that the entry under the pointer describes.
  let recordedVersion = getVersion(proxyStore);

  /** Getters and methods are behavior, not state; restoring leaves them alone. */
  function isData(key: string): boolean {
    return (
      !findGetterDescriptor(proxyStore, key)?.get &&
      typeof live[key] !== 'function'
    );
  }

  /** Make the store's data fields match a recorded snapshot. */
  function applySnapshot(snap: Snapshot<T>): void {
    const recorded = snap as Record<string, unknown>;
    const current = snapshot(proxyStore) as Record<string, unknown>;
    const clones = new WeakMap<object, object>();

    // A field added after this snapshot was taken did not exist in it.
    for (const key of Object.keys(current)) {
      if (!Object.hasOwn(recorded, key) && isData(key)) delete live[key];
    }
    for (const key of Object.keys(recorded)) {
      if (!isData(key)) continue;
      // An untouched branch still has this exact snapshot. Leaving it alone
      // keeps its identity, so selectors reading it stay quiet.
      if (Object.hasOwn(current, key) && Object.is(current[key], recorded[key]))
        continue;
      live[key] = cloneSnapshotValue(recorded[key], clones);
    }
  }

  /** Append the store's current state as the newest history entry. */
  function record(): void {
    // Drop any redo entries after the current pointer.
    history.length = pointer + 1;

    history.push(snapshot(proxyStore));
    pointer = history.length - 1;

    // Enforce limit by shifting from front
    if (history.length > limit) {
      history.shift();
      pointer = history.length - 1;
    }
    recordedVersion = getVersion(proxyStore);
  }

  /** Move to another entry without recording the move itself. */
  function restore(target: number): void {
    pointer = target;
    restoring++;
    try {
      applySnapshot(history[pointer]);
    } finally {
      recordedVersion = getVersion(proxyStore);
      // The store's batched notification for this restore runs first.
      queueMicrotask(() => {
        restoring--;
      });
      status.update(readStatus());
    }
  }

  // Subscribe to store mutations
  const unsubscribeFromStore = subscribe(proxyStore, () => {
    if (paused || restoring > 0 || disposed) return;
    // undo() may already have recorded this revision ahead of the notification.
    if (getVersion(proxyStore) === recordedVersion) return;
    record();
    status.update(readStatus());
  });

  const handle: HistoryHandle = {
    ...status.source,
    undo() {
      if (disposed) return;
      // An edit made in this same tick has not been recorded yet. Record it
      // first, so that undo steps back over it and redo can return to it.
      if (!paused && getVersion(proxyStore) !== recordedVersion) record();
      if (pointer <= 0) return;
      restore(pointer - 1);
    },

    redo() {
      // dispose() empties the history, so a disposed handle has nothing to redo.
      if (pointer >= history.length - 1) return;
      restore(pointer + 1);
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
