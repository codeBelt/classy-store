import type {ComputedEntry} from './core.types';

type ParentReference = {deref(): StoreInternal | undefined};

/** One canonical node per raw object. Each property owns one edge to a child. */
export class StoreInternal {
  version = 0;
  isStoreRoot = false;
  // Child subscriptions observe their owning roots even if the caller keeps
  // only the child proxy. Unsubscribing releases these strong references.
  subscriptionRoots?: Set<StoreInternal[]>;
  readonly batchedListeners = new Map<() => void, () => void>();
  readonly syncListeners = new Map<() => void, () => void>();
  readonly computedCache = new Map<string | symbol, ComputedEntry>();
  readonly childInternals = new Map<string | symbol, StoreInternal>();
  readonly parents = new Map<ParentReference, number>();
  readonly reference: ParentReference =
    typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};

  // An unobserved, detached container keeps its children but stops receiving
  // their mutations. Retaining one row must not keep every filtered array alive.
  private detachedVersions?: Map<StoreInternal, number>;
  private detachedParent?: ParentReference;

  constructor(
    readonly target: object,
    readonly proxy: object,
  ) {}

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
    child.parents.set(
      this.reference,
      (child.parents.get(this.reference) ?? 0) + 1,
    );
  }

  private disconnect(child: StoreInternal): void {
    const count = child.parents.get(this.reference);
    if (count === undefined) return;
    if (count > 1) {
      child.parents.set(this.reference, count - 1);
      return;
    }
    child.parents.delete(this.reference);
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
