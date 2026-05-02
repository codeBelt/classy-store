import {onScopeDispose, type ShallowRef, shallowRef} from 'vue';
import {getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function useClassyStore<T extends object>(
  proxyStore: T,
): ShallowRef<Snapshot<T>> {
  // Validate up front so users get a clear error instead of an opaque trace.
  getInternal(proxyStore);

  const state = shallowRef(snapshot(proxyStore)) as unknown as ShallowRef<
    Snapshot<T>
  >;

  const unsubscribe = subscribe(proxyStore, () => {
    state.value = snapshot(proxyStore);
  });

  // `onScopeDispose` runs both on component unmount (setup() runs inside a
  // scope) and on standalone `effectScope().stop()`.
  onScopeDispose(unsubscribe);

  return state;
}
