import type {ScaleStore} from './scale.store';

export type ScaleConsumerProps = {
  store: ScaleStore;
  index: number;
  label: string;
  onCommit: (index: number) => void;
};
