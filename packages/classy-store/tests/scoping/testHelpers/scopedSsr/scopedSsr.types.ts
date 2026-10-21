import type {EditorStore} from '../../example/editorStore';

export type HydrationGate = {
  read: () => void;
  release: () => void;
};

export type ScopedSsrMode = 'selector' | 'auto-tracking';

export type ScopedSsrObservation = {
  onStore?: (store: EditorStore) => void;
  onRead?: (value: string) => void;
  onCommit?: (value: string) => void;
};
