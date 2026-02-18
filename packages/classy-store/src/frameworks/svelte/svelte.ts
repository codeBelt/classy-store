import {subscribe as coreSubscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export interface ClassyReadable<T> {
  subscribe(run: (value: T) => void): () => void;
}

export function toSvelteStore<T extends object>(
  proxyStore: T,
): ClassyReadable<Snapshot<T>> {
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
