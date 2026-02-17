import {
  DestroyRef,
  inject,
  type Signal,
  signal,
  type WritableSignal,
} from '@angular/core';
import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function injectStore<T extends object>(
  proxyStore: T,
): Signal<Snapshot<T>> {
  const state: WritableSignal<Snapshot<T>> = signal(snapshot(proxyStore));
  const destroyRef = inject(DestroyRef);

  const unsubscribe = subscribe(proxyStore, () => {
    state.set(snapshot(proxyStore));
  });

  destroyRef.onDestroy(unsubscribe);

  return state.asReadonly();
}
