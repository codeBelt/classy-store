import {afterEach, describe, expect, mock, test} from 'bun:test';
import {
  act,
  type ReactNode,
  StrictMode,
  Suspense,
  startTransition,
  useEffect,
} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createClassyStore, getInternal} from '../../core/core';
import {PROXYABLE} from '../../utils/internal/internal';
import {useClassyStore, useLocalStore} from './react';

class LifecycleStore {
  first = 'First';
  second = 'Second';
}

type Field = 'first' | 'second';

function useSelectedField(store: LifecycleStore, field: Field) {
  return useClassyStore(store, (state) => state[field]);
}

function useTrackedField(store: LifecycleStore, field: Field) {
  return useClassyStore(store)[field];
}

const modes = [
  {description: 'selector', useField: useSelectedField},
  {description: 'auto-tracked', useField: useTrackedField},
];

class NestedLifecycleStore extends LifecycleStore {
  static [PROXYABLE] = true;
}

const trackingShapes = [
  {
    description: 'plain object',
    createValue: () => ({first: 'First', second: 'Second'}),
  },
  {
    description: 'null-prototype object',
    createValue: () =>
      Object.assign(Object.create(null), {
        first: 'First',
        second: 'Second',
      }) as LifecycleStore,
  },
  {
    description: 'nested opted-in class',
    createValue: () => new NestedLifecycleStore(),
  },
];

const mountedRoots = new Map<Root, HTMLDivElement>();

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.set(root, container);
  act(() => root.render(element));
  return {root, container};
}

function unmount(root: Root) {
  const container = mountedRoots.get(root);
  act(() => root.unmount());
  container?.remove();
  mountedRoots.delete(root);
}

function subscriberCount(store: LifecycleStore) {
  const internal = getInternal(store);
  return internal.batchedListeners.size + internal.syncListeners.size;
}

function createSuspension() {
  let ready = false;
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    read() {
      if (!ready) throw promise;
    },
    resolve() {
      ready = true;
      resolve();
    },
  };
}

afterEach(() => {
  for (const root of mountedRoots.keys()) unmount(root);
});

describe('useClassyStore lifecycle', () => {
  test.each(
    trackingShapes,
  )('tracks nested conditional reads on a $description', async ({
    createValue,
  }) => {
    const store = createClassyStore({node: createValue()});
    const renderCount = mock(() => {});

    function Display({field}: {field: Field}) {
      const value = useClassyStore(store).node[field];
      renderCount();
      return <span>{value}</span>;
    }

    const {root, container} = mount(<Display field="first" />);
    renderCount.mockClear();
    await act(async () => {
      store.node.second = 'Hidden update';
    });
    expect(renderCount).not.toHaveBeenCalled();
    act(() => root.render(<Display field="second" />));
    expect(container.textContent).toBe('Hidden update');
    renderCount.mockClear();
    await act(async () => {
      store.node.first = 'Old selection';
    });
    expect(renderCount).not.toHaveBeenCalled();
    await act(async () => {
      store.node.second = 'Visible update';
    });
    expect(container.textContent).toBe('Visible update');
  });

  test.each(
    modes,
  )('cleans up StrictMode subscriptions and supports remounting ($description)', async ({
    useField,
  }) => {
    const store = createClassyStore(new LifecycleStore());

    function Display() {
      const value = useField(store, 'first');
      return <span>{value}</span>;
    }

    const {root, container} = mount(
      <StrictMode>
        <Display />
      </StrictMode>,
    );
    expect(subscriberCount(store)).toBe(1);
    await act(async () => {
      store.first = 'Updated';
    });
    expect(container.textContent).toBe('Updated');

    unmount(root);
    expect(subscriberCount(store)).toBe(0);
    store.first = 'While unmounted';

    const remount = mount(
      <StrictMode>
        <Display />
      </StrictMode>,
    );
    expect(remount.container.textContent).toBe('While unmounted');
    expect(subscriberCount(store)).toBe(1);
    unmount(remount.root);
    expect(subscriberCount(store)).toBe(0);
  });

  test.each(
    modes,
  )('switches store instances even when selected values are equal ($description)', async ({
    useField,
  }) => {
    const firstStore = createClassyStore(new LifecycleStore());
    const secondStore = createClassyStore(new LifecycleStore());
    const renderCount = mock(() => {});

    function Display({store}: {store: LifecycleStore}) {
      const value = useField(store, 'first');
      renderCount();
      return <span>{value}</span>;
    }

    const {root, container} = mount(<Display store={firstStore} />);
    act(() => root.render(<Display store={secondStore} />));
    expect(container.textContent).toBe('First');
    expect(subscriberCount(firstStore)).toBe(0);
    expect(subscriberCount(secondStore)).toBe(1);
    renderCount.mockClear();

    await act(async () => {
      firstStore.first = 'Old store';
    });
    expect(renderCount).not.toHaveBeenCalled();
    expect(container.textContent).toBe('First');

    await act(async () => {
      secondStore.first = 'New store';
    });
    expect(container.textContent).toBe('New store');
  });

  test.each(
    modes,
  )('tracks the currently rendered conditional property ($description)', async ({
    useField,
  }) => {
    const store = createClassyStore(new LifecycleStore());
    const renderCount = mock(() => {});

    function Display({field}: {field: Field}) {
      const value = useField(store, field);
      renderCount();
      return <span>{value}</span>;
    }

    const {root, container} = mount(<Display field="first" />);
    renderCount.mockClear();
    await act(async () => {
      store.second = 'Changed while hidden';
    });
    expect(renderCount).not.toHaveBeenCalled();

    act(() => root.render(<Display field="second" />));
    expect(container.textContent).toBe('Changed while hidden');
    renderCount.mockClear();
    await act(async () => {
      store.first = 'No longer read';
    });
    expect(renderCount).not.toHaveBeenCalled();

    await act(async () => {
      store.second = 'Current property';
    });
    expect(container.textContent).toBe('Current property');
  });

  test.each(
    modes,
  )('keeps the committed selection live while a transition suspends ($description)', async ({
    useField,
  }) => {
    const store = createClassyStore(new LifecycleStore());
    const suspension = createSuspension();
    const attemptedFields = mock((_field: Field) => {});

    function Display({field}: {field: Field}) {
      const value = useField(store, field);
      attemptedFields(field);
      if (field === 'second') suspension.read();
      return <span>{value}</span>;
    }

    const {root, container} = mount(
      <Suspense fallback="Loading">
        <Display field="first" />
      </Suspense>,
    );
    await act(async () => {
      startTransition(() => {
        root.render(
          <Suspense fallback="Loading">
            <Display field="second" />
          </Suspense>,
        );
      });
    });
    expect(attemptedFields).toHaveBeenCalledWith('second');
    expect(container.textContent).toBe('First');

    await act(async () => {
      store.first = 'Committed update';
    });
    expect(container.textContent).toBe('Committed update');
    await act(async () => {
      store.second = 'Pending update';
    });
    expect(container.textContent).toBe('Committed update');

    await act(async () => suspension.resolve());
    expect(container.textContent).toBe('Pending update');
    expect(subscriberCount(store)).toBe(1);
  });

  test.each(
    modes,
  )('discards reads from an abandoned suspended render ($description)', async ({
    useField,
  }) => {
    const store = createClassyStore(new LifecycleStore());
    const suspension = createSuspension();
    const renderCount = mock(() => {});

    function Display({field}: {field: Field}) {
      const value = useField(store, field);
      renderCount();
      if (field === 'second') suspension.read();
      return <span>{value}</span>;
    }

    const {root, container} = mount(
      <Suspense fallback="Loading">
        <Display field="first" />
      </Suspense>,
    );
    await act(async () => {
      startTransition(() => {
        root.render(
          <Suspense fallback="Loading">
            <Display field="second" />
          </Suspense>,
        );
      });
    });
    act(() => {
      root.render(
        <Suspense fallback="Loading">
          <Display field="first" />
        </Suspense>,
      );
    });
    renderCount.mockClear();
    await act(async () => {
      store.second = 'Abandoned branch';
    });
    expect(renderCount).not.toHaveBeenCalled();
    expect(container.textContent).toBe('First');

    await act(async () => suspension.resolve());
    await act(async () => {
      store.first = 'Still subscribed';
    });
    expect(container.textContent).toBe('Still subscribed');
  });

  test.each(
    modes,
  )('reads the latest state when an initial suspended mount resumes ($description)', async ({
    useField,
  }) => {
    const store = createClassyStore(new LifecycleStore());
    const suspension = createSuspension();

    function Display() {
      const value = useField(store, 'first');
      suspension.read();
      return <span>{value}</span>;
    }

    const {container} = mount(
      <Suspense fallback="Loading">
        <Display />
      </Suspense>,
    );
    expect(container.textContent).toBe('Loading');
    expect(subscriberCount(store)).toBe(0);
    store.first = 'Before commit';
    await act(async () => suspension.resolve());
    expect(container.textContent).toBe('Before commit');
    expect(subscriberCount(store)).toBe(1);
  });
});

describe('useLocalStore lifecycle', () => {
  test.each(
    modes,
  )('isolates mounted instances and replaces state on a keyed remount ($description)', async ({
    useField,
  }) => {
    const stores = new Map<string, LifecycleStore>();

    function Display({id, label}: {id: string; label: string}) {
      const store = useLocalStore(() => new LifecycleStore());
      const value = useField(store, 'first');
      useEffect(() => {
        stores.set(id, store);
        return () => {
          stores.delete(id);
        };
      }, [id, store]);
      return (
        <span>
          {label}:{value}|
        </span>
      );
    }

    const {root, container} = mount(
      <StrictMode>
        <Display key="first" id="first" label="A" />
        <Display key="second" id="second" label="B" />
      </StrictMode>,
    );
    const firstStore = stores.get('first');
    const secondStore = stores.get('second');
    expect(firstStore).toBeDefined();
    expect(secondStore).toBeDefined();
    expect(firstStore).not.toBe(secondStore);
    if (!firstStore || !secondStore) throw new Error('Stores did not mount');

    await act(async () => {
      firstStore.first = 'Local update';
    });
    expect(container.textContent).toBe('A:Local update|B:First|');
    act(() => {
      root.render(
        <StrictMode>
          <Display key="first" id="first" label="Updated A" />
          <Display key="new-second" id="second" label="New B" />
        </StrictMode>,
      );
    });
    expect(stores.get('first')).toBe(firstStore);
    expect(stores.get('second')).not.toBe(secondStore);
    expect(container.textContent).toBe('Updated A:Local update|New B:First|');
    expect(subscriberCount(secondStore)).toBe(0);
    unmount(root);
    expect(stores.size).toBe(0);
    expect(subscriberCount(firstStore)).toBe(0);
  });
});
