import {registerTrackingProxy} from '../../../../storeRuntime';

/**
 * A hook's proxy cache that also tells the store which snapshot each tracking
 * proxy wraps. The store can then recognise a tracked value handed back to it,
 * for example `store.selected = snap.rows[0]`, and keep the snapshot instead.
 */
export class TrackedProxyCache extends WeakMap<object, unknown> {
  override set(snapshotObject: object, entry: unknown): this {
    // proxy-compare 3 caches [handler, state], and the state holds the proxy
    // it has just created. Read it generically, not by its private field name.
    const state = (entry as [unknown, Record<string, unknown>])[1];
    for (const value of Object.values(state)) {
      if (typeof value === 'object' && value !== null) {
        registerTrackingProxy(value, snapshotObject);
      }
    }
    return super.set(snapshotObject, entry);
  }
}
