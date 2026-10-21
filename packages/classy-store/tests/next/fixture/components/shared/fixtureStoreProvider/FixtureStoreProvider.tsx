'use client';

import {
  prepareStoreForHydration,
  useLocalStore,
} from '@codebelt/classy-store/react';
import {persist} from '@codebelt/classy-store/utils';
import {type ReactNode, useEffect, version} from 'react';
import {FixtureStore} from '../../../stores/fixtureStore/fixtureStore.store';
import {FixtureStoreContext} from '../../../stores/fixtureStore/fixtureStoreContext';
import type {StoreData, StoreScope} from '../../../types/fixture.types';
import {getDiagnostics} from '../../../utils/diagnostics/diagnostics';
import {rememberDisposedStore} from '../../../utils/disposedStores/disposedStores';
import {StoreSelector} from '../storeSelector/StoreSelector';
import {StoreTracked} from '../storeTracked/StoreTracked';

type Props = {
  initialData: StoreData;
  scope: StoreScope;
  children: ReactNode;
};

export function FixtureStoreProvider({initialData, scope, children}: Props) {
  const store = prepareStoreForHydration(
    useLocalStore(() => new FixtureStore(initialData)),
  );

  useEffect(() => {
    let active = true;
    window.__classyNextCompilerSources = {
      selector: Function.prototype.toString.call(StoreSelector),
      tracked: Function.prototype.toString.call(StoreTracked),
    };
    window.__classyNextReactVersion = version;
    const diagnostics = getDiagnostics();
    diagnostics[`${scope}Mounts`]++;
    diagnostics.activePersistence++;
    if (scope === 'stream') {
      diagnostics.streamParentHydrated = true;
      diagnostics.streamRestored = false;
      diagnostics.streamChildHydrated = false;
    }
    const handle = persist(store, {
      name: `classy-next-${scope}`,
      skipHydration: true,
      storage: {
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          diagnostics.persistenceWrites++;
          localStorage.setItem(name, value);
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    });
    // Workspace stores start afresh when their scope ends. Only the streaming
    // fixture opts into restoring saved data during hydration.
    if (scope === 'stream') {
      void handle.rehydrate().then(() => {
        if (!active) return;
        diagnostics.persistenceRestores++;
        diagnostics.streamRestored = true;
        diagnostics.streamRestoredValue = `${store.text}:${store.count}`;
      });
    }
    return () => {
      active = false;
      handle.unsubscribe();
      rememberDisposedStore(scope, store);
      diagnostics[`${scope}Disposes`]++;
      diagnostics.activePersistence--;
    };
  }, [scope, store]);

  return (
    <FixtureStoreContext.Provider value={store}>
      {children}
    </FixtureStoreContext.Provider>
  );
}
