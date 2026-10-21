import type {Snapshot} from '@codebelt/classy-store';

export type QaStore = {
  name: string;
  count: number;
  ignored: number;
  node: {first: string; second: string; optional?: string};
};

export type QaReadKind = 'has' | 'own' | 'keys';

export type QaGate = {
  promise: Promise<void>;
  attempts: string[];
  released: boolean;
};

export type QaTransitionProps = {
  store: QaStore;
  field: 'first' | 'second';
  gate: QaGate;
};

export type QaHydrationProps = {
  store: QaStore;
  onCommit: (state: Snapshot<QaStore>) => void;
};
