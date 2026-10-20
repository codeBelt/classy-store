import {useEffect} from 'react';
import {useClassyStore} from '../../../../../src/frameworks/react/react';
import type {HydrationRuntime} from '../../hydration.store';

type Props = {runtime: HydrationRuntime};

export function HydrationFields({runtime}: Props) {
  const {store, useBoundStore} = runtime;
  const selected = useClassyStore(
    store,
    (state) => `${state.user.name}:${state.count}`,
  );
  const tracked = useClassyStore(store);
  const boundSelected = useBoundStore(
    (state) => `${state.user.name}:${state.count}`,
  );
  const boundTracked = useBoundStore();
  runtime.probe.valuesRead.push(selected);
  useEffect(() => {
    runtime.probe.childHydrated = true;
  }, [runtime]);

  return (
    <section>
      <output data-testid="hydration-selector">{selected}</output>
      <output data-testid="hydration-tracked">{`${tracked.user.name}:${tracked.count}`}</output>
      <output data-testid="hydration-bound-selector">{boundSelected}</output>
      <output data-testid="hydration-bound-tracked">{`${boundTracked.user.name}:${boundTracked.count}`}</output>
      <label>
        Hydrated name
        <input
          value={tracked.user.name}
          onChange={(event) => {
            store.user.name = event.target.value;
            store.count++;
          }}
        />
      </label>
    </section>
  );
}
