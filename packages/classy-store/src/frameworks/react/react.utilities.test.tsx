import {afterEach, beforeEach, describe, expect, mock, test} from 'bun:test';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {
  type ReactiveMap,
  type ReactiveSet,
  reactiveMap,
  reactiveSet,
} from '../../collections/index';
import {createClassyStore, snapshot, subscribe} from '../../index';
import {
  devtools,
  type PersistOptions,
  persist,
  withHistory,
} from '../../utils/index';
import {UtilityValue} from './testHelpers/utilityValue/UtilityValue';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const cleanups: Array<() => void> = [];
let previousExtension: Window['__REDUX_DEVTOOLS_EXTENSION__'];

function disposeAll() {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
}

beforeEach(() => {
  previousExtension = window.__REDUX_DEVTOOLS_EXTENSION__;
});

afterEach(async () => {
  disposeAll();
  await flush();
  if (previousExtension) {
    window.__REDUX_DEVTOOLS_EXTENSION__ = previousExtension;
  } else {
    delete window.__REDUX_DEVTOOLS_EXTENSION__;
  }
});

function createStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (name: string) => data.get(name) ?? null,
    setItem: mock((name: string, value: string) => {
      data.set(name, value);
    }),
    removeItem: (name: string) => {
      data.delete(name);
    },
  };
}

function installDevtools() {
  type Extension = NonNullable<Window['__REDUX_DEVTOOLS_EXTENSION__']>;
  type Connection = ReturnType<Extension['connect']>;
  type Listener = Parameters<Connection['subscribe']>[0];
  let listener: Listener | undefined;
  const unsubscribe = mock(() => {
    listener = undefined;
  });
  const connection = {
    init: mock((_state: unknown) => {}),
    send: mock((_action: string | {type: string}, _state: unknown) => {}),
    subscribe: (nextListener: Listener) => {
      listener = nextListener;
      return unsubscribe;
    },
  };
  window.__REDUX_DEVTOOLS_EXTENSION__ = {connect: () => connection};
  return {
    connection,
    unsubscribe,
    jumpTo(state: {count: number}) {
      if (!listener) throw new Error('DevTools must be connected');
      listener({
        type: 'DISPATCH',
        payload: {type: 'JUMP_TO_STATE'},
        state: JSON.stringify(state),
      });
    },
  };
}

describe('core and React utility happy paths', () => {
  test('persists edits, undo and redo, then restores the final state in a new store', async () => {
    const storage = createStorage();
    const store = createClassyStore({count: 0});
    const persistence = persist(store, {name: 'draft', storage});
    cleanups.push(persistence.unsubscribe);
    await persistence.hydrated;
    const history = withHistory(store);
    cleanups.push(history.dispose);

    store.count = 1;
    await flush();
    expect(JSON.parse(storage.data.get('draft') ?? '').state.count).toBe(1);

    history.undo();
    await flush();
    expect(store.count).toBe(0);
    expect(JSON.parse(storage.data.get('draft') ?? '').state.count).toBe(0);

    history.redo();
    await flush();
    expect(store.count).toBe(1);
    expect(JSON.parse(storage.data.get('draft') ?? '').state.count).toBe(1);
    disposeAll();

    const restored = createClassyStore({count: 0});
    const restoredPersistence = persist(restored, {name: 'draft', storage});
    cleanups.push(restoredPersistence.unsubscribe);
    await restoredPersistence.hydrated;
    expect(restored.count).toBe(1);
  });

  test('sends edits to DevTools and renders time-travel state in React', async () => {
    const extension = installDevtools();
    const store = createClassyStore({count: 0});
    cleanups.push(devtools(store));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    cleanups.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    act(() => root.render(<UtilityValue store={store} />));
    expect(container.textContent).toBe('0');
    expect(extension.connection.init).toHaveBeenCalledWith({count: 0});

    await act(async () => {
      store.count = 3;
    });
    expect(container.textContent).toBe('3');
    expect(extension.connection.send).toHaveBeenCalledWith(
      {type: 'STORE_UPDATE'},
      {count: 3},
    );
    extension.connection.send.mockClear();

    await act(async () => extension.jumpTo({count: 1}));
    expect(store.count).toBe(1);
    expect(container.textContent).toBe('1');
    expect(extension.connection.send).not.toHaveBeenCalled();
  });

  test('restores reactive Map and Set transforms and keeps subsequent edits reactive', async () => {
    const storage = createStorage();
    const createStore = () =>
      createClassyStore({
        users: reactiveMap<string, string>(),
        tags: reactiveSet<string>(),
      });
    const store = createStore();
    const options: PersistOptions<typeof store> = {
      name: 'collections',
      storage,
      properties: [
        {
          key: 'users',
          serialize: (value) =>
            Array.from((value as ReactiveMap<string, string>).entries()),
          deserialize: (value) => reactiveMap(value as Array<[string, string]>),
        },
        {
          key: 'tags',
          serialize: (value) =>
            Array.from((value as ReactiveSet<string>).values()),
          deserialize: (value) => reactiveSet(value as string[]),
        },
      ],
    };
    const persistence = persist(store, options);
    cleanups.push(persistence.unsubscribe);
    await persistence.hydrated;
    store.users.set('ada', 'Ada');
    store.tags.add('saved');
    await flush();
    disposeAll();

    const restored = createStore();
    const restoredPersistence = persist(restored, options);
    cleanups.push(restoredPersistence.unsubscribe);
    await restoredPersistence.hydrated;
    expect(restored.users.get('ada')).toBe('Ada');
    expect(restored.tags.has('saved')).toBe(true);
    const before = snapshot(restored);
    const onChange = mock(() => {});
    cleanups.push(subscribe(restored, onChange));

    restored.users.set('grace', 'Grace');
    restored.tags.add('edited');
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(snapshot(restored).users.get('grace')).toBe('Grace');
    expect(snapshot(restored).tags.has('edited')).toBe(true);
    expect(before.users.has('grace')).toBe(false);
    expect(before.tags.has('edited')).toBe(false);
    expect(JSON.parse(storage.data.get('collections') ?? '').state).toEqual({
      users: [
        ['ada', 'Ada'],
        ['grace', 'Grace'],
      ],
      tags: ['saved', 'edited'],
    });
  });

  test('disposes persistence, history and DevTools together without further side effects', async () => {
    const storage = createStorage();
    const extension = installDevtools();
    const store = createClassyStore({count: 0});
    const persistence = persist(store, {name: 'draft', storage});
    cleanups.push(persistence.unsubscribe);
    await persistence.hydrated;
    const history = withHistory(store);
    cleanups.push(history.dispose, devtools(store));

    store.count = 1;
    await flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(extension.connection.send).toHaveBeenCalledTimes(1);
    expect(history.canUndo).toBe(true);
    disposeAll();
    storage.setItem.mockClear();
    extension.connection.send.mockClear();

    store.count = 2;
    await flush();
    expect(store.count).toBe(2);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(extension.connection.send).not.toHaveBeenCalled();
    expect(extension.unsubscribe).toHaveBeenCalledTimes(1);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
