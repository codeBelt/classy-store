import {afterEach, beforeEach, describe, expect, it, spyOn} from 'bun:test';
import {act, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {reactiveMap} from '../../collections/collections';
import {createClassyStore} from '../../core/core';
import {shallowEqual} from '../../utils/equality/equality';
import {useClassyStore} from './react';

// ── Test harness ────────────────────────────────────────────────────────────

let container: HTMLDivElement;
const roots = new Set<Root>();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  roots.clear();
  container.remove();
});

function render(element: ReactNode): void {
  const root = createRoot(container);
  roots.add(root);
  act(() => {
    root.render(element);
  });
}

type Row = {id: number; done: boolean};

const rows = (count: number): Row[] =>
  Array.from({length: count}, (_, index) => ({
    id: (index * 7919) % count,
    done: false,
  }));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useClassyStore — transactions', () => {
  it.each([
    ['unshift', (items: Row[]) => items.unshift({id: -1, done: false})],
    ['sort', (items: Row[]) => items.sort((a, b) => a.id - b.id)],
    ['reverse', (items: Row[]) => items.reverse()],
    ['splice', (items: Row[]) => items.splice(0, 1)],
  ] as const)(
    '%s on a long list builds one snapshot and renders once',
    (_name, run) => {
      const store = createClassyStore({items: rows(400)});
      let renders = 0;
      function First() {
        renders++;
        const first = useClassyStore(store, (state) => state.items[0]?.id);
        return <span>{first}</span>;
      }
      render(<First />);
      const rendersBefore = renders;
      // Every rebuilt snapshot of the list is frozen exactly once.
      let buildsOfList = 0;
      const originalFreeze = Object.freeze;
      const freezeSpy = spyOn(Object, 'freeze').mockImplementation(((
        value: unknown,
      ) => {
        if (Array.isArray(value) && value.length >= 399) buildsOfList++;
        return originalFreeze(value);
      }) as typeof Object.freeze);

      try {
        act(() => {
          run(store.items);
        });
      } finally {
        freezeSpy.mockRestore();
      }

      expect(buildsOfList).toBe(1);
      expect(renders - rendersBefore).toBeLessThanOrEqual(1);
      expect(container.textContent).toBe(String(store.items[0].id));
    },
  );

  it('a store method that writes many fields renders its consumer once', () => {
    class Form {
      first = '';
      last = '';
      touched = 0;

      fill(first: string, last: string) {
        this.first = first;
        this.touched++;
        this.last = last;
        this.touched++;
      }
    }
    const store = createClassyStore(new Form());
    const seen: string[] = [];
    function Name() {
      const snap = useClassyStore(store);
      const text = `${snap.first} ${snap.last} (${snap.touched})`;
      seen.push(text);
      return <span>{text}</span>;
    }
    render(<Name />);

    act(() => {
      store.fill('Ada', 'Lovelace');
    });

    // No render ever shows the half-filled form.
    expect(seen).toEqual(['  (0)', 'Ada Lovelace (2)']);
  });

  it('a controlled input still updates within the event that changed it', () => {
    const store = createClassyStore({text: 'ab'});
    function Field() {
      const text = useClassyStore(store, (state) => state.text);
      return (
        <input
          value={text}
          onChange={(event) => {
            store.text = event.target.value;
          }}
        />
      );
    }
    render(<Field />);
    const input = container.querySelector('input') as HTMLInputElement;

    act(() => {
      store.text = 'axb';
    });

    expect(input.value).toBe('axb');
  });
});

describe('useClassyStore — values handed back to the store', () => {
  it.each([
    ['selector', false],
    ['auto-tracked', true],
  ] as const)(
    'a row from a rendered list (%s) is stored as an immutable snapshot',
    (_mode, tracked) => {
      const store = createClassyStore({
        todos: [{id: 1, done: false}] as Row[],
        selected: null as Row | null,
      });
      let select: () => void = () => {};
      function List() {
        const selected = useClassyStore(store, (state) => state.todos);
        const snap = useClassyStore(store);
        const todos = tracked ? snap.todos : selected;
        select = () => {
          store.selected = todos[0] as Row;
        };
        return <span>{todos.length}</span>;
      }
      render(<List />);

      act(() => {
        select();
      });

      const stored = store.selected as Row;
      expect(Object.isFrozen(stored)).toBe(true);
      expect(stored).toEqual({id: 1, done: false});
      // Editing goes through the live row, not the stored snapshot.
      expect(() => {
        stored.done = true;
      }).toThrow(TypeError);
      act(() => {
        store.todos[0].done = true;
      });
      expect(store.selected?.done).toBe(false);
    },
  );
});

describe('useClassyStore — shallowEqual selections', () => {
  it('re-renders when a selected Date is replaced by a different instant', () => {
    const store = createClassyStore({due: new Date(0)});
    let renders = 0;
    function Due() {
      renders++;
      const due = useClassyStore(store, (state) => state.due, {
        isEqual: shallowEqual,
      });
      return <span>{due.toISOString()}</span>;
    }
    render(<Due />);

    act(() => {
      store.due = new Date(86_400_000);
    });
    expect(container.textContent).toBe('1970-01-02T00:00:00.000Z');
    const afterChange = renders;

    // The same instant in a new Date object is still equal.
    act(() => {
      store.due = new Date(86_400_000);
    });
    expect(renders).toBe(afterChange);
  });
});

describe('useClassyStore — reactive collections', () => {
  it('an auto-tracked lookup re-renders when the looked-up key appears', () => {
    const store = createClassyStore({
      users: reactiveMap<string, string>([['a', 'Ada']]),
    });
    function Lookup() {
      const snap = useClassyStore(store);
      return (
        <span>
          {snap.users.get('a')}/{snap.users.get('b') ?? 'none'}/
          {String(snap.users.has('c'))}
        </span>
      );
    }
    render(<Lookup />);
    expect(container.textContent).toBe('Ada/none/false');

    act(() => {
      store.users.set('b', 'Bob');
    });
    expect(container.textContent).toBe('Ada/Bob/false');

    act(() => {
      store.users.delete('a');
      store.users.set('c', 'Cy');
    });
    expect(container.textContent).toBe('/Bob/true');
  });
});
