import {mapOwnArrayElements} from '../../../../utils/internal/internal';

// proxy-compare's tracking proxy refuses a write and a delete before they
// reach a shared copy, so only the traps it lets through are guarded.
const readonlyTarget: ProxyHandler<object> = {
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
  override get(key: object): unknown {
    const cached = super.get(key);
    if (cached || !Array.isArray(key) || !Object.isFrozen(key)) return cached;

    // proxy-compare uses Array.from for its backing copy, which fills holes.
    // Supply the sparse copy before it creates a reader's tracking proxy.
    const copy = mapOwnArrayElements(key, (value) => value);
    const entry = [key, new Proxy(copy, readonlyTarget)];
    super.set(key, entry);
    return entry;
  }

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
