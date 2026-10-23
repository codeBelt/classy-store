import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore, type Snapshot} from '@codebelt/classy-store';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';
import {type ReactNode, Suspense, startTransition} from 'react';
import {createRoot, hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {QaHydrationTracked} from './fixtures/qaHydrationTracked/QaHydrationTracked';
import {QaOpaqueDerivation} from './fixtures/qaOpaqueDerivation/QaOpaqueDerivation';
import {QaReflectiveReads} from './fixtures/qaReflectiveReads/QaReflectiveReads';
import {QaSelectorTransition} from './fixtures/qaSelectorTransition/QaSelectorTransition';
import {QaTrackedTransition} from './fixtures/qaTrackedTransition/QaTrackedTransition';
import type {QaGate, QaStore} from './qa.types';
import {act} from './reactAct';

const mounted = new Map<Root, HTMLDivElement>();

function createQaStore() {
  return createClassyStore<QaStore>({
    name: 'initial',
    count: 0,
    ignored: 0,
    node: {first: 'First', second: 'Second'},
  });
}

function createContainer(html = '') {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

function mount(element: ReactNode) {
  const container = createContainer();
  const root = createRoot(container);
  mounted.set(root, container);
  act(() => root.render(element));
  return {root, container};
}

function createGate() {
  let resolve!: () => void;
  const gate: QaGate = {
    promise: new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    }),
    attempts: [],
    released: false,
  };
  return {
    gate,
    release() {
      gate.released = true;
      resolve();
    },
  };
}

afterEach(async () => {
  for (const [root, container] of mounted) {
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.clear();
});

describe('compiled consumer tracking and hydration', () => {
  test('retains reads inside a compiler-memoized helper after a parent-only rerender', async () => {
    const store = createQaStore();
    const {root, container} = mount(
      <QaOpaqueDerivation store={store} label="original" />,
    );
    expect(container.textContent).toBe('original:INITIAL:0');

    act(() => root.render(<QaOpaqueDerivation store={store} label="parent" />));
    expect(container.textContent).toBe('parent:INITIAL:0');

    await act(async () => {
      store.name = 'changed';
    });
    expect(container.textContent).toBe('parent:CHANGED:0');

    await act(async () => {
      store.count = 1;
    });
    expect(container.textContent).toBe('parent:CHANGED:1');
  });

  for (const kind of ['has', 'own', 'keys'] as const) {
    test(`retains compiler-memoized ${kind} reads across unchanged snapshots`, async () => {
      const store = createQaStore();
      const {root, container} = mount(
        <QaReflectiveReads store={store} label="original" kind={kind} />,
      );
      act(() =>
        root.render(
          <QaReflectiveReads store={store} label="parent" kind={kind} />,
        ),
      );
      const initial = kind === 'keys' ? 'first,second' : 'false';
      expect(container.textContent).toBe(`parent:${initial}:0`);

      await act(async () => {
        store.node.optional = 'present';
      });
      const changed = kind === 'keys' ? 'first,second,optional' : 'true';
      expect(container.textContent).toBe(`parent:${changed}:0`);

      act(() =>
        root.render(
          <QaReflectiveReads store={store} label="again" kind={kind} />,
        ),
      );
      await act(async () => {
        delete store.node.optional;
      });
      expect(container.textContent).toBe(`again:${initial}:0`);
    });
  }

  for (const [mode, Component] of [
    ['tracked', QaTrackedTransition],
    ['selector', QaSelectorTransition],
  ] as const) {
    test(`keeps ${mode} committed reads active through a suspended and abandoned transition`, async () => {
      const store = createQaStore();
      const {gate, release} = createGate();
      const view = (field: 'first' | 'second') => (
        <Suspense fallback="Loading">
          <Component store={store} field={field} gate={gate} />
        </Suspense>
      );
      const {root, container} = mount(view('first'));
      await act(async () => startTransition(() => root.render(view('second'))));
      expect(gate.attempts).toContain('second');
      expect(container.textContent).toBe('First');

      await act(async () => {
        store.node.first = 'Committed';
      });
      expect(container.textContent).toBe('Committed');

      act(() => root.render(view('first')));
      gate.attempts.length = 0;
      await act(async () => {
        store.node.second = 'Abandoned';
      });
      expect(gate.attempts).toEqual([]);
      expect(container.textContent).toBe('Committed');
      await act(async () => release());

      await act(async () => {
        store.node.first = 'Still current';
      });
      expect(container.textContent).toBe('Still current');
    });
  }

  test('preserves a compiled hydration snapshot identity when only unread data changes', async () => {
    const store = prepareStoreForHydration(createQaStore());
    const commits: Snapshot<QaStore>[] = [];
    const onCommit = (state: Snapshot<QaStore>) => commits.push(state);
    const container = createContainer(
      renderToString(<QaHydrationTracked store={store} onCommit={onCommit} />),
    );
    const serverNode = container.firstElementChild;
    store.ignored = 1;
    const onRecoverableError = mock(() => {});

    await act(async () => {
      const root = hydrateRoot(
        container,
        <QaHydrationTracked store={store} onCommit={onCommit} />,
        {onRecoverableError},
      );
      mounted.set(root, container);
    });
    expect(container.firstElementChild).toBe(serverNode);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(commits).toHaveLength(1);

    await act(async () => {
      store.ignored = 2;
    });
    expect(commits).toHaveLength(1);
    await act(async () => {
      store.name = 'live';
    });
    expect(container.textContent).toBe('live');
    expect(commits).toHaveLength(2);
    expect(commits[0]).not.toBe(commits[1]);
  });
});
