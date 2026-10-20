import {afterEach, describe, expect, test} from 'bun:test';
import {type ReactNode, StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {EditorStoreProvider} from './example/components/editorStoreProvider/EditorStoreProvider';
import type {EditorStore} from './example/editorStore';
import {createLifecycleStorage} from './lifecycleStorage';
import {act} from './reactAct';
import {ScopedProbe} from './testHelpers/scopedProbe/ScopedProbe';

const mountedRoots = new Map<Root, HTMLDivElement>();
const firstData = {title: 'First', body: 'First body'};
const secondData = {title: 'Second', body: 'Second body'};

async function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.set(root, container);
  await act(async () => root.render(element));
  return {root, container};
}

async function unmount(root: Root) {
  const container = mountedRoots.get(root);
  await act(async () => root.unmount());
  container?.remove();
  mountedRoots.delete(root);
}

function readScope(container: HTMLElement, name: string) {
  return container.querySelector(`[data-scope="${name}"]`)?.textContent;
}

function readRequired<Value>(values: Map<string, Value>, name: string): Value {
  const value = values.get(name);
  if (value === undefined) throw new Error(`Missing captured value: ${name}`);
  return value;
}

afterEach(async () => {
  for (const root of mountedRoots.keys()) await unmount(root);
});

describe('typed context store lifecycle', () => {
  test('isolates sibling instances and their persistence namespaces', async () => {
    const {storage, writes, values} = createLifecycleStorage();
    const stores = new Map<string, EditorStore>();
    const {container} = await mount(
      <>
        <EditorStoreProvider
          initialData={firstData}
          persistence={{name: 'editor:first', storage}}
        >
          <ScopedProbe
            name="first"
            onStore={(store) => stores.set('first', store)}
          />
        </EditorStoreProvider>
        <EditorStoreProvider
          initialData={secondData}
          persistence={{name: 'editor:second', storage}}
        >
          <ScopedProbe
            name="second"
            onStore={(store) => stores.set('second', store)}
          />
        </EditorStoreProvider>
      </>,
    );
    const first = readRequired(stores, 'first');
    const second = readRequired(stores, 'second');
    expect(first).not.toBe(second);
    expect(readScope(container, 'first')).toBe(
      'First:First body|First:First body',
    );
    expect(readScope(container, 'second')).toBe(
      'Second:Second body|Second:Second body',
    );

    await act(async () => {
      first.setTitle('Edited first');
      first.setBody('Edited body');
    });
    expect(readScope(container, 'first')).toBe(
      'Edited first:Edited body|Edited first:Edited body',
    );
    expect(readScope(container, 'second')).toBe(
      'Second:Second body|Second:Second body',
    );
    expect(writes.map(({name}) => name)).toEqual(['editor:first']);

    await act(async () => second.setTitle('Edited second'));
    expect(readScope(container, 'first')).toBe(
      'Edited first:Edited body|Edited first:Edited body',
    );
    expect(readScope(container, 'second')).toBe(
      'Edited second:Second body|Edited second:Second body',
    );
    expect(JSON.parse(readRequired(values, 'editor:first')).state).toEqual({
      title: 'Edited first',
      body: 'Edited body',
    });
    expect(JSON.parse(readRequired(values, 'editor:second')).state).toEqual({
      title: 'Edited second',
      body: 'Second body',
    });
  });

  test('routes nested consumers to the nearest provider and restores the outer scope', async () => {
    const stores = new Map<string, EditorStore>();
    const {container} = await mount(
      <EditorStoreProvider initialData={firstData}>
        <ScopedProbe
          name="before"
          onStore={(store) => stores.set('before', store)}
        />
        <EditorStoreProvider initialData={secondData}>
          <ScopedProbe
            name="inside"
            onStore={(store) => stores.set('inside', store)}
          />
        </EditorStoreProvider>
        <ScopedProbe
          name="after"
          onStore={(store) => stores.set('after', store)}
        />
      </EditorStoreProvider>,
    );
    expect(stores.get('before')).toBe(stores.get('after'));
    expect(stores.get('inside')).not.toBe(stores.get('before'));

    await act(async () =>
      readRequired(stores, 'inside').setTitle('Nested edit'),
    );
    expect(readScope(container, 'before')).toBe(
      'First:First body|First:First body',
    );
    expect(readScope(container, 'inside')).toBe(
      'Nested edit:Second body|Nested edit:Second body',
    );
    expect(readScope(container, 'after')).toBe(
      'First:First body|First:First body',
    );

    await act(async () => readRequired(stores, 'before').setBody('Outer edit'));
    expect(readScope(container, 'before')).toBe(
      'First:Outer edit|First:Outer edit',
    );
    expect(readScope(container, 'inside')).toBe(
      'Nested edit:Second body|Nested edit:Second body',
    );
    expect(readScope(container, 'after')).toBe(
      'First:Outer edit|First:Outer edit',
    );
  });

  test('reports a clear missing-provider error', () => {
    expect(() => renderToString(<ScopedProbe name="missing" />)).toThrow(
      'useEditorStore must be used within EditorStoreProvider',
    );
  });

  test('preserves the store and edits when parent renders pass new initial data', async () => {
    const captures: EditorStore[] = [];
    const capture = (store: EditorStore) => captures.push(store);
    const {root, container} = await mount(
      <EditorStoreProvider initialData={firstData}>
        <ScopedProbe name="editor" onStore={capture} />
      </EditorStoreProvider>,
    );
    const store = captures[0];
    await act(async () => store.setTitle('Unsaved edit'));
    await act(async () => {
      root.render(
        <EditorStoreProvider initialData={{...secondData}}>
          <ScopedProbe name="editor" onStore={capture} />
        </EditorStoreProvider>,
      );
    });
    expect(captures).toEqual([store]);
    expect(readScope(container, 'editor')).toBe(
      'Unsaved edit:First body|Unsaved edit:First body',
    );
    await act(async () => store.setBody('Still connected'));
    expect(readScope(container, 'editor')).toBe(
      'Unsaved edit:Still connected|Unsaved edit:Still connected',
    );
  });

  test('resets with a provider key and disconnects the previous store', async () => {
    const {storage, reads, writes} = createLifecycleStorage();
    const captures: EditorStore[] = [];
    const commits: string[] = [];
    const capture = (store: EditorStore) => captures.push(store);
    const commit = (value: string) => commits.push(value);
    const {root, container} = await mount(
      <EditorStoreProvider
        key="first"
        initialData={firstData}
        persistence={{name: 'first', storage}}
      >
        <ScopedProbe name="editor" onStore={capture} onCommit={commit} />
      </EditorStoreProvider>,
    );
    const previousStore = captures[0];
    await act(async () => previousStore.setTitle('Old edit'));
    await act(async () => {
      root.render(
        <EditorStoreProvider
          key="second"
          initialData={secondData}
          persistence={{name: 'second', storage}}
        >
          <ScopedProbe name="editor" onStore={capture} onCommit={commit} />
        </EditorStoreProvider>,
      );
    });
    const currentStore = captures[1];
    expect(currentStore).not.toBe(previousStore);
    expect(readScope(container, 'editor')).toBe(
      'Second:Second body|Second:Second body',
    );
    expect(reads).toEqual(['first', 'second']);
    writes.length = 0;
    commits.length = 0;
    await act(async () => previousStore.setTitle('Detached edit'));
    expect(writes).toEqual([]);
    expect(commits).toEqual([]);
    expect(readScope(container, 'editor')).toBe(
      'Second:Second body|Second:Second body',
    );
    await act(async () => currentStore.setBody('Current edit'));
    expect(readScope(container, 'editor')).toBe(
      'Second:Current edit|Second:Current edit',
    );
    expect(writes.map(({name}) => name)).toEqual(['second']);
  });

  test('maintains one active persistence effect through StrictMode replay and unmount', async () => {
    const {storage, reads, writes} = createLifecycleStorage();
    const captures: EditorStore[] = [];
    const {root, container} = await mount(
      <StrictMode>
        <EditorStoreProvider
          initialData={firstData}
          persistence={{name: 'strict', storage}}
        >
          <ScopedProbe
            name="editor"
            onStore={(store) => captures.push(store)}
          />
        </EditorStoreProvider>
      </StrictMode>,
    );
    expect(reads).toEqual(['strict', 'strict']);
    expect(new Set(captures).size).toBe(1);
    const store = captures[0];
    await act(async () => store.setTitle('Strict edit'));
    expect(readScope(container, 'editor')).toBe(
      'Strict edit:First body|Strict edit:First body',
    );
    expect(writes).toHaveLength(1);
    await unmount(root);
    writes.length = 0;
    await act(async () => store.setBody('After unmount'));
    expect(writes).toEqual([]);
  });

  test('does not restart persistence for an equivalent options object', async () => {
    const {storage, reads, writes} = createLifecycleStorage();
    const stores: EditorStore[] = [];
    const capture = (store: EditorStore) => stores.push(store);
    const {root, container} = await mount(
      <EditorStoreProvider
        initialData={firstData}
        persistence={{name: 'stable', storage}}
      >
        <ScopedProbe name="editor" onStore={capture} />
      </EditorStoreProvider>,
    );
    await act(async () => {
      root.render(
        <EditorStoreProvider
          initialData={{...firstData}}
          persistence={{name: 'stable', storage}}
        >
          <ScopedProbe name="editor" onStore={capture} />
        </EditorStoreProvider>,
      );
    });
    expect(reads).toEqual(['stable']);
    expect(stores).toHaveLength(1);
    await act(async () => stores[0].setBody('Edited'));
    expect(writes).toHaveLength(1);
    expect(readScope(container, 'editor')).toBe('First:Edited|First:Edited');
  });

  test('cleans up when persistence is removed and reconnects without recreating the store', async () => {
    const {storage, reads, writes} = createLifecycleStorage();
    const stores: EditorStore[] = [];
    const capture = (store: EditorStore) => stores.push(store);
    const {root, container} = await mount(
      <EditorStoreProvider
        initialData={firstData}
        persistence={{name: 'before', storage}}
      >
        <ScopedProbe name="editor" onStore={capture} />
      </EditorStoreProvider>,
    );
    const store = stores[0];
    await act(async () => {
      root.render(
        <EditorStoreProvider initialData={firstData}>
          <ScopedProbe name="editor" onStore={capture} />
        </EditorStoreProvider>,
      );
    });
    await act(async () => store.setTitle('Temporary edit'));
    expect(writes).toEqual([]);
    expect(readScope(container, 'editor')).toBe(
      'Temporary edit:First body|Temporary edit:First body',
    );
    await act(async () => {
      root.render(
        <EditorStoreProvider
          initialData={firstData}
          persistence={{name: 'after', storage}}
        >
          <ScopedProbe name="editor" onStore={capture} />
        </EditorStoreProvider>,
      );
    });
    expect(stores).toEqual([store]);
    expect(reads).toEqual(['before', 'after']);
    await act(async () => store.setBody('Reconnected'));
    expect(writes.map(({name}) => name)).toEqual(['after']);
  });

  test('a keyed remount restores saved data when the persistence namespace stays the same', async () => {
    const {storage, removals} = createLifecycleStorage();
    const stores: EditorStore[] = [];
    const capture = (store: EditorStore) => stores.push(store);
    const {root, container} = await mount(
      <EditorStoreProvider
        key="first"
        initialData={firstData}
        persistence={{name: 'saved', storage}}
      >
        <ScopedProbe name="editor" onStore={capture} />
      </EditorStoreProvider>,
    );
    await act(async () => stores[0].setTitle('Saved edit'));
    await act(async () => {
      root.render(
        <EditorStoreProvider
          key="reset"
          initialData={secondData}
          persistence={{name: 'saved', storage}}
        >
          <ScopedProbe name="editor" onStore={capture} />
        </EditorStoreProvider>,
      );
    });
    expect(stores[1]).not.toBe(stores[0]);
    expect(removals).toEqual([]);
    expect(readScope(container, 'editor')).toBe(
      'Saved edit:First body|Saved edit:First body',
    );
  });
});
