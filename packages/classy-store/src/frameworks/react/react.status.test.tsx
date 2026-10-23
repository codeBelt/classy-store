import {afterEach, describe, expect, mock, test} from 'bun:test';
import {act, StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {createClassyStore} from '../../core/core';
import {persist, withHistory} from '../../utils/index';
import {HistoryStatusView} from './testHelpers/historyStatusView/HistoryStatusView';
import {PersistStatusView} from './testHelpers/persistStatusView/PersistStatusView';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function mountContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  cleanups.push(() => container.remove());
  return container;
}

describe('useHistoryStatus', () => {
  test('renders history availability and pause changes without subscribing to store data', async () => {
    const store = createClassyStore({count: 0});
    const history = withHistory(store);
    cleanups.push(history.dispose);
    const container = mountContainer();
    const root = createRoot(container);
    cleanups.push(() => act(() => root.unmount()));
    act(() => root.render(<HistoryStatusView handle={history} />));
    expect(JSON.parse(container.textContent ?? '').canUndo).toBe(false);
    await act(async () => {
      store.count++;
    });
    expect(JSON.parse(container.textContent ?? '').canUndo).toBe(true);
    act(() => history.pause());
    expect(JSON.parse(container.textContent ?? '').isPaused).toBe(true);
    act(() => history.resume());
    await act(async () => history.undo());
    expect(JSON.parse(container.textContent ?? '')).toMatchObject({
      canUndo: false,
      canRedo: true,
      isPaused: false,
    });
    act(() => history.dispose());
    expect(JSON.parse(container.textContent ?? '').isDisposed).toBe(true);
  });

  test('switches sources and cleans up subscriptions under Strict Mode', () => {
    const first = withHistory(createClassyStore({count: 0}));
    const second = withHistory(createClassyStore({count: 0}));
    cleanups.push(first.dispose, second.dispose);
    let subscriptions = 0;
    const observed = {
      ...first,
      subscribe(listener: () => void) {
        subscriptions++;
        const stop = first.subscribe(listener);
        return () => {
          subscriptions--;
          stop();
        };
      },
    };
    const container = mountContainer();
    const root = createRoot(container);
    act(() =>
      root.render(
        <StrictMode>
          <HistoryStatusView handle={observed} />
        </StrictMode>,
      ),
    );
    expect(subscriptions).toBe(1);
    act(() =>
      root.render(
        <StrictMode>
          <HistoryStatusView handle={second} />
        </StrictMode>,
      ),
    );
    expect(subscriptions).toBe(0);
    act(() => first.pause());
    expect(JSON.parse(container.textContent ?? '').isPaused).toBe(false);
    act(() => second.pause());
    expect(JSON.parse(container.textContent ?? '').isPaused).toBe(true);
    act(() =>
      root.render(
        <StrictMode>
          <HistoryStatusView handle={observed} />
        </StrictMode>,
      ),
    );
    expect(subscriptions).toBe(1);
    act(() => root.unmount());
    expect(subscriptions).toBe(0);
  });

  test('hydrates initial status then catches up when the handle changes before hydration', async () => {
    const server = withHistory(createClassyStore({count: 0}));
    const client = withHistory(createClassyStore({count: 0}));
    cleanups.push(server.dispose, client.dispose);
    const container = mountContainer();
    container.innerHTML = renderToString(<HistoryStatusView handle={server} />);
    const originalOutput = container.firstChild;
    client.pause();
    const recoverable = mock(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <HistoryStatusView handle={client} />, {
        onRecoverableError: recoverable,
      });
    });
    cleanups.push(() => act(() => root.unmount()));
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.firstChild).toBe(originalOutput);
    expect(JSON.parse(container.textContent ?? '').isPaused).toBe(true);
  });
});

describe('usePersistStatus', () => {
  function createPersistence() {
    const handle = persist(createClassyStore({count: 0}), {
      name: 'status-lifecycle',
      skipHydration: true,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
    cleanups.push(handle.dispose);
    return handle;
  }

  test('switches handles and cleans up subscriptions under Strict Mode', async () => {
    const first = createPersistence();
    const second = createPersistence();
    let subscriptions = 0;
    const observed = {
      ...first,
      subscribe(listener: () => void) {
        subscriptions++;
        const stop = first.subscribe(listener);
        return () => {
          subscriptions--;
          stop();
        };
      },
    };
    const container = mountContainer();
    const root = createRoot(container);
    act(() =>
      root.render(
        <StrictMode>
          <PersistStatusView handle={observed} />
        </StrictMode>,
      ),
    );
    expect(subscriptions).toBe(1);
    act(() =>
      root.render(
        <StrictMode>
          <PersistStatusView handle={second} />
        </StrictMode>,
      ),
    );
    expect(subscriptions).toBe(0);
    await act(async () => first.rehydrate());
    expect(JSON.parse(container.textContent ?? '').isHydrated).toBe(false);
    await act(async () => second.rehydrate());
    expect(JSON.parse(container.textContent ?? '').isHydrated).toBe(true);
    act(() =>
      root.render(
        <StrictMode>
          <PersistStatusView handle={observed} />
        </StrictMode>,
      ),
    );
    expect(subscriptions).toBe(1);
    act(() => root.unmount());
    expect(subscriptions).toBe(0);
  });

  test('hydrates initial status then catches up when persistence settles before hydration', async () => {
    const server = createPersistence();
    const client = createPersistence();
    const container = mountContainer();
    container.innerHTML = renderToString(<PersistStatusView handle={server} />);
    const originalOutput = container.firstChild;
    await client.rehydrate();
    const recoverable = mock(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <PersistStatusView handle={client} />, {
        onRecoverableError: recoverable,
      });
    });
    cleanups.push(() => act(() => root.unmount()));
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.firstChild).toBe(originalOutput);
    expect(JSON.parse(container.textContent ?? '').isHydrated).toBe(true);
  });

  test('renders hydration, storage failure and recovery without a data mutation', async () => {
    let failing = true;
    const handle = persist(createClassyStore({count: 0}), {
      name: 'status',
      skipHydration: true,
      storage: {
        getItem: () => null,
        setItem: () => {
          if (failing) throw new Error('quota');
        },
        removeItem: () => {},
      },
    });
    cleanups.push(handle.dispose);
    const container = mountContainer();
    const root = createRoot(container);
    cleanups.push(() => act(() => root.unmount()));
    act(() => root.render(<PersistStatusView handle={handle} />));
    expect(JSON.parse(container.textContent ?? '').isHydrated).toBe(false);
    await act(async () => handle.rehydrate());
    expect(JSON.parse(container.textContent ?? '').isHydrated).toBe(true);
    await act(async () => {
      await expect(handle.save()).rejects.toThrow('quota');
    });
    expect(JSON.parse(container.textContent ?? '').lastError.operation).toBe(
      'write',
    );
    failing = false;
    await act(async () => handle.save());
    expect(JSON.parse(container.textContent ?? '').lastError).toBeNull();
  });
});
