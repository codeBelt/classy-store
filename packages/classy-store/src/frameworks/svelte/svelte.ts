import {subscribe as coreSubscribe, getInternal} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export interface ClassyReadable<T> {
  subscribe(run: (value: T) => void): () => void;
}

export function toSvelteStore<T extends object>(
  proxyStore: T,
): ClassyReadable<Snapshot<T>> {
  // Validate up front so users get a clear error instead of an opaque trace.
  getInternal(proxyStore);

  return {
    subscribe(run: (value: Snapshot<T>) => void): () => void {
      // Svelte contract: call immediately with current value
      run(snapshot(proxyStore));

      return coreSubscribe(proxyStore, () => {
        run(snapshot(proxyStore));
      });
    },
  };
}
