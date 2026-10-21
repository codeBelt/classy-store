import {afterEach, describe, expect, mock, test} from 'bun:test';
import {act, useEffect} from 'react';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {createClassyStore} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {persist} from '../../utils/persist/persist';
import {createStoreHook, useClassyStore} from './react';

class RequestStore {
  constructor(
    public user: {name: string},
    public count = 0,
  ) {}

  increment() {
    this.count++;
  }
}

type HydrationViewProps = {
  store: RequestStore;
  useBoundStore: ReturnType<typeof createStoreHook<RequestStore>>;
  onMount?: () => undefined | (() => void);
};

function HydrationView({store, useBoundStore, onMount}: HydrationViewProps) {
  const tracked = useClassyStore(store);
  const selected = useClassyStore(
    store,
    (state) => `${state.user.name}:${state.count}`,
  );
  const bound = useBoundStore((state) => state.count);
  useEffect(() => onMount?.(), [onMount]);

  return (
    <main>
      <span>{`${tracked.user.name}:${tracked.count}`}</span>
      <span>{selected}</span>
      <span>{bound}</span>
    </main>
  );
}

const mounted: {root: Root; container: HTMLDivElement}[] = [];

afterEach(async () => {
  for (const {root, container} of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

function renderRequest(store: RequestStore): string {
  return renderToString(
    <HydrationView store={store} useBoundStore={createStoreHook(store)} />,
  );
}

describe('React server rendering and hydration', () => {
  test('keeps server requests isolated', () => {
    const firstRequest = createClassyStore(
      new RequestStore({name: 'Alice'}, 2),
    );
    const secondRequest = createClassyStore(new RequestStore({name: 'Bob'}, 7));

    const firstHtml = renderRequest(firstRequest);
    const secondHtml = renderRequest(secondRequest);
    firstRequest.user.name = 'Updated Alice';
    firstRequest.increment();

    expect(firstHtml).toContain('Alice:2');
    expect(secondHtml).toContain('Bob:7');
    expect(renderRequest(secondRequest)).toBe(secondHtml);
    expect(secondRequest.count).toBe(7);
    expect(secondRequest.user.name).toBe('Bob');
  });

  test('hydrates serialized initial data without replacing server DOM', async () => {
    const serverStore = createClassyStore(new RequestStore({name: 'Alice'}, 2));
    const initialData = JSON.stringify(snapshot(serverStore));
    const container = document.createElement('div');
    container.innerHTML = renderRequest(serverStore);
    document.body.appendChild(container);
    const serverElement = container.firstElementChild;

    const parsed: {user: {name: string}; count: number} =
      JSON.parse(initialData);
    const clientStore = createClassyStore(
      new RequestStore(parsed.user, parsed.count),
    );
    const onRecoverableError = mock(() => {});

    await act(async () => {
      const root = hydrateRoot(
        container,
        <HydrationView
          store={clientStore}
          useBoundStore={createStoreHook(clientStore)}
        />,
        {onRecoverableError},
      );
      mounted.push({root, container});
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.firstElementChild).toBe(serverElement);
    expect(container.textContent).toBe('Alice:2Alice:22');

    act(() => {
      clientStore.user.name = 'Alicia';
      clientStore.increment();
    });

    expect(container.textContent).toBe('Alicia:3Alicia:33');
    expect(serverStore.user.name).toBe('Alice');
    expect(serverStore.count).toBe(2);
  });

  test('defers persisted data until after hydration and cleans up on unmount', async () => {
    const serverStore = createClassyStore(
      new RequestStore({name: 'Server'}, 1),
    );
    const clientStore = createClassyStore(
      new RequestStore({name: 'Server'}, 1),
    );
    const container = document.createElement('div');
    container.innerHTML = renderRequest(serverStore);
    document.body.appendChild(container);
    const serverElement = container.firstElementChild;
    const onRecoverableError = mock(() => {});

    let resolveSavedState: (value: string) => void = () => {};
    const savedState = new Promise<string>((resolve) => {
      resolveSavedState = resolve;
    });
    const storage = {
      getItem: mock(() => savedState),
      setItem: mock(() => {}),
      removeItem: mock(() => {}),
    };
    let rehydration: Promise<void> | undefined;
    const onMount = () => {
      const persistence = persist(clientStore, {
        name: 'request-store',
        storage,
        skipHydration: true,
      });
      rehydration = persistence.rehydrate();
      return () => persistence.unsubscribe();
    };

    expect(storage.getItem).not.toHaveBeenCalled();
    await act(async () => {
      const root = hydrateRoot(
        container,
        <HydrationView
          store={clientStore}
          useBoundStore={createStoreHook(clientStore)}
          onMount={onMount}
        />,
        {onRecoverableError},
      );
      mounted.push({root, container});
    });

    expect(container.firstElementChild).toBe(serverElement);
    expect(container.textContent).toBe('Server:1Server:11');
    expect(storage.getItem).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSavedState(
        JSON.stringify({version: 0, state: {user: {name: 'Saved'}, count: 8}}),
      );
      await rehydration;
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe('Saved:8Saved:88');
    expect(storage.setItem).not.toHaveBeenCalled();

    await act(async () => mounted[0].root.unmount());
    mounted.splice(0);
    container.remove();
    clientStore.increment();
    await Promise.resolve();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
