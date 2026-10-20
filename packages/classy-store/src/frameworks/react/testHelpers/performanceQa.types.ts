import type {Snapshot} from '../../../types';

export type PerformanceQaStore = {
  rows: {name: string; ignored: number}[];
  ignored: number;
};

export type PerformanceQaCommit = (
  id: string,
  state: Snapshot<PerformanceQaStore>,
) => void;
