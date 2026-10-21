import {afterEach, describe, expect, test} from 'bun:test';
import {getVersion, snapshot, subscribe} from '@codebelt/classy-store';
import {StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {MemoryScope} from './fixtures/memoryScope/MemoryScope';
import {MemorySelector} from './fixtures/memorySelector/MemorySelector';
import {MemoryTracked} from './fixtures/memoryTracked/MemoryTracked';
import {
  createMemoryStore,
  type MemoryStore,
  memoryGetterReads,
} from './memory.store';
import {act} from './reactAct';

const mounted = new Map<Root, HTMLDivElement>();
const cases = [
  {description: 'selectors', Component: MemorySelector},
  {description: 'auto-tracking', Component: MemoryTracked},
];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.set(root, container);
  return {root, container};
}

function createCounters() {
  const commits: string[] = [];
  let activeEffects = 0;
  return {
    commits,
    onCommit: (value: string) => {
      commits.push(value);
    },
    onLifetime: (phase: 'setup' | 'cleanup') => {
      activeEffects += phase === 'setup' ? 1 : -1;
    },
    getActiveEffects: () => activeEffects,
  };
}

async function expectRetiredStoresInactive(stores: MemoryStore[]) {
  const previousReads = stores.map((store) => memoryGetterReads.get(store.id));
  await act(async () => {
    for (const store of stores) {
      store.rows[0].title += ' retired';
    }
  });
  // A leaked external-store callback would evaluate the changed getter even if
  // React ignored the update because its component had already unmounted.
  expect(stores.map((store) => memoryGetterReads.get(store.id))).toEqual(
    previousReads,
  );
}

afterEach(async () => {
  for (const [root, container] of mounted) {
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.clear();
  memoryGetterReads.clear();
});

describe('repeated React store lifecycles', () => {
  test.each(
    cases,
  )('$description releases subscriptions after repeated StrictMode mounts', async ({
    Component,
  }) => {
    const {root, container} = mountRoot();
    const counters = createCounters();
    const retiredStores: MemoryStore[] = [];
    for (let cycle = 0; cycle < 20; cycle++) {
      const store = createMemoryStore(`mount-${cycle}`);
      await act(async () =>
        root.render(
          <StrictMode>
            <Component store={store} label="Mounted" {...counters} />
          </StrictMode>,
        ),
      );
      expect(counters.getActiveEffects()).toBe(1);
      expect(memoryGetterReads.get(store.id)).toBeGreaterThan(0);
      counters.commits.length = 0;
      await act(async () => {
        store.rows[0].title = `Current ${cycle}`;
      });
      expect(counters.commits).toHaveLength(1);
      expect(container.textContent).toContain(`Current ${cycle}`);
      await act(async () => root.render(null));
      expect(counters.getActiveEffects()).toBe(0);
      retiredStores.push(store);
    }
    counters.commits.length = 0;
    await expectRetiredStoresInactive(retiredStores);
    expect(counters.commits).toEqual([]);
    expect(container.textContent).toBe('');
  });

  test.each(
    cases,
  )('$description releases prior local stores after keyed resets', async ({
    Component,
  }) => {
    const {root, container} = mountRoot();
    const counters = createCounters();
    const observedStores = new Set<MemoryStore>();
    const onStore = (store: MemoryStore) => {
      observedStores.add(store);
    };
    for (let cycle = 0; cycle < 16; cycle++) {
      await act(async () =>
        root.render(
          <StrictMode>
            <MemoryScope
              key={cycle}
              id={`reset-${cycle}`}
              label="Reset"
              Consumer={Component}
              onStore={onStore}
              {...counters}
            />
          </StrictMode>,
        ),
      );
      const stores = [...observedStores];
      const currentStore = stores[stores.length - 1];
      expect(currentStore.id).toBe(`reset-${cycle}`);
      expect(stores).toHaveLength(cycle + 1);
      expect(counters.getActiveEffects()).toBe(1);
      counters.commits.length = 0;
      await expectRetiredStoresInactive(stores.slice(0, -1));
      expect(counters.commits).toEqual([]);
      await act(async () => {
        currentStore.rows[0].title = `Reset ${cycle}`;
      });
      expect(counters.commits).toHaveLength(1);
      expect(container.textContent).toContain(`Reset ${cycle}`);
    }
    await act(async () => root.render(null));
    expect(counters.getActiveEffects()).toBe(0);
    counters.commits.length = 0;
    await expectRetiredStoresInactive([...observedStores]);
    expect(counters.commits).toEqual([]);
  });

  test.each(
    cases,
  )('$description switches stores without leaving callbacks on retired instances', async ({
    Component,
  }) => {
    const {root, container} = mountRoot();
    const counters = createCounters();
    const stores: MemoryStore[] = [];
    for (let cycle = 0; cycle < 16; cycle++) {
      const store = createMemoryStore(`switch-${cycle}`);
      stores.push(store);
      await act(async () =>
        root.render(
          <Component store={store} label={`Store ${cycle}`} {...counters} />,
        ),
      );
      counters.commits.length = 0;
      await expectRetiredStoresInactive(stores.slice(0, -1));
      expect(counters.commits).toEqual([]);
      await act(async () => {
        container.querySelector('button')?.click();
      });
      expect(counters.commits).toHaveLength(1);
      counters.commits.length = 0;
      await act(async () => {
        store.rows[0].title = `Current ${cycle}`;
      });
      expect(counters.commits).toHaveLength(1);
      expect(container.textContent).toContain(
        `Store ${cycle}:Stable:Current ${cycle}`,
      );
    }
    await act(async () => root.render(null));
    expect(counters.getActiveEffects()).toBe(0);
    await expectRetiredStoresInactive(stores);
  });

  test.each(
    cases,
  )('$description isolates replacement collections and preserves stable child reads', async ({
    Component,
  }) => {
    const {root, container} = mountRoot();
    const store = createMemoryStore('collections');
    const counters = createCounters();
    await act(async () =>
      root.render(<Component store={store} label="Initial" {...counters} />),
    );
    const stableSnapshot = snapshot(store).stable;
    const retiredRows: MemoryStore['rows'] = [];
    for (let cycle = 0; cycle < 24; cycle++) {
      retiredRows.push(store.rows[0]);
      counters.commits.length = 0;
      await act(async () => {
        store.rows = Array.from({length: 8}, (_, index) => ({
          title: `Collection ${cycle} row ${index}`,
        }));
      });
      expect(counters.commits).toHaveLength(1);
      expect(snapshot(store).stable).toBe(stableSnapshot);
      expect(container.textContent).toContain(`Collection ${cycle} row 7`);
      await act(async () =>
        root.render(
          <Component store={store} label={`Parent ${cycle}`} {...counters} />,
        ),
      );
      await act(async () => {
        container.querySelector('button')?.click();
      });
      counters.commits.length = 0;
      await act(async () => {
        store.rows[0].title = `Current ${cycle}`;
      });
      expect(counters.commits).toHaveLength(1);
      expect(container.textContent).toContain(
        `Parent ${cycle}:Stable:Current ${cycle}`,
      );
      counters.commits.length = 0;
      await act(async () => {
        store.ignored++;
      });
      expect(counters.commits).toEqual([]);
    }
    const previousVersion = getVersion(store);
    let notifications = 0;
    const unsubscribe = subscribe(
      store,
      () => {
        notifications++;
      },
      {sync: true},
    );
    try {
      await act(async () => {
        for (const row of retiredRows) row.title = 'Detached row';
      });
      expect(getVersion(store)).toBe(previousVersion);
      expect(notifications).toBe(0);
      expect(counters.commits).toEqual([]);
      expect(container.textContent).toContain('Current 23');
    } finally {
      unsubscribe();
    }
    await act(async () => {
      store.stable.label = 'Still subscribed';
    });
    expect(counters.commits).toHaveLength(1);
    expect(container.textContent).toContain('Still subscribed:Current 23');
  });

  test.each(
    cases,
  )('$description detaches removed rows through repeated truncation and refill', async ({
    Component,
  }) => {
    const {root, container} = mountRoot();
    const store = createMemoryStore('truncate');
    const counters = createCounters();
    await act(async () =>
      root.render(<Component store={store} label="Rows" {...counters} />),
    );
    for (let cycle = 0; cycle < 12; cycle++) {
      const removedRow = store.rows[store.rows.length - 1];
      counters.commits.length = 0;
      await act(async () => {
        store.rows.length = 0;
      });
      expect(counters.commits).toHaveLength(1);
      expect(container.querySelector('output')?.textContent).toBe(
        'Rows:Stable:',
      );
      const versionAfterTruncation = getVersion(store);
      counters.commits.length = 0;
      await act(async () => {
        removedRow.title = 'Retired';
      });
      expect(getVersion(store)).toBe(versionAfterTruncation);
      expect(counters.commits).toEqual([]);
      await act(async () => {
        store.rows.push({title: `Refilled ${cycle}`}, {title: 'Last'});
      });
      expect(counters.commits).toHaveLength(1);
      expect(container.querySelector('output')?.textContent).toBe(
        `Rows:Stable:Refilled ${cycle},Last`,
      );
    }
  });
});
