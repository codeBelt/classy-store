import type {FixtureStore} from '../../stores/fixtureStore/fixtureStore.store';
import type {StoreScope} from '../../types/fixture.types';

// Keep at most one deliberately retained store per workspace scope so browser
// tests can mutate it after unmount and verify persistence actually unsubscribed.
// The probe releases both references immediately after those mutations.
const disposedStores = new Map<StoreScope, FixtureStore>();

export function rememberDisposedStore(scope: StoreScope, store: FixtureStore) {
  if (scope !== 'shared' && scope !== 'route') return;
  disposedStores.set(scope, store);
  window.__classyNextMutateDisposedStores = () => {
    const count = disposedStores.size;
    for (const disposed of disposedStores.values()) {
      disposed.count++;
      disposed.text = `disposed:${disposed.count}`;
    }
    disposedStores.clear();
    return count;
  };
}
