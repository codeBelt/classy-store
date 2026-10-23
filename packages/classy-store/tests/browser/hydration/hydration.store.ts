import {createClassyStore} from '../../../src/core/core';
import {createStoreHook} from '../../../src/frameworks/react/react';
import {prepareStoreForHydration} from '../../../src/frameworks/react/server';

export type HydrationData = {user: {name: string}; count: number};

export const hydrationStorageKey = 'classy-store-delayed-hydration';

export function createHydrationRuntime(
  initialData: HydrationData,
  delayed: boolean,
) {
  const store = prepareStoreForHydration(createClassyStore(initialData));
  let resolveBoundary = () => {};
  const pending = new Promise<void>((resolve) => {
    resolveBoundary = resolve;
  });
  const gate = {
    ready: !delayed,
    pending,
    release() {
      gate.ready = true;
      resolveBoundary();
    },
  };

  return {
    store,
    useBoundStore: createStoreHook(store),
    gate,
    probe: {
      parentHydrated: false,
      restored: false,
      childHydrated: false,
      valuesRead: [] as string[],
      recoverableErrors: [] as string[],
      serverElements: [] as Element[],
    },
  };
}

export type HydrationRuntime = ReturnType<typeof createHydrationRuntime>;

declare global {
  interface Window {
    hydrationRuntime: HydrationRuntime;
  }
}
