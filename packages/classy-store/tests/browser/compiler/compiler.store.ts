import {createClassyStore, subscribe} from '../../../src/core/core';
import {createStoreHook} from '../../../src/frameworks/react/react';
import type {Snapshot} from '../../../src/types';

class CompilerStore {
  text = 'abcdef';
  edits = 0;
  profile = {first: 'Ada', last: 'Lovelace'};
  fallback = {name: 'Grace'};
  labels = ['zero', 'one'];
  unused = 0;
}

export const compilerStore = createClassyStore(new CompilerStore());
export const useCompilerStore = createStoreHook(compilerStore);
export const compilerProbe = {
  notifications: 0,
  notificationsDuringEvent: -1,
};

subscribe(compilerStore, () => compilerProbe.notifications++);

export function selectCompilerFields(state: Snapshot<typeof compilerStore>) {
  return {
    text: state.text,
    edits: state.edits,
    profile: state.profile,
    fallback: state.fallback,
    labels: state.labels,
  };
}

export function equalCompilerFields(
  previous: ReturnType<typeof selectCompilerFields>,
  next: ReturnType<typeof selectCompilerFields>,
) {
  return (
    previous.text === next.text &&
    previous.edits === next.edits &&
    previous.profile === next.profile &&
    previous.fallback === next.fallback &&
    previous.labels === next.labels
  );
}

declare global {
  interface Window {
    compilerStore: typeof compilerStore;
    compilerProbe: typeof compilerProbe;
  }
}

window.compilerStore = compilerStore;
window.compilerProbe = compilerProbe;
