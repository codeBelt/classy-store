/**
 * A render-local copy of reads associated with immutable snapshot objects.
 *
 * Memoized consumers may reuse a value without reading its properties again.
 * Keep those dependencies while the same snapshot object is reused, including
 * structurally shared children. Only committed renders publish their reads.
 */
export class TrackingReadMap extends Map<object, unknown> {
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
        super.set(target, copy);
      }
    }
    return super.get(target);
  }

  commit(): void {
    for (const [target, reads] of this) {
      this.committed.set(target, reads);
    }
  }
}
