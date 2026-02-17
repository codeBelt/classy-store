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
type AnyFunction = (...args: unknown[]) => unknown;

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

// ── Computed getter memoization types ─────────────────────────────────────────

/**
 * A single dependency recorded during getter execution.
 * - `version`: dependency is a tracked sub-tree — compare `internal.version`.
 * - `value`: dependency is a primitive — compare via `Object.is`.
 */
export type DepEntry =
  | {
      kind: 'version';
      internal: StoreInternal;
      version: number;
      /** Parent target — used to detect when the property is replaced entirely. */
      parentTarget: object;
      /** Property name on the parent. */
      prop: string | symbol;
    }
  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
  | {
      /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
      kind: 'computed';
      internal: StoreInternal;
      prop: string | symbol;
      value: unknown;
    };

/** Cached result of a memoized computed getter, together with its dependencies. */
export type ComputedEntry = {
  value: unknown;
  deps: DepEntry[];
};

// ── Store internal bookkeeping ───────────────────────────────────────────────

/** Internal bookkeeping for a store proxy, stored in a WeakMap keyed by the proxy. */
export type StoreInternal = {
  /** The raw (un-proxied) class instance. */
  target: object;
  /** Monotonically increasing version counter. */
  version: number;
  /** Set of subscriber callbacks notified on mutation. */
  listeners: Set<() => void>;
  /** Cached child proxies for nested plain objects/arrays (keyed by property name). */
  childProxies: Map<string | symbol, object>;
  /** Cached child internals for propagating version bumps up the tree. */
  childInternals: Map<string | symbol, StoreInternal>;
  /** Reference to the parent internal (if this is a child proxy). */
  parent: StoreInternal | null;
  /** Whether a microtask notification is already scheduled. */
  notifyScheduled: boolean;
  /** Memoized computed getter cache, keyed by getter property name. */
  computedCache: Map<string | symbol, ComputedEntry>;
};
