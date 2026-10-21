import {useClassyStore} from '../../react';

export function UtilityValue({store}: {store: {count: number}}) {
  const state = useClassyStore(store);
  return <output>{state.count}</output>;
}
