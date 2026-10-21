import type {MemoryStore} from './memory.store';

export type MemoryMode = 'selector' | 'object-selector' | 'tracked';
export type MemoryScenario =
  | 'mount'
  | 'reset'
  | 'replace'
  | 'truncate'
  | 'detached';
export type MemoryConfiguration = {
  mode: MemoryMode;
  scenario: MemoryScenario;
  size: number;
};
export type MemoryConsumerProps = {store: MemoryStore};
export type MemoryProbe = {
  start: (configuration: MemoryConfiguration) => void;
  cycle: (count: number) => Promise<void>;
  cleanup: () => Promise<void>;
  holdControl: () => void;
  releaseControl: () => void;
  status: () => {text: string; cycles: number; heldRows: number};
};

declare global {
  interface Window {
    memoryProbe: MemoryProbe;
  }
}
