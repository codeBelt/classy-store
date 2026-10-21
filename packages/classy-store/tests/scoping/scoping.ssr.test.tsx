import {afterEach, describe, expect, mock, test} from 'bun:test';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {EditorStoreProvider} from './example/components/editorStoreProvider/EditorStoreProvider';
import type {EditorStore} from './example/editorStore';
import {act} from './reactAct';
import type {
  HydrationGate,
  ScopedSsrMode,
} from './testHelpers/scopedSsr/scopedSsr.types';
import {ScopedSsrProbe} from './testHelpers/scopedSsr/scopedSsrProbe/ScopedSsrProbe';
import {ScopedSsrTree} from './testHelpers/scopedSsr/scopedSsrTree/ScopedSsrTree';
import {ScopedSsrValue} from './testHelpers/scopedSsr/scopedSsrValue/ScopedSsrValue';

function createGate(initiallyReady = false): HydrationGate {
  let ready = initiallyReady;
  let releasePromise = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    releasePromise = resolvePromise;
  });
  return {
    read() {
      if (!ready) throw promise;
    },
    release() {
      ready = true;
      releasePromise();
    },
  };
}

const modes: ScopedSsrMode[] = ['selector', 'auto-tracking'];
const mounted = new Map<Root, HTMLDivElement>();

afterEach(async () => {
  for (const [root, container] of mounted) {
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.clear();
});

describe('scoped context server rendering and hydration', () => {
  test('creates isolated request stores without starting persistence on the server', () => {
    const stores: EditorStore[] = [];
    const initialData = {title: 'Shared input', body: 'Original'};
    const storage = {
      getItem: mock(() => null),
      setItem: mock(() => {}),
      removeItem: mock(() => {}),
    };
    const element = (
      <ScopedSsrTree
        initialData={initialData}
        mode="selector"
        persistence={{name: 'request', storage}}
        onStore={(store) => stores.push(store)}
      />
    );
    const firstHtml = renderToString(element);
    stores[0].setTitle('Changed first request');
    stores[0].setBody('Private first request');
    const secondHtml = renderToString(element);

    expect(secondHtml).toBe(firstHtml);
    expect(stores).toHaveLength(2);
    expect(stores[0]).not.toBe(stores[1]);
    expect(stores[1].title).toBe('Shared input');
    expect(stores[1].body).toBe('Original');
    expect(initialData).toEqual({title: 'Shared input', body: 'Original'});
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test('resolves nested providers independently during server rendering', () => {
    const outerStores: EditorStore[] = [];
    const innerStores: EditorStore[] = [];
    const outerHtml = renderToString(
      <EditorStoreProvider initialData={{title: 'Outer', body: 'Request'}}>
        <ScopedSsrProbe onStore={(store) => outerStores.push(store)} />
        <ScopedSsrValue mode="selector" />
        <EditorStoreProvider initialData={{title: 'Inner', body: 'Draft'}}>
          <ScopedSsrProbe onStore={(store) => innerStores.push(store)} />
          <ScopedSsrValue mode="auto-tracking" />
        </EditorStoreProvider>
        <ScopedSsrProbe onStore={(store) => outerStores.push(store)} />
      </EditorStoreProvider>,
    );
    expect(outerHtml).toContain('Outer|Request');
    expect(outerHtml).toContain('Inner|Draft');
    expect(outerStores).toHaveLength(2);
    expect(outerStores[0]).toBe(outerStores[1]);
    expect(innerStores).toHaveLength(1);
    expect(innerStores[0]).not.toBe(outerStores[0]);
    innerStores[0].setTitle('Inner only');
    expect(outerStores[0].title).toBe('Outer');
  });

  test.each(
    modes,
  )('hydrates matching %s context state without replacing server DOM', async (mode) => {
    const serverStores: EditorStore[] = [];
    const clientStores: EditorStore[] = [];
    const initialData = {title: 'Server', body: 'Request data'};
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ScopedSsrTree
        initialData={initialData}
        mode={mode}
        onStore={(store) => serverStores.push(store)}
      />,
    );
    document.body.appendChild(container);
    const serverElement = container.querySelector('[data-scoped-value]');
    const onRecoverableError = mock(() => {});
    const onCommit = mock((value: string) => value);

    await act(async () => {
      const root = hydrateRoot(
        container,
        <ScopedSsrTree
          initialData={initialData}
          mode={mode}
          onStore={(store) => clientStores.push(store)}
          onCommit={onCommit}
        />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-scoped-value]')).toBe(serverElement);
    expect(serverElement?.textContent).toBe('Server|Request data');
    expect(clientStores[0]).not.toBe(serverStores[0]);
    expect(onCommit.mock.calls.map(([value]) => value)).toEqual([
      'Server|Request data',
    ]);

    await act(async () => {
      clientStores[0].setTitle('Client edit');
      clientStores[0].setBody('Updated body');
    });
    expect(serverElement?.textContent).toBe('Client edit|Updated body');
    expect(serverStores[0].title).toBe('Server');
    expect(serverStores[0].body).toBe('Request data');
  });

  test.each(
    modes,
  )('restores persistence before a delayed %s context consumer first hydrates', async (mode) => {
    const initialData = {title: 'Server', body: 'Initial body'};
    let serverStore!: EditorStore;
    let clientStore!: EditorStore;
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ScopedSsrTree
        initialData={initialData}
        gate={createGate(true)}
        mode={mode}
        onStore={(store) => {
          serverStore = store;
        }}
      />,
    );
    document.body.appendChild(container);
    const serverElement = container.querySelector('[data-scoped-value]');
    const gate = createGate();
    const onRead = mock((value: string) => value);
    const onCommit = mock((value: string) => value);
    const onRecoverableError = mock(() => {});
    const storage = {
      getItem: mock(async () =>
        JSON.stringify({
          version: 0,
          state: {title: 'Saved', body: 'Persisted body'},
        }),
      ),
      setItem: mock(() => {}),
      removeItem: mock(() => {}),
    };
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(
        container,
        <ScopedSsrTree
          initialData={initialData}
          gate={gate}
          mode={mode}
          persistence={{name: `delayed-${mode}`, storage}}
          onStore={(store) => {
            clientStore = store;
          }}
          onRead={onRead}
          onCommit={onCommit}
        />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });

    // The provider owns persistence outside the suspended subtree. This proves
    // restoration finished before the first context consumer's store read.
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(clientStore.title).toBe('Saved');
    expect(clientStore.body).toBe('Persisted body');
    expect(onRead).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(serverElement?.textContent).toBe('Server|Initial body');
    expect(container.querySelector('[data-scoped-value]')).toBe(serverElement);

    await act(async () => gate.release());

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-scoped-value]')).toBe(serverElement);
    expect(serverElement?.textContent).toBe('Saved|Persisted body');
    expect(onRead.mock.calls[0][0]).toBe('Server|Initial body');
    expect(onCommit.mock.calls.map(([value]) => value)).toEqual([
      'Server|Initial body',
      'Saved|Persisted body',
    ]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(serverStore.title).toBe('Server');
    expect(serverStore.body).toBe('Initial body');

    await act(async () => {
      clientStore.setTitle('Edited');
      clientStore.setBody('Client body');
    });
    expect(serverElement?.textContent).toBe('Edited|Client body');
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    const commitsBeforeUnmount = onCommit.mock.calls.length;
    await act(async () => root.unmount());
    mounted.delete(root);
    container.remove();
    clientStore.setTitle('Detached');
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(commitsBeforeUnmount);
  });
});
