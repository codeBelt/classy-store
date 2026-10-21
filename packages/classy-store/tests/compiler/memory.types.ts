import type {MemoryStore} from './memory.store';

export type MemoryConsumerProps = {
  store: MemoryStore;
  label: string;
  onCommit: (value: string) => void;
  onLifetime: (phase: 'setup' | 'cleanup') => void;
};
