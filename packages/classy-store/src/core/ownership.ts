import type {ComputedEntry} from './core.types';

type ParentReference = {deref(): StoreInternal | undefined};

/** One canonical node per raw object. Each property owns one edge to a child. */
export class StoreInternal {
  version = 0;
  isStoreRoot = false;
  readonly batchedListeners = new Map<() => void, () => void>();
  readonly syncListeners = new Map<() => void, () => void>();
  // A subscribed child observes siblings within each nearest root. Keep its
  // current paths alive and update the routes when a parent edge changes.
  private subscriptionPath?: Set<StoreInternal>;
  private pathObservers?: Set<StoreInternal>;
  readonly computedCache = new Map<string | symbol, ComputedEntry>();
  readonly childInternals = new Map<string | symbol, StoreInternal>();
  readonly parents = new Map<ParentReference, number>();
  readonly reference: ParentReference =
    typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};
  private parentCleanup?: FinalizationRegistry<ParentReference>;

  // An unobserved, detached container keeps its children but stops receiving
  // their mutations. Retaining one row must not keep every filtered array alive.
  private detachedVersions?: Map<StoreInternal, number>;
  private detachedParent?: ParentReference;

  constructor(
    readonly target: object,
    readonly proxy: object,
  ) {}

  get scopedSubscribers(): ReadonlySet<StoreInternal> | undefined {
    if (this.isStoreRoot || !this.parents.size) return this.pathObservers;
    return undefined;
  }

  attach(key: string | symbol, child: StoreInternal): void {
    if (this.childInternals.get(key) === child) return;
    this.detach(key);
    this.childInternals.set(key, child);
    this.connect(child);
    child.resume();
  }

  detach(key: string | symbol): void {
    const child = this.childInternals.get(key);
    if (!child) return;
    this.childInternals.delete(key);
    this.disconnect(child);
    child.suspendIfDetached();
  }

  private connect(child: StoreInternal): void {
    child.detachedParent = undefined;
    const count = child.parents.get(this.reference) ?? 0;
    if (!count) {
      child.trackSharedParents();
      child.parentCleanup?.register(this, this.reference, this.reference);
    }
    child.parents.set(this.reference, count + 1);
    if (!count && !child.isStoreRoot) child.ownershipChanged();
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
    const count = child.parents.get(this.reference);
    if (count === undefined) return;
    if (count > 1) {
      child.parents.set(this.reference, count - 1);
      return;
    }
    child.parents.delete(this.reference);
    child.parentCleanup?.unregister(this.reference);
    if (!child.isStoreRoot) child.ownershipChanged();
  }

  private canSuspend(): boolean {
    return (
      !this.detachedVersions &&
      !this.parents.size &&
      !this.isStoreRoot &&
      !this.syncListeners.size &&
      !this.batchedListeners.size &&
      !this.pathObservers?.size
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
        if (child.canSuspend()) {
          child.detachedParent = node.reference;
          pending.push(child);
        }
      }
    }
  }

  private resume(): void {
    if (!this.detachedVersions) return;
    // Compare saved versions after resuming descendants. An explicit stack
    // keeps deep detached inputs safe and visits shared descendants once.
    const pending: {
      node: StoreInternal;
      versions?: Map<StoreInternal, number>;
    }[] = [{node: this}];
    while (pending.length) {
      const frame = pending.pop();
      if (!frame) break;
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

  /** A caller can still read, mutate, or subscribe to a detached subtree. */
  resumeScope(): void {
    if (!this.detachedVersions) return;
    let scope: StoreInternal = this;
    let parent = scope.detachedParent?.deref();
    while (parent?.detachedVersions) {
      scope = parent;
      parent = scope.detachedParent?.deref();
    }
    scope.resume();
  }

  markAsRoot(): void {
    if (this.isStoreRoot) return;
    this.isStoreRoot = true;
    this.ownershipChanged();
  }

  private ownershipChanged(): void {
    if (this.pathObservers?.size) {
      for (const child of [...this.pathObservers])
        child.refreshSubscriptionScope();
    }
  }

  refreshSubscriptionScope(): void {
    const previous = this.subscriptionPath;
    const needsScope =
      !this.isStoreRoot &&
      (this.syncListeners.size || this.batchedListeners.size);
    const next = needsScope ? this.ancestors(true) : undefined;
    this.subscriptionPath = next;
    if (next) {
      for (const owner of next) {
        owner.pathObservers ??= new Set();
        owner.pathObservers.add(this);
      }
    }
    if (previous) {
      for (const owner of previous) {
        if (!next?.has(owner)) {
          owner.pathObservers?.delete(this);
          owner.suspendIfDetached();
        }
      }
    }
  }

  ancestors(stopAtStoreRoots = false): Set<StoreInternal> {
    const visited = new Set<StoreInternal>([this]);
    for (const node of visited) {
      if (stopAtStoreRoots && node.isStoreRoot) continue;
      for (const reference of node.parents.keys()) {
        const parent = reference.deref();
        if (parent) visited.add(parent);
        else node.parents.delete(reference);
      }
    }
    return visited;
  }
}
