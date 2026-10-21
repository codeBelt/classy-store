import {Suspense, useEffect} from 'react';
import {persist} from '../../../../../src/utils/persist/persist';
import {
  type HydrationRuntime,
  hydrationStorageKey,
} from '../../hydration.store';
import {DelayedFields} from '../delayedFields/DelayedFields';

type Props = {runtime: HydrationRuntime};

export function HydrationApp({runtime}: Props) {
  useEffect(() => {
    runtime.probe.parentHydrated = true;
    const persistence = persist(runtime.store, {
      name: hydrationStorageKey,
      storage: localStorage,
      skipHydration: true,
    });
    void persistence.rehydrate().then(() => {
      runtime.probe.restored = true;
    });
    return persistence.unsubscribe;
  }, [runtime]);

  return (
    <main>
      <h1>Delayed store hydration</h1>
      <Suspense fallback={<p>Loading fields</p>}>
        <DelayedFields runtime={runtime} />
      </Suspense>
    </main>
  );
}
