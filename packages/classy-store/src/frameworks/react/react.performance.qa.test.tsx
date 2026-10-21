import {afterEach, describe, expect, test} from 'bun:test';
import {act, createElement, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createClassyStore, getInternal} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';
import type {
  PerformanceQaCommit,
  PerformanceQaStore,
} from './testHelpers/performanceQa.types';
import {PerformanceQaComputedView} from './testHelpers/performanceQaComputedView/PerformanceQaComputedView';
import {PerformanceQaView} from './testHelpers/performanceQaView/PerformanceQaView';

const mounted = new Map<Root, HTMLDivElement>();

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.set(root, container);
  act(() => root.render(element));
  return {root, container};
}

function createStore(size = 2) {
  return createClassyStore<PerformanceQaStore>({
    rows: Array.from({length: size}, (_, index) => ({
      name: `Row ${index}`,
      ignored: 0,
    })),
    ignored: 0,
  });
}

function createCommits() {
  const counts = new Map<string, number>();
  const states = new Map<string, Snapshot<PerformanceQaStore>>();
  const onCommit: PerformanceQaCommit = (id, state) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    states.set(id, state);
  };
  return {counts, states, onCommit};
}

afterEach(() => {
  for (const [root, container] of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted.clear();
});

describe('useClassyStore performance independent QA', () => {
  test('keeps shared snapshot targets independent across many consumer read sets', () => {
    const store = createStore(128);
    const {counts, states, onCommit} = createCommits();
    const {container} = mount(
      Array.from({length: 128}, (_, index) =>
        createElement(PerformanceQaView, {
          key: index,
          id: String(index),
          store,
          index,
          onCommit,
        }),
      ),
    );
    expect([...counts.values()]).toEqual(Array(128).fill(1));
    expect(states.get('0')).not.toBe(states.get('1'));

    act(() => {
      store.rows[37].name = 'Changed';
    });
    expect([...counts.entries()].filter(([, count]) => count > 1)).toEqual([
      ['37', 2],
    ]);
    expect(container.querySelector('[data-consumer="37"]')?.textContent).toBe(
      ':Changed',
    );

    act(() => {
      store.ignored += 1;
      store.rows[37].ignored += 1;
      store.rows[90].ignored += 1;
    });
    expect([...counts.entries()].filter(([, count]) => count > 1)).toEqual([
      ['37', 2],
    ]);

    act(() => {
      store.rows[90].name = 'Other';
    });
    expect([...counts.entries()].filter(([, count]) => count > 1)).toEqual([
      ['37', 2],
      ['90', 2],
    ]);
  });

  test.each([
    {
      description: 'root',
      select: (state: Snapshot<PerformanceQaStore>) => state,
    },
    {
      description: 'array',
      select: (state: Snapshot<PerformanceQaStore>) => state.rows,
    },
    {
      description: 'nested row',
      select: (state: Snapshot<PerformanceQaStore>) => state.rows[0],
    },
  ])('protects shared $description targets starting with the first consumer', ({
    select,
  }) => {
    const store = createStore();
    const {states, counts, onCommit} = createCommits();
    const {container} = mount([
      <PerformanceQaView
        key="first"
        id="first"
        store={store}
        index={0}
        onCommit={onCommit}
      />,
      <PerformanceQaView
        key="second"
        id="second"
        store={store}
        index={1}
        onCommit={onCommit}
      />,
    ]);

    for (const id of ['first', 'second']) {
      const state = states.get(id);
      expect(state).toBeDefined();
      if (!state) throw new Error('Missing committed snapshot');
      const target = select(state);
      const prototype = Object.getPrototypeOf(target);
      expect(
        Reflect.defineProperty(target, 'injected', {value: 'poison'}),
      ).toBe(false);
      expect(Reflect.setPrototypeOf(target, {injected: 'poison'})).toBe(false);
      expect(Reflect.preventExtensions(target)).toBe(false);
      expect(Reflect.set(target, 'injected', 'poison')).toBe(false);
      expect(
        Reflect.deleteProperty(target, Array.isArray(target) ? '0' : 'ignored'),
      ).toBe(false);
      expect(Object.getPrototypeOf(target)).toBe(prototype);
      expect('injected' in target).toBe(false);
    }

    expect(snapshot(store).rows.map((row) => row.name)).toEqual([
      'Row 0',
      'Row 1',
    ]);
    expect(container.textContent).toBe(':Row 0:Row 1');
    act(() => {
      store.rows[0].name = 'Still live';
    });
    expect(container.textContent).toBe(':Still live:Row 1');
    expect(counts.get('first')).toBe(2);
    expect(counts.get('second')).toBe(1);
  });

  test('keeps target reuse independent when a consumer changes stores and unmounts', () => {
    const firstStore = createStore();
    const secondStore = createStore();
    const {counts, onCommit} = createCommits();
    const view = (store: PerformanceQaStore) => (
      <PerformanceQaView
        id="current"
        store={store}
        index={0}
        onCommit={onCommit}
      />
    );
    const {root, container} = mount(view(firstStore));
    act(() => root.render(view(secondStore)));
    expect(getInternal(firstStore).syncListeners.size).toBe(0);
    expect(getInternal(secondStore).syncListeners.size).toBe(1);
    const before = counts.get('current');
    act(() => {
      firstStore.rows[0].name = 'Retired';
    });
    expect(counts.get('current')).toBe(before);
    expect(container.textContent).toBe(':Row 0');
    act(() => {
      secondStore.rows[0].name = 'Current';
    });
    expect(container.textContent).toBe(':Current');
    act(() => root.render(null));
    expect(getInternal(secondStore).syncListeners.size).toBe(0);
  });

  test('rechecks mutable getter results if they become frozen after first access', () => {
    class DerivedStore {
      name = 'Initial';

      get derived() {
        return {child: {name: this.name}};
      }
    }
    const store = createClassyStore(new DerivedStore());
    const derived = snapshot(store).derived;
    expect(Object.isFrozen(derived)).toBe(false);
    const {root, container} = mount(
      <PerformanceQaComputedView store={store} label="first" />,
    );
    expect(container.textContent).toBe('first:Initial');
    Object.freeze(derived);
    act(() =>
      root.render(<PerformanceQaComputedView store={store} label="again" />),
    );
    expect(container.textContent).toBe('again:Initial');
    act(() => {
      store.name = 'Updated';
    });
    expect(container.textContent).toBe('again:Updated');
  });
});
