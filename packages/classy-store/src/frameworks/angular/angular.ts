import {DestroyRef, inject, type Signal, signal} from '@angular/core';
import {getInternal, snapshot, subscribe} from '../../storeRuntime';
import type {Snapshot} from '../../types';

/**
 * Read immutable snapshots as a readonly signal inside an Angular injection
 * context, such as a component field initializer or constructor. The signal
 * updates synchronously; Angular schedules rendering as usual. The injection
 * context's `DestroyRef` owns subscription cleanup.
 */
export function injectClassyStore<T extends object>(
  proxyStore: T,
): Signal<Snapshot<T>> {
  getInternal(proxyStore);
  const destroyRef = inject(DestroyRef);
  if (destroyRef.destroyed) {
    throw new Error(
      'injectClassyStore requires a live Angular injection context.',
    );
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
