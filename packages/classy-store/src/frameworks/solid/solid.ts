import {createSignal, onCleanup} from 'solid-js';
import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function useClassyStore<T extends object>(
  proxyStore: T,
): () => Snapshot<T> {
  const [state, setState] = createSignal<Snapshot<T>>(snapshot(proxyStore));

  const unsubscribe = subscribe(proxyStore, () => {
    setState(() => snapshot(proxyStore));
  });

  onCleanup(unsubscribe);

  return state;
}
