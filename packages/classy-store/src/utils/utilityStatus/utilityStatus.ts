/** Internal external-store contract for a utility handle's readonly status. */
export type UtilityStatusSource<T> = {
  /** Read a cached snapshot. Its identity changes only when status changes. */
  getSnapshot: () => T;
  /** Read the initial status for server rendering and client hydration. */
  getServerSnapshot: () => T;
  /** Subscribe to status changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
};

/** Internal status publisher shared by utility handles. */
export function createUtilityStatus<T extends object>(initial: T) {
  const initialSnapshot = Object.freeze(initial);
  let current = initialSnapshot;
  let disposed = false;
  const listeners = new Set<() => void>();
  const source: UtilityStatusSource<Readonly<T>> = {
    getSnapshot: () => current,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  function update(next: T) {
    if (
      (Object.keys(next) as Array<keyof T>).every((key) =>
        Object.is(current[key], next[key]),
      )
    ) {
      return;
    }
    current = Object.freeze(next);
    if (disposed) return;
    for (const listener of Array.from(listeners)) {
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        // A UI listener must not interrupt persistence or history bookkeeping.
        console.error(error);
      }
    }
  }

  return {
    source,
    update,
    dispose(final: T) {
      update(final);
      disposed = true;
      listeners.clear();
    },
  };
}
