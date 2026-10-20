import {afterEach, describe, expect, mock, test} from 'bun:test';
import {act, Suspense, useEffect} from 'react';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {createClassyStore, getInternal} from '../../core/core';
import {persist} from '../../utils/persist/persist';
import {
  createStoreHook,
  prepareStoreForHydration,
  useClassyStore,
} from './react';
import {DelayedHydrationView} from './testHelpers/delayedHydrationView/DelayedHydrationView';
import type {
  HydrationGate,
  HydrationStore,
  UseHydrationValue,
} from './testHelpers/hydration.types';

function createGate(initiallyReady = false): HydrationGate {
  let ready = initiallyReady;
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    read() {
      if (!ready) throw promise;
    },
    release() {
      ready = true;
      resolve();
    },
  };
}

function useSelectedValue(store: HydrationStore) {
  return useClassyStore(store, (state) => `${state.user.name}:${state.count}`);
}

function useTrackedValue(store: HydrationStore) {
  const state = useClassyStore(store);
  return `${state.user.name}:${state.count}`;
}

const modes: {
  description: string;
  createReader: (store: HydrationStore) => UseHydrationValue;
}[] = [
  {description: 'direct selector', createReader: () => useSelectedValue},
  {description: 'direct auto-tracking', createReader: () => useTrackedValue},
  {
    description: 'bound selector',
    createReader: (store) => {
      const useStore = createStoreHook(store);
      return () => useStore((state) => `${state.user.name}:${state.count}`);
    },
  },
  {
    description: 'bound auto-tracking',
    createReader: (store) => {
      const useStore = createStoreHook(store);
      return () => {
        const state = useStore();
        return `${state.user.name}:${state.count}`;
      };
    },
  },
];

type HydrationShellProps = {
  gate: HydrationGate;
  store: HydrationStore;
  useValue: UseHydrationValue;
  onCommit: (value: string) => void;
  onMount?: () => undefined | (() => void);
};

function HydrationShell({
  gate,
  store,
  useValue,
  onCommit,
  onMount,
}: HydrationShellProps) {
  useEffect(() => onMount?.(), [onMount]);
  return (
    <main>
      <p>Request shell</p>
      <Suspense fallback={<span>Loading</span>}>
        <DelayedHydrationView
          gate={gate}
          store={store}
          useValue={useValue}
          onCommit={onCommit}
        />
      </Suspense>
    </main>
  );
}

const mounted = new Map<Root, HTMLDivElement>();

afterEach(async () => {
  for (const [root, container] of mounted) {
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.clear();
});

describe('React delayed Suspense hydration', () => {
  test.each(
    modes,
  )('preserves server content when persistence updates before the first $description read', async ({
    createReader,
  }) => {
    const serverStore = prepareStoreForHydration(
      createClassyStore({user: {name: 'Server'}, count: 1}),
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <HydrationShell
        gate={createGate(true)}
        store={serverStore}
        useValue={createReader(serverStore)}
        onCommit={() => {}}
      />,
    );
    document.body.appendChild(container);
    const serverElement = container.querySelector('[data-hydration-value]');
    expect(serverElement?.textContent).toBe('Server:1');

    const clientStore = prepareStoreForHydration(
      createClassyStore({user: {name: 'Server'}, count: 1}),
    );
    const gate = createGate();
    const onCommit = mock((value: string) => value);
    const onRecoverableError = mock(() => {});
    const storage = {
      getItem: mock(async () =>
        JSON.stringify({version: 0, state: {user: {name: 'Saved'}, count: 8}}),
      ),
      setItem: mock(() => {}),
      removeItem: mock(() => {}),
    };
    const persistence = persist(clientStore, {
      name: 'delayed-request',
      storage,
      skipHydration: true,
    });
    let rehydration: Promise<void> | undefined;
    const onMount = () => {
      rehydration = persistence.rehydrate();
      return () => persistence.unsubscribe();
    };

    let root!: Root;
    await act(async () => {
      root = hydrateRoot(
        container,
        <HydrationShell
          gate={gate}
          store={clientStore}
          useValue={createReader(clientStore)}
          onCommit={onCommit}
          onMount={onMount}
        />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });
    await act(async () => {
      await rehydration;
    });

    // The shell has committed and persisted state has arrived, but the child
    // has never read its store and the boundary still shows untouched SSR DOM.
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(clientStore.user.name).toBe('Saved');
    expect(clientStore.count).toBe(8);
    // Repeated setup must not replace the snapshot already used by the server.
    expect(prepareStoreForHydration(clientStore)).toBe(clientStore);
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.querySelector('[data-hydration-value]')).toBe(
      serverElement,
    );
    expect(serverElement?.textContent).toBe('Server:1');

    await act(async () => {
      gate.release();
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-hydration-value]')).toBe(
      serverElement,
    );
    expect(serverElement?.textContent).toBe('Saved:8');
    expect(onCommit.mock.calls.map(([value]) => value)).toEqual([
      'Server:1',
      'Saved:8',
    ]);
    expect(getInternal(clientStore).syncListeners.size).toBe(1);
    expect(getInternal(clientStore).batchedListeners.size).toBe(1);
    expect(storage.setItem).not.toHaveBeenCalled();

    await act(async () => {
      clientStore.user.name = 'Edited';
      clientStore.count = 9;
    });
    expect(serverElement?.textContent).toBe('Edited:9');
    expect(serverStore.user.name).toBe('Server');
    expect(serverStore.count).toBe(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    const commitsBeforeUnmount = onCommit.mock.calls.length;
    await act(async () => root.unmount());
    mounted.delete(root);
    container.remove();
    expect(getInternal(clientStore).syncListeners.size).toBe(0);
    expect(getInternal(clientStore).batchedListeners.size).toBe(0);
    clientStore.count++;
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(commitsBeforeUnmount);
  });
});
