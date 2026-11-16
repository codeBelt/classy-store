import {createSignal, getOwner, isDisposed, onCleanup} from 'solid-js';
import {getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

/**
 * Read immutable snapshots inside a Solid 2 component or live reactive root.
 * Store notifications reach Solid synchronously; Solid schedules its own updates.
 * The owner disposes the subscription. Use Solid's flush() for imperative reads.
 */
export function useClassyStore<T extends object>(
  proxyStore: T,
): () => Snapshot<T> {
  getInternal(proxyStore);
  const owner = getOwner();
  if (!owner || isDisposed(owner)) {
    throw new Error(
      '@codebelt/classy-store/solid: useClassyStore() requires an active Solid owner; call it in a component or createRoot()',
    );
  }

  // Snapshot construction returns an object/array; select the plain-value overload.
  const [state, setState] = createSignal<Snapshot<T>>(
    // biome-ignore lint/complexity/noBannedTypes: Matches Solid's exclusion of all callable initializers.
    snapshot(proxyStore) as Exclude<Snapshot<T>, Function>,
    {ownedWrite: true},
  );
  let active = true;

  const unsubscribe = subscribe(
    proxyStore,
    () => {
      // Another listener can dispose this owner during the same notification.
      if (active && !isDisposed(owner)) setState(() => snapshot(proxyStore));
    },
    {sync: true},
  );

  onCleanup(() => {
    active = false;
    unsubscribe();
  });

  return state;
}
