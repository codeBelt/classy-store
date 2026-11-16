import {DestroyRef, inject, type Signal, signal} from '@angular/core';
import {getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

export function injectStore<T extends object>(
  proxyStore: T,
): Signal<Snapshot<T>> {
  getInternal(proxyStore);
  const destroyRef = inject(DestroyRef);
  if (destroyRef.destroyed) {
    throw new Error('injectStore requires a live Angular injection context.');
  }

  const state = signal(snapshot(proxyStore));
  let active = true;
  const unsubscribe = subscribe(
    proxyStore,
    () => {
      // A notification may already be copied when another listener destroys us.
      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
    },
    {sync: true},
  );

  destroyRef.onDestroy(() => {
    active = false;
    unsubscribe();
  });

  return state.asReadonly();
}
