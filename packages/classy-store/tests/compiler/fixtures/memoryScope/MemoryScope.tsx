import {useLocalStore} from '@codebelt/classy-store/react';
import {type ComponentType, useLayoutEffect} from 'react';
import {MemoryStore} from '../../memory.store';
import type {MemoryConsumerProps} from '../../memory.types';

type Props = Omit<MemoryConsumerProps, 'store'> & {
  id: string;
  Consumer: ComponentType<MemoryConsumerProps>;
  onStore: (store: MemoryStore) => void;
};

export function MemoryScope({id, Consumer, onStore, ...props}: Props) {
  const store = useLocalStore(() => new MemoryStore(id));
  useLayoutEffect(() => {
    onStore(store);
  }, [onStore, store]);
  return <Consumer store={store} {...props} />;
}
