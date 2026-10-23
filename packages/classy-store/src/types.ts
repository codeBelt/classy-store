/**
 * Primitive types that should not be proxied or snapshot-cloned.
 * Used by `Snapshot<T>` to identify leaf types that pass through unchanged.
 */
type Primitive = string | number | boolean | null | undefined | symbol | bigint;

/**
 * Function type shorthand.
 * Functions are treated as snapshot leaves -- they pass through unchanged
 * because freezing or cloning them would break callable references.
 */
// This classifies functions without invoking them. `unknown[]` would reject
// typed parameters under strictFunctionTypes and map their signatures to {}.
type AnyFunction = (...args: never[]) => unknown;

/**
 * Types that `snapshot()` returns as-is (no deep clone or freeze).
 * These are either already immutable-ish (Date, RegExp), use internal slots
 * that proxies can't intercept (Map, Set, WeakMap, WeakSet), or can't be
 * meaningfully frozen (functions, Promises, Errors).
 */
type SnapshotLeaf =
  | Primitive
  | AnyFunction
  | Date
  | RegExp
  | Error
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | Promise<unknown>;

/**
 * Recursively converts an object type to a deeply readonly version.
 * Leaf types (primitives, Date, Map, etc.) pass through unchanged.
 */
export type Snapshot<T> = T extends SnapshotLeaf
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<Snapshot<U>>
    : T extends object
      ? {readonly [K in keyof T]: Snapshot<T[K]>}
      : T;

/** Options that control how store subscribers are notified. */
export type SubscribeOptions = {
  /** Notify this subscriber immediately instead of waiting for the batched microtask. */
  sync?: boolean;
};
