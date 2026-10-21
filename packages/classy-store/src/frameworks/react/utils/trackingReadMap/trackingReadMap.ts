/**
 * A render-local copy of reads associated with immutable snapshot objects.
 *
 * Memoized consumers may reuse a value without reading its properties again.
 * Keep those dependencies while the same snapshot object is reused, including
 * structurally shared children. Only committed renders publish their reads.
 */
export class TrackingReadMap extends WeakMap<object, unknown> {
  private pending: WeakRef<object>[] = [];

  constructor(private readonly committed: WeakMap<object, unknown>) {
    super();
  }

  override get(target: object): unknown {
    if (!super.has(target)) {
      const previous = this.committed.get(target) as
        | Record<PropertyKey, unknown>
        | undefined;
      if (previous) {
        // proxy-compare 3 stores operation sets in a record. Copy every field
        // generically rather than depending on its private operation names.
        // Sharing the sets would let a suspended render change committed reads.
        const copy = {...previous};
        for (const key of Reflect.ownKeys(copy)) {
          const value = copy[key];
          if (value instanceof Set) copy[key] = new Set(value);
        }
        this.set(target, copy);
      }
    }
    return super.get(target);
  }

  override set(target: object, reads: unknown): this {
    if (!super.has(target)) this.pending.push(new WeakRef(target));
    return super.set(target, reads);
  }

  commit(): void {
    // A shared child proxy can keep this render's map reachable after newer
    // snapshots replace its root. Neither the read map nor the commit queue may
    // strongly retain those roots, including when this render is abandoned.
    for (const reference of this.pending) {
      const target = reference.deref();
      if (target && super.has(target)) {
        this.committed.set(target, super.get(target));
      }
    }
    this.pending = [];
  }
}
