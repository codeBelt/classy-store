import {getCurrentScope, onScopeDispose, type Ref, shallowRef} from 'vue';
import {getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

/**
 * Read immutable snapshots from a shallow ref inside setup() or an active
 * effect scope. Ref updates are synchronous; Vue batches rendering normally.
 * The scope owns subscription cleanup.
 */
export function useClassyStore<T extends object>(
  proxyStore: T,
): Ref<Snapshot<T>> {
  getInternal(proxyStore);
  if (!getCurrentScope()?.active) {
    throw new Error(
      '@codebelt/classy-store/vue: useClassyStore() requires an active Vue effect scope; call it in setup() or effectScope().run()',
    );
  }

  const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
  let active = true;
  const unsubscribe = subscribe(
    proxyStore,
    () => {
      // A prior subscriber may stop this scope during the same notification.
      if (active) state.value = snapshot(proxyStore);
    },
    {sync: true},
  );

  onScopeDispose(() => {
    active = false;
    unsubscribe();
  });

  return state;
}
