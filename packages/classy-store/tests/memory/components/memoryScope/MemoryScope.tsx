import {useLocalStore} from '@codebelt/classy-store/react';
import {useLayoutEffect} from 'react';
import {MemoryStore} from '../../memory.store';
import type {MemoryMode} from '../../memory.types';
import {MemoryObjectSelector} from '../memoryObjectSelector/MemoryObjectSelector';
import {MemorySelector} from '../memorySelector/MemorySelector';
import {MemoryTracked} from '../memoryTracked/MemoryTracked';

type Props = {
  size: number;
  mode: MemoryMode;
  onStore: (store: MemoryStore | undefined) => void;
};

export function MemoryScope({size, mode, onStore}: Props) {
  const store = useLocalStore(() => new MemoryStore(size));
  useLayoutEffect(() => {
    onStore(store);
    return () => onStore(undefined);
  }, [store, onStore]);
  return mode === 'selector' ? (
    <MemorySelector store={store} />
  ) : mode === 'object-selector' ? (
    <MemoryObjectSelector store={store} />
  ) : (
    <MemoryTracked store={store} />
  );
}
