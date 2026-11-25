import {afterEach, describe, expect, it} from 'bun:test';
import {act, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {useClassyStore} from '../frameworks/react/react';
import {createClassyStore} from '../index';

// The auto-tracked hook follows a snapshot field by field, so a component is
// rendered again only for a field it read. A snapshot that holds an object
// under a symbol key is the exception: it is compared as a whole. These tests
// pin which snapshots are the exception, by counting renders: holding a value
// that is not an object under a symbol key must not cost the field-by-field
// tracking.

const mountedRoots = new Map<Root, HTMLElement>();

function mount(element: ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.set(root, container);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  for (const [root, container] of mountedRoots) {
    act(() => root.unmount());
    container.remove();
  }
  mountedRoots.clear();
});

const key = Symbol('meta');

type State = {
  [key]?: unknown;
  name: string;
  other: number;
};

/** Reads `name` only, and reports each time it is rendered. */
function Name({store, onRender}: {store: State; onRender: () => void}) {
  const state = useClassyStore(store);
  onRender();
  return <span>{state.name}</span>;
}

describe('a component that reads one field of a state with a symbol key', () => {
  it.each([
    {held: 'a number', value: 5},
    {held: 'a string', value: 'five'},
    {held: 'null', value: null},
    {held: 'undefined', value: undefined},
  ])(
    'is not rendered again for a field it did not read when the symbol key holds $held',
    ({value}) => {
      const store = createClassyStore<State>({
        [key]: value,
        name: 'a',
        other: 0,
      });
      let renders = 0;
      const container = mount(
        <Name store={store} onRender={() => renders++} />,
      );

      act(() => {
        store.other = 1;
      });

      expect(container.textContent).toBe('a');
      expect(renders).toBe(1);
    },
  );

  it('is rendered again for a field it did not read when the symbol key holds an object', () => {
    const store = createClassyStore<State>({
      [key]: {label: 'meta'},
      name: 'a',
      other: 0,
    });
    let renders = 0;
    const container = mount(<Name store={store} onRender={() => renders++} />);

    act(() => {
      store.other = 1;
    });

    expect(container.textContent).toBe('a');
    expect(renders).toBe(2);
  });
});
