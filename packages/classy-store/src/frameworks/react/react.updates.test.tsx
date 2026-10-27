import {afterEach, describe, expect, mock, test} from 'bun:test';
import {
  act,
  memo,
  type ReactNode,
  Suspense,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createClassyStore} from '../../core/core';
import {useClassyStore} from './react';

const mountedRoots = new Map<Root, HTMLElement>();

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.set(root, container);
  act(() => root.render(element));
  return {root, container};
}

afterEach(() => {
  for (const [root, container] of mountedRoots) {
    act(() => root.unmount());
    container.remove();
  }
  mountedRoots.clear();
});

describe('useClassyStore update consistency', () => {
  test('preserves nested snapshot identity across local state renders', () => {
    const store = createClassyStore({items: ['First']});
    const effect = mock(() => {});

    function Display() {
      const state = useClassyStore(store);
      const items = state.items;
      const updates = useRef(0);
      const [processed, setProcessed] = useState<string[]>([]);
      useEffect(() => {
        effect();
        // Bound the probe so an unstable dependency cannot hang the suite.
        if (updates.current < 3) {
          updates.current++;
          setProcessed([...items]);
        }
      }, [items]);
      return (
        <span>
          {processed[0]}:{updates.current}
        </span>
      );
    }

    const {container} = mount(<Display />);
    expect(container.textContent).toBe('First:1');
    expect(effect).toHaveBeenCalledTimes(1);
  });

  test('recovers from a selector that throws between related property writes', async () => {
    const store = createClassyStore({
      selected: 'first',
      records: {first: {name: 'First'}} as Record<string, {name: string}>,
    });
    const invalidSelections = mock(() => {});
    const selectName = (state: typeof store) => {
      const record = state.records[state.selected];
      if (!record) invalidSelections();
      return record.name;
    };

    function Display() {
      const value = useClassyStore(store, selectName);
      return <span>{value}</span>;
    }

    const {container} = mount(<Display />);
    await act(async () => {
      store.selected = 'second';
      store.records = {second: {name: 'Second'}};
    });
    expect(invalidSelections).toHaveBeenCalled();
    expect(container.textContent).toBe('Second');
    await act(async () => {
      store.records.second.name = 'Updated';
    });
    expect(container.textContent).toBe('Updated');
  });

  test('recovers while array deletion produces transient empty slots', async () => {
    const store = createClassyStore({
      items: [{name: 'First'}, {name: 'Second'}],
    });

    function Display() {
      const names = useClassyStore(store, (state) =>
        state.items.map((item) => item.name).join(','),
      );
      return <span>{names}</span>;
    }

    const {container} = mount(<Display />);
    await act(async () => {
      store.items.splice(0, 1);
    });
    expect(container.textContent).toBe('Second');
    await act(async () => {
      store.items[0].name = 'Updated';
    });
    expect(container.textContent).toBe('Updated');
  });

  test('keeps committed nested reads live through an abandoned transition', async () => {
    const store = createClassyStore({node: {first: 'First', second: 'Second'}});
    const pending = new Promise<void>(() => {});
    const attempts = mock((_field: 'first' | 'second') => {});

    function Display({field}: {field: 'first' | 'second'}) {
      const value = useClassyStore(store).node[field];
      attempts(field);
      if (field === 'second') throw pending;
      return <span>{value}</span>;
    }

    const {root, container} = mount(
      <Suspense fallback="Pending">
        <Display field="first" />
      </Suspense>,
    );
    await act(async () => {
      startTransition(() =>
        root.render(
          <Suspense fallback="Pending">
            <Display field="second" />
          </Suspense>,
        ),
      );
    });
    expect(attempts).toHaveBeenCalledWith('second');
    await act(async () => {
      store.node.first = 'Committed update';
    });
    expect(container.textContent).toBe('Committed update');
    act(() =>
      root.render(
        <Suspense fallback="Pending">
          <Display field="first" />
        </Suspense>,
      ),
    );
    attempts.mockClear();
    await act(async () => {
      store.node.second = 'Discarded branch';
    });
    expect(attempts).not.toHaveBeenCalled();
    await act(async () => {
      store.node.first = 'Still current';
    });
    expect(container.textContent).toBe('Still current');
  });

  test('keeps a memoized child live after its parent renders with unchanged data', async () => {
    const store = createClassyStore({node: {name: 'First', unrelated: 0}});
    const childRenders = mock(() => {});
    const Child = memo(function Child({node}: {node: {readonly name: string}}) {
      childRenders();
      return <span>{node.name}</span>;
    });

    function Display({label}: {label: string}) {
      const state = useClassyStore(store);
      return (
        <div>
          {label}:<Child node={state.node} />
        </div>
      );
    }

    const {root, container} = mount(<Display label="Original" />);
    act(() => root.render(<Display label="Parent update" />));
    expect(childRenders).toHaveBeenCalledTimes(1);
    await act(async () => {
      store.node.name = 'Store update';
    });
    expect(container.textContent).toBe('Parent update:Store update');
    expect(childRenders).toHaveBeenCalledTimes(2);
  });

  test('tracks nested object values held by class symbol fields', () => {
    const key = Symbol('state');
    class SymbolStore {
      [key] = {name: 'First'};
    }
    const store = createClassyStore(new SymbolStore());

    function Display() {
      const state = useClassyStore(store);
      return <span>{state[key].name}</span>;
    }

    const {container} = mount(<Display />);
    expect(container.textContent).toBe('First');
    act(() => {
      store[key].name = 'Updated';
    });
    expect(container.textContent).toBe('Updated');
  });
});
