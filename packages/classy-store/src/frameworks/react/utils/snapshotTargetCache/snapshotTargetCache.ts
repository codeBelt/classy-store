const readonlyTarget: ProxyHandler<object> = {
  set: () => false,
  deleteProperty: () => false,
  defineProperty: () => false,
  setPrototypeOf: () => false,
  preventExtensions: () => false,
};

/**
 * Share proxy-compare's descriptor scans and backing copies of frozen snapshots.
 * Tracking proxies and read sets remain private to each hook. Weak keys let
 * unreachable snapshots and their backing copies be collected together.
 */
export class SnapshotTargetCache extends WeakMap<object, unknown> {
  override set(key: object, value: unknown): this {
    // proxy-compare 3's target-cache entries are [original, optional copy].
    // Getter results can be mutable: never cache their descriptor decisions.
    const entry = value as [object, object?];
    if (!Object.isFrozen(entry[0])) return this;

    if (entry[1]) {
      // Copies need configurable descriptors so nested tracking proxies obey
      // Proxy invariants. Upstream blocks assignment/deletion, but reflection
      // could otherwise corrupt this shared copy. Guard the copy, not the
      // per-consumer proxy. Update the tuple in place: createProxy's first call
      // continues using this same tuple immediately after cache.set().
      entry[1] = new Proxy(entry[1], readonlyTarget);
    }
    return super.set(key, entry);
  }
}
