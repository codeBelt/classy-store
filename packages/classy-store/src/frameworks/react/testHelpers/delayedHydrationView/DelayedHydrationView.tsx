import {useEffect} from 'react';
import type {
  HydrationGate,
  HydrationStore,
  UseHydrationValue,
} from '../hydration.types';

type Props = {
  gate: HydrationGate;
  store: HydrationStore;
  useValue: UseHydrationValue;
  onCommit: (value: string) => void;
};

export function DelayedHydrationView({gate, store, useValue, onCommit}: Props) {
  gate.read();
  const value = useValue(store);
  useEffect(() => {
    onCommit(value);
  }, [onCommit, value]);
  return <span data-hydration-value={true}>{value}</span>;
}
