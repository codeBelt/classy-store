import type {HydrationRuntime} from '../../hydration.store';
import {HydrationFields} from '../hydrationFields/HydrationFields';

type Props = {runtime: HydrationRuntime};

export function DelayedFields({runtime}: Props) {
  // Suspend before any store hook runs, as when a client chunk is still loading.
  if (!runtime.gate.ready) throw runtime.gate.pending;
  return <HydrationFields runtime={runtime} />;
}
