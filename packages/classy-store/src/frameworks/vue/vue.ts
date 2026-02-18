import {onUnmounted, type ShallowRef, shallowRef} from 'vue';
import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function useStore<T extends object>(
  proxyStore: T,
): ShallowRef<Snapshot<T>> {
  const state = shallowRef(snapshot(proxyStore)) as unknown as ShallowRef<
    Snapshot<T>
  >;

  const unsubscribe = subscribe(proxyStore, () => {
    state.value = snapshot(proxyStore);
  });

  onUnmounted(unsubscribe);

  return state;
}
