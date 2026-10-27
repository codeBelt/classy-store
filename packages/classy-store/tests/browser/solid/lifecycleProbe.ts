import {
  createEffect,
  createRoot,
  flush,
  getOwner,
  runWithOwner,
} from 'solid-js';
import {
  createClassyStore,
  getInternal,
  subscribe,
} from '../../../src/core/core';
import {useClassyStore} from '../../../src/frameworks/solid/solid';

export function lifecycleProbe() {
  const store = createClassyStore({count: 0});
  const errors: string[] = [];
  function expectRejection() {
    try {
      useClassyStore(store);
    } catch (error) {
      errors.push(String(error));
    }
  }
  expectRejection();
  createRoot((dispose) => {
    dispose();
    expectRejection();
  });
  const listenersAfterRejection =
    getInternal(store).syncListeners.size +
    getInternal(store).batchedListeners.size;
  const firstValues: number[] = [];
  const secondValues: number[] = [];
  const parent = createRoot((dispose) => {
    createRoot(() => {
      const state = useClassyStore(store);
      createEffect(
        () => state().count,
        (value) => {
          firstValues.push(value);
        },
      );
    });
    return {dispose, owner: getOwner()};
  });
  const stopSecond = createRoot((dispose) => {
    const state = useClassyStore(store);
    createEffect(
      () => state().count,
      (value) => {
        secondValues.push(value);
      },
    );
    return dispose;
  });
  flush();
  try {
    // External store notifications may arrive while an owner is active.
    runWithOwner(parent.owner, () => {
      store.count = 1;
    });
    flush();
    parent.dispose();
    store.count = 2;
    flush();
  } finally {
    parent.dispose();
    stopSecond();
  }
  let stopVictim = () => {};
  const stopKiller = subscribe(store, () => stopVictim(), {sync: true});
  const victim = createRoot((dispose) => {
    stopVictim = dispose;
    return useClassyStore(store);
  });
  store.count = 3;
  flush();
  const victimCount = victim().count;
  stopKiller();
  stopVictim();
  return {
    errors,
    listenersAfterRejection,
    firstValues,
    secondValues,
    victimCount,
    remainingListeners:
      getInternal(store).syncListeners.size +
      getInternal(store).batchedListeners.size,
  };
}
