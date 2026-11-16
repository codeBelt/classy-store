'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import {createPersistenceExamples} from './persistStores';

type Experiments = ReturnType<typeof createPersistenceExamples>;
const PersistenceContext = createContext<Experiments | 'unavailable' | null>(
  null,
);

export function PersistenceProvider({children}: {children: ReactNode}) {
  const [examples, setExamples] = useState<Experiments | 'unavailable' | null>(
    null,
  );
  useEffect(() => {
    let session: Experiments;
    try {
      session = createPersistenceExamples(window.localStorage);
    } catch {
      setExamples('unavailable');
      return;
    }
    setExamples(session);
    return () => {
      session.preferencesHandle.dispose();
      session.kitchenSinkHandle.dispose();
    };
  }, []);
  return (
    <PersistenceContext.Provider value={examples}>
      {children}
    </PersistenceContext.Provider>
  );
}

export function StorageReady({children}: {children: ReactNode}) {
  const examples = useContext(PersistenceContext);
  if (examples === 'unavailable')
    return (
      <p role="status">
        Enable local storage to try the persistence experiments.
      </p>
    );
  if (!examples) return <p role="status">Opening local storage…</p>;
  return children;
}

export function usePersistenceExamples() {
  const value = useContext(PersistenceContext);
  if (!value || value === 'unavailable')
    throw new Error(
      'Persistence examples require a mounted PersistenceProvider.',
    );
  return value;
}
