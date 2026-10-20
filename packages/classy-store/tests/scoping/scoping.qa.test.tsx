import {afterEach, describe, expect, mock, test} from 'bun:test';
import type {StorageAdapter} from '@codebelt/classy-store/utils';
import {type ReactNode, StrictMode, Suspense} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {EditorStoreProvider} from './example/components/editorStoreProvider/EditorStoreProvider';
import type {EditorStore} from './example/editorStore';
import {act} from './reactAct';
import {QaMemoSelector} from './testHelpers/scopedQa/qaMemoSelector/QaMemoSelector';
import {QaScopeProbe} from './testHelpers/scopedQa/qaScopeProbe/QaScopeProbe';

const mounted = new Map<Root, HTMLDivElement>();
const initialData = {title: 'Initial', body: 'Body'};

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.set(root, container);
  act(() => root.render(element));
  return {root, container};
}

function unmount(root: Root) {
  act(() => root.unmount());
  mounted.get(root)?.remove();
  mounted.delete(root);
}

function createPendingStorage() {
  const reads: {name: string; resolve: (value: string | null) => void}[] = [];
  const storage: StorageAdapter = {
    getItem: mock(
      (name: string) =>
        new Promise<string | null>((resolve) => {
          reads.push({name, resolve});
        }),
    ),
    setItem: mock((_name: string, _value: string) => {}),
    removeItem: mock((_name: string) => {}),
  };
  return {storage, reads};
}

function saved(title: string) {
  return JSON.stringify({version: 0, state: {title, body: 'Saved body'}});
}

afterEach(() => {
  for (const root of mounted.keys()) unmount(root);
});

describe('independent scoped-store lifecycle QA', () => {
  test('ignores a late hydration result from the disposed first StrictMode effect', async () => {
    const {storage, reads} = createPendingStorage();
    let currentStore!: EditorStore;
    const onStore = (store: EditorStore) => {
      currentStore = store;
    };
    const {container} = mount(
      <StrictMode>
        <EditorStoreProvider
          initialData={initialData}
          persistence={{name: 'draft', storage}}
        >
          <QaScopeProbe onStore={onStore} />
        </EditorStoreProvider>
      </StrictMode>,
    );
    expect(reads).toHaveLength(2);
    await act(async () => reads[1]?.resolve(saved('Current')));
    expect(container.textContent).toBe('Current|Saved body');
    await act(async () => reads[0]?.resolve(saved('Stale')));
    expect(currentStore.title).toBe('Current');
    expect(container.textContent).toBe('Current|Saved body');
    expect(storage.setItem).not.toHaveBeenCalled();

    await act(async () => currentStore.setTitle('User edit'));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('User edit|Saved body');
  });

  test('ignores a pending hydration after a storage key changes on the same store', async () => {
    const {storage, reads} = createPendingStorage();
    let currentStore!: EditorStore;
    const onStore = (store: EditorStore) => {
      currentStore = store;
    };
    const view = (name: string) => (
      <EditorStoreProvider
        initialData={initialData}
        persistence={{name, storage}}
      >
        <QaScopeProbe onStore={onStore} />
      </EditorStoreProvider>
    );
    const {root, container} = mount(view('previous'));
    const originalStore = currentStore;
    act(() => root.render(view('current')));
    expect(currentStore).toBe(originalStore);
    expect(reads.map((read) => read.name)).toEqual(['previous', 'current']);
    await act(async () => reads[1]?.resolve(saved('Current')));
    await act(async () => reads[0]?.resolve(saved('Previous')));
    expect(container.textContent).toBe('Current|Saved body');
    expect(storage.setItem).not.toHaveBeenCalled();
    await act(async () => currentStore.setBody('Changed'));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      'current',
      JSON.stringify({
        version: 0,
        state: {title: 'Current', body: 'Changed'},
      }),
    );
  });

  test('keeps a reset store and its retired predecessor isolated from late persistence', async () => {
    const {storage, reads} = createPendingStorage();
    let currentStore!: EditorStore;
    const onStore = (store: EditorStore) => {
      currentStore = store;
    };
    const view = (session: string) => (
      <EditorStoreProvider
        key={session}
        initialData={initialData}
        persistence={{name: session, storage}}
      >
        <QaScopeProbe onStore={onStore} />
      </EditorStoreProvider>
    );
    const {root, container} = mount(view('previous'));
    const retiredStore = currentStore;
    act(() => root.render(view('current')));
    expect(currentStore).not.toBe(retiredStore);
    await act(async () => reads[1]?.resolve(saved('Current')));
    await act(async () => reads[0]?.resolve(saved('Retired')));
    expect(retiredStore.title).toBe('Initial');
    expect(container.textContent).toBe('Current|Saved body');
    expect(storage.setItem).not.toHaveBeenCalled();
    await act(async () => retiredStore.setTitle('Detached edit'));
    expect(container.textContent).toBe('Current|Saved body');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('does not mutate a disposed store when its pending hydration completes after unmount', async () => {
    const {storage, reads} = createPendingStorage();
    let retiredStore!: EditorStore;
    const {root} = mount(
      <EditorStoreProvider
        initialData={initialData}
        persistence={{name: 'draft', storage}}
      >
        <QaScopeProbe
          onStore={(store) => {
            retiredStore = store;
          }}
        />
      </EditorStoreProvider>,
    );
    expect(reads).toHaveLength(1);
    unmount(root);
    await act(async () => reads[0]?.resolve(saved('Too late')));
    expect(retiredStore.title).toBe('Initial');
    expect(retiredStore.body).toBe('Body');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('never starts persistence for an initial render abandoned while suspended', async () => {
    const {storage} = createPendingStorage();
    let released = false;
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onStore = mock((_store: EditorStore) => {});
    const suspend = () => {
      if (!released) throw promise;
    };
    const {root, container} = mount(
      <Suspense fallback="Loading">
        <EditorStoreProvider
          initialData={initialData}
          persistence={{name: 'draft', storage}}
        >
          <QaScopeProbe onStore={onStore} suspend={suspend} />
        </EditorStoreProvider>
      </Suspense>,
    );
    expect(container.textContent).toBe('Loading');
    expect(onStore).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    act(() => root.render(null));
    await act(async () => {
      released = true;
      release();
    });
    expect(onStore).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('memoized selectors and tracked consumers stay live while provider props change', async () => {
    let currentStore!: EditorStore;
    const onStore = (store: EditorStore) => {
      currentStore = store;
    };
    const view = (title: string) => (
      <EditorStoreProvider initialData={{title, body: 'Body'}}>
        <QaScopeProbe onStore={onStore} />
        <QaMemoSelector />
      </EditorStoreProvider>
    );
    const {root, container} = mount(view('Initial'));
    const originalStore = currentStore;
    act(() => root.render(view('Ignored new prop')));
    expect(currentStore).toBe(originalStore);
    expect(container.querySelector('[data-qa-tracked]')?.textContent).toBe(
      'Initial|Body',
    );
    expect(container.querySelector('[data-qa-selected]')?.textContent).toBe(
      'Initial',
    );
    await act(async () => currentStore.setTitle('Updated'));
    expect(container.querySelector('[data-qa-tracked]')?.textContent).toBe(
      'Updated|Body',
    );
    expect(container.querySelector('[data-qa-selected]')?.textContent).toBe(
      'Updated',
    );
    await act(async () => currentStore.setBody('Updated body'));
    expect(container.querySelector('[data-qa-tracked]')?.textContent).toBe(
      'Updated|Updated body',
    );
    expect(container.querySelector('[data-qa-selected]')?.textContent).toBe(
      'Updated',
    );
  });
});
