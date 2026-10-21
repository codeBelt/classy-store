import type {
  HydrationGate,
  ScopedSsrMode,
  ScopedSsrObservation,
} from '../scopedSsr.types';
import {ScopedSsrSelectedValue} from '../scopedSsrSelectedValue/ScopedSsrSelectedValue';
import {ScopedSsrTrackedValue} from '../scopedSsrTrackedValue/ScopedSsrTrackedValue';

type Props = ScopedSsrObservation & {
  gate?: HydrationGate;
  mode: ScopedSsrMode;
};

export function ScopedSsrValue({gate, mode, onRead, onCommit}: Props) {
  gate?.read();
  return mode === 'selector' ? (
    <ScopedSsrSelectedValue onRead={onRead} onCommit={onCommit} />
  ) : (
    <ScopedSsrTrackedValue onRead={onRead} onCommit={onCommit} />
  );
}
