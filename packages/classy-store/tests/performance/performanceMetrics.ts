import type {ProfilerOnRenderCallback} from 'react';
import type {ScaleMetrics} from './performance.types';

let metrics: ScaleMetrics;
let inputStarted: number | undefined;

export function resetMetrics(): void {
  metrics = {
    consumerCommits: 0,
    rootCommits: 0,
    selectorCalls: 0,
    renderDurationMs: 0,
    inputEventToCommitMs: [],
  };
  inputStarted = undefined;
}

resetMetrics();

export function readMetrics(): ScaleMetrics {
  return {...metrics, inputEventToCommitMs: [...metrics.inputEventToCommitMs]};
}

export function recordSelector(): void {
  metrics.selectorCalls += 1;
}

// Effects count committed consumer executions; Compiler can cache render code.
export function recordConsumerCommit(): void {
  metrics.consumerCommits += 1;
  if (inputStarted !== undefined) {
    metrics.inputEventToCommitMs.push(performance.now() - inputStarted);
    inputStarted = undefined;
  }
}

export function recordInputStart(): void {
  inputStarted = performance.now();
}

export const recordRootCommit: ProfilerOnRenderCallback = (
  _id,
  _phase,
  actualDuration,
) => {
  metrics.rootCommits += 1;
  metrics.renderDurationMs += actualDuration;
};
