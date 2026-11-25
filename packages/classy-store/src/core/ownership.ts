import type {ComputedEntry} from './core.types';

type ParentReference = {deref(): StoreInternal | undefined};

/** One canonical node per raw object. Each property owns one edge to a child. */
export class StoreInternal {
  version = 0;
  isStoreRoot = false;
  /** Set once the raw object has an own accessor, so an own key may be one. */
  ownAccessors?: true;
  // Each subscribe() call owns one entry, so the same callback can be
  // registered more than once and released independently.
  readonly batchedListeners = new Set<() => void>();
  readonly syncListeners = new Set<() => void>();
  readonly computedCache = new Map<string | symbol, ComputedEntry>();
  readonly childInternals = new Map<string | symbol, StoreInternal>();
  readonly parents = new Map<ParentReference, number>();
  readonly reference: ParentReference =
    typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};
  private parentCleanup?: FinalizationRegistry<ParentReference>;

  // An unobserved, detached container keeps its children but stops receiving
  // their mutations. Retaining one row must not keep every filtered array alive.
  private detachedVersions?: Map<StoreInternal, number>;

  constructor(
    readonly target: object,
    readonly proxy: object,
  ) {}

  attach(key: string | symbol, child: StoreInternal): void {
    if (this.childInternals.get(key) === child) return;
    this.detach(key);
    this.childInternals.set(key, child);
    this.connect(child);
    child.resumeIfDetached();
  }

  detach(key: string | symbol): void {
    const child = this.childInternals.get(key);
    if (!child) return;
    this.childInternals.delete(key);
    this.disconnect(child);
    child.suspendIfDetached();
  }

  private connect(child: StoreInternal): void {
    const count = child.parents.get(this.reference) ?? 0;
    if (!count) {
      child.trackSharedParents();
      child.parentCleanup?.register(this, this.reference, this.reference);
    }
    child.parents.set(this.reference, count + 1);
  }

  // A single-owner node has at most one stale reference. Start collecting
  // dead links when it gains another owner, without scanning parents on
  // every attachment or requiring a later read/write on a shared config.
  private trackSharedParents(): void {
    if (
      this.parentCleanup ||
      !this.parents.size ||
      typeof WeakRef !== 'function' ||
      typeof FinalizationRegistry !== 'function'
    )
      return;
    const parents = this.parents;
    this.parentCleanup = new FinalizationRegistry((reference) => {
      parents.delete(reference);
    });
    for (const reference of parents.keys()) {
      const parent = reference.deref();
      if (parent) this.parentCleanup.register(parent, reference, reference);
      else parents.delete(reference);
    }
  }

  private disconnect(child: StoreInternal): void {
    const count = child.parents.get(this.reference) ?? 0;
    if (count > 1) {
      child.parents.set(this.reference, count - 1);
      return;
    }
    child.parents.delete(this.reference);
    child.parentCleanup?.unregister(this.reference);
  }

  private canSuspend(): boolean {
    return (
      !this.detachedVersions &&
      !this.parents.size &&
      !this.isStoreRoot &&
      !this.syncListeners.size &&
      !this.batchedListeners.size
    );
  }

  suspendIfDetached(): void {
    if (!this.canSuspend()) return;
    const pending: StoreInternal[] = [this];
    for (const node of pending) {
      const versions = new Map<StoreInternal, number>();
      node.detachedVersions = versions;
      for (const child of node.childInternals.values()) {
        versions.set(child, child.version);
        node.disconnect(child);
        if (child.canSuspend()) pending.push(child);
      }
    }
  }

  /**
   * A caller can still read, mutate, or subscribe to a detached subtree. Each
   * node saved its children's versions when it was suspended, so it catches
   * up on its own when it is touched. The traps call this on every access,
   * so the check stays in a method small enough for an engine to inline.
   */
  resumeIfDetached(): void {
    if (this.detachedVersions) this.resume();
  }

  private resume(): void {
    // Compare saved versions after resuming descendants. An explicit stack
    // keeps deep detached inputs safe and visits shared descendants once.
    const pending: {
      node: StoreInternal;
      versions?: Map<StoreInternal, number>;
    }[] = [{node: this}];
    for (let frame = pending.pop(); frame; frame = pending.pop()) {
      const {node, versions} = frame;
      if (versions) {
        for (const [child, previous] of versions) {
          if (child.version !== previous) {
            node.version++;
            break;
          }
        }
      } else if (node.detachedVersions) {
        pending.push({node, versions: node.detachedVersions});
        node.detachedVersions = undefined;
        for (const child of node.childInternals.values()) {
          node.connect(child);
          if (child.detachedVersions) pending.push({node: child});
        }
      }
    }
  }

  /** This node and every container that currently owns it, up to each root. */
  ancestors(): Set<StoreInternal> {
    const visited = new Set<StoreInternal>([this]);
    for (const node of visited) {
      for (const reference of node.parents.keys()) {
        const parent = reference.deref();
        if (parent) visited.add(parent);
        else node.parents.delete(reference);
      }
    }
    return visited;
  }
}
