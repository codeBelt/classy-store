import {
  DestroyRef,
  inject,
  type Signal,
  signal,
  type WritableSignal,
} from '@angular/core';
import {getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function injectStore<T extends object>(
  proxyStore: T,
): Signal<Snapshot<T>> {
  // Validate up front so users get a clear error instead of an opaque trace.
  getInternal(proxyStore);

  const state: WritableSignal<Snapshot<T>> = signal(snapshot(proxyStore));
  const destroyRef = inject(DestroyRef);

  const unsubscribe = subscribe(proxyStore, () => {
    state.set(snapshot(proxyStore));
  });

  destroyRef.onDestroy(unsubscribe);

  return state.asReadonly();
}
