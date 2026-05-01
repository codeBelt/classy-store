import {createSignal, onCleanup} from 'solid-js';
import {getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function useClassyStore<T extends object>(
  proxyStore: T,
): () => Snapshot<T> {
  // Validate up front so users get a clear error instead of an opaque trace.
  getInternal(proxyStore);

  const [state, setState] = createSignal<Snapshot<T>>(snapshot(proxyStore));

  const unsubscribe = subscribe(proxyStore, () => {
    setState(() => snapshot(proxyStore));
  });

  onCleanup(unsubscribe);

  return state;
}
