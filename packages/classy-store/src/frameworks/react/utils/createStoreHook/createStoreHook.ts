import {getInternal} from '../../../../core/core';
import type {Snapshot} from '../../../../types';
import {useClassyStore} from '../../hooks/useClassyStore/useClassyStore';
import type {UseClassyStoreSelectorOptions} from '../../hooks/useClassyStore/useClassyStore.types';

/**
 * Create a pre-bound React hook for a specific store proxy.
 *
 * Eliminates the boilerplate of writing a wrapper around `useClassyStore`
 * for every store instance:
 *
 * ```ts
 * // Before:
 * export const catalogStore = createClassyStore(new CatalogStore());
 * export function useCatalogStore<S>(selector: (s: Snapshot<CatalogStore>) => S) {
 *   return useClassyStore(catalogStore, selector);
 * }
 *
 * // After:
 * export const catalogStore = createClassyStore(new CatalogStore());
 * export const useCatalogStore = createStoreHook(catalogStore);
 * ```
 *
 * The returned hook supports both selector mode and auto-tracked (selectorless)
 * mode — identical to `useClassyStore`, but with the store already bound.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 */
export function createStoreHook<T extends object>(proxyStore: T) {
  // Fail fast at creation time rather than on first render.
  getInternal(proxyStore);

  function useStore(): Snapshot<T>;
  function useStore<S>(
    selector: (snap: Snapshot<T>) => S,
    options?: UseClassyStoreSelectorOptions<S>,
  ): S;
  function useStore<S>(
    selector?: (snap: Snapshot<T>) => S,
    options?: UseClassyStoreSelectorOptions<S>,
  ): Snapshot<T> | S {
    return useClassyStore(
      proxyStore,
      selector as (snap: Snapshot<T>) => S,
      options,
    );
  }
  return useStore;
}
