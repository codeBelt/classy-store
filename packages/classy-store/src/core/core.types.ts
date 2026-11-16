import type {StoreInternal} from './ownership';

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
      parent: StoreInternal;
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
