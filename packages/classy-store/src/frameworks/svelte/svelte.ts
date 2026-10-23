import {subscribe as coreSubscribe, getInternal} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export interface ClassyReadable<T> {
  subscribe(run: (value: T) => void): () => void;
}

/**
 * Expose immutable snapshots as a Svelte readable store. Each subscription
 * receives the current snapshot immediately and subsequent mutations synchronously.
 * Svelte's `$store` syntax handles unsubscription on component destruction;
 * manual subscribers must call the returned unsubscribe function.
 */
export function toSvelteStore<T extends object>(
  proxyStore: T,
): ClassyReadable<Snapshot<T>> {
  // Validate up front so users get a clear error instead of an opaque trace.
  getInternal(proxyStore);

  return {
    subscribe(run: (value: Snapshot<T>) => void): () => void {
      let active = true;
      const notify = () => {
        // Another subscriber can unsubscribe this one during notification.
        if (active) run(snapshot(proxyStore));
      };
      // Subscribe before the initial callback so its mutations are observed too.
      // Svelte requires synchronous delivery; ordinary core subscribers still batch.
      const unsubscribeCore = coreSubscribe(proxyStore, notify, {sync: true});
      const unsubscribe = () => {
        active = false;
        unsubscribeCore();
      };

      try {
        notify();
      } catch (error) {
        unsubscribe();
        throw error;
      }

      return unsubscribe;
    },
  };
}
