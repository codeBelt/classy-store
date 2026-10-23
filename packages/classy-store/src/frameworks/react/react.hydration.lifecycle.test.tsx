import {afterEach, describe, expect, mock, test} from 'bun:test';
import {act, useEffect} from 'react';
import {createRoot, hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {createClassyStore, getInternal} from '../../core/core';
import type {Snapshot} from '../../types';
import {useClassyStore} from './react';
import {prepareStoreForHydration} from './server';
import {DelayedHydrationView} from './testHelpers/delayedHydrationView/DelayedHydrationView';
import type {HydrationStore} from './testHelpers/hydration.types';

class HydrationQaStore {
  loaded: {label: string} | null = null;

  constructor(
    public name: string,
    public count = 1,
    public details = {label: 'initial'},
    public date = new Date('2020-01-01T00:00:00.000Z'),
  ) {}

  get summary() {
    return `${this.name}:${this.count}:${this.details.label}`;
  }
}

type Selection = {label: string};
type Selector = (state: Snapshot<HydrationQaStore>) => Selection;

const selectName: Selector = (state) => ({label: state.name});

type HydrationQaViewProps = {
  store: HydrationQaStore;
  selector?: Selector;
  isEqual?: (previous: Selection, next: Selection) => boolean;
  onRead?: (value: Selection) => void;
  onCommit?: (value: Selection) => void;
};

function HydrationQaView({
  store,
  selector = selectName,
  isEqual,
  onRead,
  onCommit,
}: HydrationQaViewProps) {
  const value = useClassyStore(store, selector, {isEqual});
  onRead?.(value);
  useEffect(() => onCommit?.(value), [onCommit, value]);
  return <span>{value.label}</span>;
}

const mounted = new Map<Root, HTMLDivElement>();

function createContainer(html = '') {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

afterEach(async () => {
  for (const [root, container] of mounted) {
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.clear();
});

describe('prepareStoreForHydration lifecycle', () => {
  test('validates proxies, preserves identity, and does not subscribe', () => {
    expect(() =>
      prepareStoreForHydration(new HydrationQaStore('invalid')),
    ).toThrow('object is not a store proxy');
    const store = createClassyStore(new HydrationQaStore('initial'));
    const internal = getInternal(store);

    expect(prepareStoreForHydration(store)).toBe(store);
    expect(internal.syncListeners.size).toBe(0);
    expect(internal.batchedListeners.size).toBe(0);

    store.name = 'live';
    expect(prepareStoreForHydration(store)).toBe(store);
    expect(renderToString(<HydrationQaView store={store} />)).toBe(
      '<span>initial</span>',
    );
    expect(store.name).toBe('live');
  });

  test('uses live values on a client-only mount even after preparation', async () => {
    const store = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('initial')),
    );
    store.name = 'current';
    const reads = mock((value: Selection) => value);
    const container = createContainer();
    const root = createRoot(container);
    mounted.set(root, container);

    await act(async () => {
      root.render(<HydrationQaView store={store} onRead={reads} />);
    });

    expect(container.textContent).toBe('current');
    expect(reads.mock.calls.every(([value]) => value.label === 'current')).toBe(
      true,
    );
    act(() => {
      store.name = 'edited';
    });
    expect(container.textContent).toBe('edited');
  });

  test('keeps nested data, getters, and replaced native leaves at their captured values for hydration', async () => {
    const selector: Selector = (state) => ({
      label: `${state.summary}:${state.date.getUTCFullYear()}`,
    });
    const serverStore = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('server')),
    );
    const clientStore = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('server')),
    );
    const container = createContainer(
      renderToString(
        <HydrationQaView store={serverStore} selector={selector} />,
      ),
    );
    const element = container.firstElementChild;
    clientStore.name = 'live';
    clientStore.count = 8;
    clientStore.details.label = 'changed';
    clientStore.date = new Date('2026-01-01T00:00:00.000Z');
    const reads = mock((value: Selection) => value);
    const onRecoverableError = mock(() => {});

    await act(async () => {
      const root = hydrateRoot(
        container,
        <HydrationQaView
          store={clientStore}
          selector={selector}
          onRead={reads}
        />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.firstElementChild).toBe(element);
    expect(reads.mock.calls[0][0].label).toBe('server:1:initial:2020');
    expect(container.textContent).toBe('live:8:changed:2026');
    expect(serverStore.summary).toBe('server:1:initial');
  });

  test('never evaluates a selector against initial data on a client-only mount', async () => {
    const store = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('initial')),
    );
    store.loaded = {label: 'loaded'};
    const selector: Selector = (state) => {
      if (!state.loaded) throw new Error('Selector read unloaded initial data');
      return {label: state.loaded.label};
    };
    const container = createContainer();
    const root = createRoot(container);
    mounted.set(root, container);

    await act(async () => {
      root.render(<HydrationQaView store={store} selector={selector} />);
    });
    expect(container.textContent).toBe('loaded');
  });

  test('reselects current state when selectors, equality, and prepared stores change after hydration', async () => {
    const firstStore = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('first')),
    );
    const secondStore = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('second', 2)),
    );
    const container = createContainer(
      renderToString(<HydrationQaView store={firstStore} />),
    );
    const onRecoverableError = mock(() => {});
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(container, <HydrationQaView store={firstStore} />, {
        onRecoverableError,
      });
      mounted.set(root, container);
    });

    act(() => {
      firstStore.name = 'first live';
      secondStore.name = 'second live';
      secondStore.count = 9;
    });
    expect(container.textContent).toBe('first live');
    const equalLabels = (previous: Selection, next: Selection) =>
      previous.label === next.label;
    await act(async () => {
      root.render(
        <HydrationQaView
          store={secondStore}
          selector={(state) => ({label: `${state.name}:${state.count}`})}
          isEqual={equalLabels}
        />,
      );
    });

    expect(container.textContent).toBe('second live:9');
    expect(getInternal(firstStore).syncListeners.size).toBe(0);
    expect(getInternal(secondStore).syncListeners.size).toBe(1);
    await act(async () => {
      root.render(
        <HydrationQaView
          store={secondStore}
          selector={(state) => ({label: `${state.count}`})}
          isEqual={Object.is}
        />,
      );
    });
    expect(container.textContent).toBe('9');
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  test('retains initial data for a second root hydrated after the first root updates', async () => {
    const serverStore = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('initial')),
    );
    const clientStore = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('initial')),
    );
    const html = renderToString(<HydrationQaView store={serverStore} />);
    const firstContainer = createContainer(html);
    const secondContainer = createContainer(html);
    const secondElement = secondContainer.firstElementChild;
    const onRecoverableError = mock(() => {});
    await act(async () => {
      const root = hydrateRoot(
        firstContainer,
        <HydrationQaView store={clientStore} />,
        {onRecoverableError},
      );
      mounted.set(root, firstContainer);
    });
    act(() => {
      clientStore.name = 'updated';
    });
    expect(firstContainer.textContent).toBe('updated');
    expect(secondContainer.textContent).toBe('initial');

    const reads = mock((value: Selection) => value);
    await act(async () => {
      const root = hydrateRoot(
        secondContainer,
        <HydrationQaView store={clientStore} onRead={reads} />,
        {onRecoverableError},
      );
      mounted.set(root, secondContainer);
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(secondContainer.firstElementChild).toBe(secondElement);
    expect(reads.mock.calls[0][0].label).toBe('initial');
    expect(secondContainer.textContent).toBe('updated');
    expect(getInternal(clientStore).syncListeners.size).toBe(2);
  });

  test('does not affect an unprepared request store', () => {
    const prepared = prepareStoreForHydration(
      createClassyStore(new HydrationQaStore('prepared initial')),
    );
    const unprepared = createClassyStore(new HydrationQaStore('request'));
    prepared.name = 'prepared live';
    unprepared.name = 'request live';

    expect(renderToString(<HydrationQaView store={prepared} />)).toBe(
      '<span>prepared initial</span>',
    );
    expect(renderToString(<HydrationQaView store={unprepared} />)).toBe(
      '<span>request live</span>',
    );
  });

  test.each([
    {
      description: 'prepared unchanged state with custom equality',
      prepare: true,
      update: false,
      equality: true,
    },
    {
      description: 'prepared unchanged state with default equality',
      prepare: true,
      update: false,
      equality: false,
    },
    {
      description: 'prepared unselected changes',
      prepare: true,
      update: true,
      equality: true,
    },
    {
      description: 'unprepared unchanged state',
      prepare: false,
      update: false,
      equality: true,
    },
  ])('retains equal selection identity across hydration for $description', async ({
    prepare,
    update,
    equality,
  }) => {
    const serverStore = createClassyStore(new HydrationQaStore('initial'));
    const clientStore = createClassyStore(new HydrationQaStore('initial'));
    if (prepare) {
      prepareStoreForHydration(serverStore);
      prepareStoreForHydration(clientStore);
    }
    if (update) clientStore.count++;
    const container = createContainer(
      renderToString(<HydrationQaView store={serverStore} />),
    );
    const onCommit = mock((_value: Selection) => {});
    const isEqual = (previous: Selection, next: Selection) =>
      previous.label === next.label;
    const onRecoverableError = mock(() => {});
    await act(async () => {
      const root = hydrateRoot(
        container,
        <HydrationQaView
          store={clientStore}
          isEqual={equality ? isEqual : undefined}
          onCommit={onCommit}
        />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe('initial');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test('retains tracked snapshot identity when only unread state changes before hydration', async () => {
    const serverStore = prepareStoreForHydration(
      createClassyStore({user: {name: 'initial'}, count: 1}),
    );
    const clientStore = prepareStoreForHydration(
      createClassyStore({user: {name: 'initial'}, count: 1}),
    );
    const onCommit = mock((_state: Snapshot<HydrationStore>) => {});
    const gate = {read() {}, release() {}};
    const onValueCommit = () => {};
    function useTrackedName(store: HydrationStore) {
      const state = useClassyStore(store);
      useEffect(() => onCommit(state), [state]);
      return state.user.name;
    }
    const container = createContainer(
      renderToString(
        <DelayedHydrationView
          gate={gate}
          store={serverStore}
          useValue={useTrackedName}
          onCommit={onValueCommit}
        />,
      ),
    );
    clientStore.count++;
    const onRecoverableError = mock(() => {});
    await act(async () => {
      const root = hydrateRoot(
        container,
        <DelayedHydrationView
          gate={gate}
          store={clientStore}
          useValue={useTrackedName}
          onCommit={onValueCommit}
        />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe('initial');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
