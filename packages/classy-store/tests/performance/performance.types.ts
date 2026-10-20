import type {ScaleStore} from './performance.store';

export type ScaleConfiguration = {
  workload: 'form' | 'list';
  mode: 'selector' | 'tracked';
  size: number;
};

export type ScaleOperation =
  | 'change'
  | 'burst'
  | 'unrelated'
  | 'noop'
  | 'parent';

export type ScaleConsumerProps = {
  store: ScaleStore;
  index: number;
  revision: number;
};

export type ScaleMetrics = {
  consumerCommits: number;
  rootCommits: number;
  selectorCalls: number;
  renderDurationMs: number;
  inputEventToCommitMs: number[];
};

export type ScaleMeasurement = {
  durationsMs: number[];
  metrics: ScaleMetrics;
};

export type ScaleBenchmark = {
  mount: (configuration: ScaleConfiguration) => ScaleMeasurement;
  measure: (operation: ScaleOperation, iterations: number) => ScaleMeasurement;
  resetMetrics: () => void;
  readMetrics: () => ScaleMetrics;
  unmount: () => ScaleMetrics;
};

declare global {
  interface Window {
    scaleBenchmark: ScaleBenchmark;
  }
}
