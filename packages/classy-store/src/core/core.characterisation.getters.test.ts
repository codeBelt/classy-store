import {describe, expect, it, mock, spyOn} from 'bun:test';
import {reactiveMap, reactiveSet} from '../collections/index';
import {batch, createClassyStore, snapshot, subscribe} from '../index';

// Characterisation tests for computed getters. They pin what the code does
// today, through the public API only, so that a rewrite of the internals shows
// up as a failing test. A `FINDING` comment marks behaviour that looks like a
// bug, a silent failure or a surprise: it is pinned as it is, not endorsed.

/** Flush the microtask that delivers batched notifications. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Only a store proxy can be subscribed to, which tells it from a raw value. */
function isStoreProxy(value: object): boolean {
  try {
    subscribe(value, () => {})();
    return true;
  } catch {
    return false;
  }
}

/** A synchronous subscriber, so that notifications can be counted at once. */
function watch(store: object) {
  const listener = mock(() => {});
  subscribe(store, listener, {sync: true});
  return listener;
}

// ── Nested getters ───────────────────────────────────────────────────────────

/** `c` reads `b`, `b` reads `a`, `a` reads `count`. Each body counts its runs. */
function createChain() {
  const runs = {a: 0, b: 0, c: 0};
  class Chain {
    count = 1;
    unrelated = 0;

    get a() {
      runs.a++;
      return this.count * 2;
    }

    get b() {
      runs.b++;
      return this.a + 1;
    }

    get c() {
      runs.c++;
      return this.b + 1;
    }
  }
  return {store: createClassyStore(new Chain()), runs};
}

/** As `createChain`, but `a` gives the same result for every positive count. */
function createThresholdChain() {
  const runs = {a: 0, b: 0, c: 0};
  class Threshold {
    count = 1;

    get a() {
      runs.a++;
      return this.count > 0;
    }

    get b() {
      runs.b++;
      return this.a ? 'yes' : 'no';
    }

    get c() {
      runs.c++;
      return `${this.b}!`;
    }
  }
  return {store: createClassyStore(new Threshold()), runs};
}

describe('nested getters, three levels deep, on the live store', () => {
  it('runs each body once on the first read of the outermost getter', () => {
    const {store, runs} = createChain();

    expect(store.c).toBe(4);

    expect(runs).toEqual({a: 1, b: 1, c: 1});
  });

  it('runs nothing again while no dependency changed, whichever level is read', () => {
    const {store, runs} = createChain();

    expect([store.c, store.c, store.b, store.a]).toEqual([4, 4, 3, 2]);

    expect(runs).toEqual({a: 1, b: 1, c: 1});
  });

  it('runs nothing after a write to a field that no getter reads', () => {
    const {store, runs} = createChain();
    expect(store.c).toBe(4);

    store.unrelated = 1;

    expect(store.c).toBe(4);
    expect(runs).toEqual({a: 1, b: 1, c: 1});
  });

  it('runs no body on a write; each level re-runs once when the outermost getter is next read', () => {
    const {store, runs} = createChain();
    expect(store.c).toBe(4);

    store.count = 2;
    expect(runs).toEqual({a: 1, b: 1, c: 1});

    expect(store.c).toBe(6);
    expect(runs).toEqual({a: 2, b: 2, c: 2});
  });

  it('re-runs only the innermost getter when it alone is read after the write', () => {
    const {store, runs} = createChain();
    expect(store.c).toBe(4);
    store.count = 2;

    expect(store.a).toBe(4);
    expect(runs).toEqual({a: 2, b: 1, c: 1});

    // The levels above it re-run when they are read, and `a` does not again.
    expect(store.c).toBe(6);
    expect(runs).toEqual({a: 2, b: 2, c: 2});
  });

  // FINDING: read from the top, every level re-runs although the innermost result did not change.
  it('re-runs every level from the top even when the innermost result is unchanged', () => {
    const {store, runs} = createThresholdChain();
    expect(store.c).toBe('yes!');

    store.count = 2;

    expect(store.c).toBe('yes!');
    expect(runs).toEqual({a: 2, b: 2, c: 2});
  });

  it('skips the outer levels when the innermost getter was re-read first and gave the same result', () => {
    const {store, runs} = createThresholdChain();
    expect(store.c).toBe('yes!');
    store.count = 2;

    expect(store.a).toBe(true);
    expect(store.c).toBe('yes!');

    expect(runs).toEqual({a: 2, b: 1, c: 1});
  });

  it('skips the outermost level when the middle getter was re-read first and gave the same result', () => {
    const {store, runs} = createThresholdChain();
    expect(store.c).toBe('yes!');
    store.count = 2;

    expect(store.b).toBe('yes');
    expect(store.c).toBe('yes!');

    expect(runs).toEqual({a: 2, b: 2, c: 1});
  });

  it('runs a getter that two others read once per change', () => {
    const runs = {base: 0, left: 0, right: 0, both: 0};
    class Diamond {
      count = 1;

      get base() {
        runs.base++;
        return this.count + 1;
      }

      get left() {
        runs.left++;
        return this.base * 2;
      }

      get right() {
        runs.right++;
        return this.base * 3;
      }

      get both() {
        runs.both++;
        return this.left + this.right;
      }
    }
    const store = createClassyStore(new Diamond());

    expect(store.both).toBe(10);
    expect(runs).toEqual({base: 1, left: 1, right: 1, both: 1});

    store.count = 2;
    expect(store.both).toBe(15);
    expect(runs).toEqual({base: 2, left: 2, right: 2, both: 2});
  });
});

describe('nested getters, three levels deep, on snapshots', () => {
  it('runs no getter when the snapshot is taken', () => {
    const {store, runs} = createChain();

    snapshot(store);

    expect(runs).toEqual({a: 0, b: 0, c: 0});
  });

  it('runs each body again on the first snapshot read, after the live store has computed them', () => {
    const {store, runs} = createChain();
    expect(store.c).toBe(4);

    expect(snapshot(store).c).toBe(4);

    expect(runs).toEqual({a: 2, b: 2, c: 2});
  });

  it('runs each body again on the live store, after a snapshot has computed them', () => {
    const {store, runs} = createChain();
    expect(snapshot(store).c).toBe(4);

    expect(store.c).toBe(4);

    expect(runs).toEqual({a: 2, b: 2, c: 2});
  });

  it('runs nothing again on the same snapshot, whichever level is read', () => {
    const {store, runs} = createChain();
    const snap = snapshot(store);

    expect([snap.c, snap.c, snap.b, snap.a]).toEqual([4, 4, 3, 2]);

    expect(runs).toEqual({a: 1, b: 1, c: 1});
  });

  // FINDING: the first nested read keeps only the outermost getter memoized for the next snapshot.
  // Each outer evaluation replaces the memo map that the getters under it had just filled.
  it('re-runs the two inner getters, not the outermost, on the next snapshot after an unrelated write', () => {
    const {store, runs} = createChain();
    expect(snapshot(store).c).toBe(4);

    store.unrelated = 1;

    expect(snapshot(store).c).toBe(4);
    expect(runs).toEqual({a: 2, b: 2, c: 1});
  });

  it('runs nothing on the snapshot after that one', () => {
    const {store, runs} = createChain();
    expect(snapshot(store).c).toBe(4);
    store.unrelated = 1;
    expect(snapshot(store).c).toBe(4);

    store.unrelated = 2;

    expect(snapshot(store).c).toBe(4);
    expect(runs).toEqual({a: 2, b: 2, c: 1});
  });

  // FINDING: an inner getter's result changes identity on the next snapshot if an outer getter was read first.
  it('gives an inner getter result a new identity on the next snapshot when the outer getter was read first', () => {
    class Numbers {
      values = [1, 2, 3];
      theme = 'dark';

      get large() {
        return this.values.filter((value) => value > 1);
      }

      get largeCount() {
        return this.large.length;
      }
    }
    const store = createClassyStore(new Numbers());
    const first = snapshot(store);
    expect(first.largeCount).toBe(2);
    const large = first.large;

    store.theme = 'light';

    expect(snapshot(store).large).not.toBe(large);
    expect(snapshot(store).large).toEqual([2, 3]);
  });

  it('keeps the inner getter result identity when the inner getter was read first', () => {
    class Numbers {
      values = [1, 2, 3];
      theme = 'dark';

      get large() {
        return this.values.filter((value) => value > 1);
      }

      get largeCount() {
        return this.large.length;
      }
    }
    const store = createClassyStore(new Numbers());
    const first = snapshot(store);
    const large = first.large;
    expect(first.largeCount).toBe(2);

    store.theme = 'light';

    expect(snapshot(store).large).toBe(large);
  });

  it('re-runs each level once on a snapshot taken after the bottom field changed', () => {
    const {store, runs} = createChain();
    expect(snapshot(store).c).toBe(4);

    store.count = 2;

    expect(snapshot(store).c).toBe(6);
    expect(runs).toEqual({a: 2, b: 2, c: 2});
  });

  it('skips the outer levels when a memoized inner getter recomputes to the same result', () => {
    const {store, runs} = createThresholdChain();
    // Two snapshot reads leave all three levels memoized (see the FINDING above).
    expect(snapshot(store).c).toBe('yes!');
    store.count = 2;
    expect(snapshot(store).c).toBe('yes!');
    expect(runs).toEqual({a: 2, b: 2, c: 1});

    store.count = 3;

    expect(snapshot(store).c).toBe('yes!');
    expect(runs).toEqual({a: 3, b: 2, c: 1});
  });

  it('recomputes for an older snapshot read after a newer one, and again for the snapshot after it', () => {
    let runs = 0;
    class Tens {
      count = 1;

      get tens() {
        runs++;
        return this.count * 10;
      }
    }
    const store = createClassyStore(new Tens());
    const older = snapshot(store);
    store.count = 2;
    const newer = snapshot(store);

    expect([newer.tens, older.tens, newer.tens]).toEqual([20, 10, 20]);
    expect(runs).toBe(2);

    // One computation is remembered across snapshots: now the older one's.
    store.count = 3;
    store.count = 2;
    expect(snapshot(store).tens).toBe(20);
    expect(runs).toBe(3);
  });
});

// ── Getters that read children ───────────────────────────────────────────────

function createPreferences() {
  let runs = 0;
  class Preferences {
    settings: {
      theme: string;
      locale: string;
      deep: {level: number};
      added?: number;
    } = {theme: 'dark', locale: 'en', deep: {level: 1}};
    sibling = {size: 1};
    count = 0;

    get theme() {
      runs++;
      return this.settings.theme;
    }
  }
  return {store: createClassyStore(new Preferences()), runs: () => runs};
}

describe('a getter that reads one field of a nested object', () => {
  it('is not re-run by a write to a sibling of that object', () => {
    const {store, runs} = createPreferences();
    expect(store.theme).toBe('dark');

    store.count = 1;
    store.sibling.size = 2;

    expect(store.theme).toBe('dark');
    expect(runs()).toBe(1);
  });

  it('is re-run by a write to a field it never read, at any depth under that object', () => {
    const {store, runs} = createPreferences();
    expect(store.theme).toBe('dark');

    store.settings.locale = 'fr';
    expect(store.theme).toBe('dark');
    expect(runs()).toBe(2);

    store.settings.deep.level = 2;
    expect(store.theme).toBe('dark');
    expect(runs()).toBe(3);
  });

  it('is not re-run by a write of the value the field already has', () => {
    const {store, runs} = createPreferences();
    expect(store.theme).toBe('dark');

    store.settings.theme = 'dark';
    store.settings.deep.level = 1;

    expect(store.theme).toBe('dark');
    expect(runs()).toBe(1);
  });

  it('is re-run when the object is replaced by an equal one', () => {
    const {store, runs} = createPreferences();
    expect(store.theme).toBe('dark');

    store.settings = {theme: 'dark', locale: 'en', deep: {level: 1}};

    expect(store.theme).toBe('dark');
    expect(runs()).toBe(2);
  });

  it('is not re-run by a write to the object that was replaced', () => {
    const {store, runs} = createPreferences();
    const replaced = store.settings;
    store.settings = {theme: 'light', locale: 'en', deep: {level: 1}};
    expect(store.theme).toBe('light');

    replaced.theme = 'ignored';

    expect(store.theme).toBe('light');
    expect(runs()).toBe(1);
  });

  it('is re-run when a key is added to the object, and when one is deleted', () => {
    const {store, runs} = createPreferences();
    expect(store.theme).toBe('dark');

    store.settings.added = 1;
    expect(store.theme).toBe('dark');
    expect(runs()).toBe(2);

    delete store.settings.added;
    expect(store.theme).toBe('dark');
    expect(runs()).toBe(3);
  });

  // FINDING: deleting a key the object never had counts as a change and re-runs the getter.
  it('is re-run when a key the object never had is deleted', () => {
    const {store, runs} = createPreferences();
    expect(store.theme).toBe('dark');

    delete store.settings.added;

    expect(store.theme).toBe('dark');
    expect(runs()).toBe(2);
  });
});

type Todo = {name: string; done: boolean};

function createTodoList() {
  const runs = {index: 0, length: 0, filter: 0, map: 0, reduce: 0, loop: 0};
  class TodoList {
    items: Todo[] = [
      {name: 'a', done: false},
      {name: 'b', done: true},
    ];
    count = 0;

    get firstName() {
      runs.index++;
      return this.items[0].name;
    }

    get size() {
      runs.length++;
      return this.items.length;
    }

    get open() {
      runs.filter++;
      return this.items.filter((item) => !item.done);
    }

    get names() {
      runs.map++;
      return this.items.map((item) => item.name);
    }

    get doneCount() {
      runs.reduce++;
      return this.items.reduce((count, item) => count + (item.done ? 1 : 0), 0);
    }

    get joined() {
      runs.loop++;
      let joined = '';
      for (const item of this.items) joined += item.name;
      return joined;
    }
  }
  const store = createClassyStore(new TodoList());
  const readAll = () => [
    store.firstName,
    store.size,
    store.open.length,
    store.names,
    store.doneCount,
    store.joined,
  ];
  return {store, runs, readAll};
}

describe('getters that read an array: an index, length, filter, map, reduce and for...of', () => {
  it('each run once, and not again while the array is untouched', () => {
    const {runs, readAll} = createTodoList();

    expect(readAll()).toEqual(['a', 2, 1, ['a', 'b'], 1, 'ab']);
    expect(readAll()).toEqual(['a', 2, 1, ['a', 'b'], 1, 'ab']);

    expect(runs).toEqual({
      index: 1,
      length: 1,
      filter: 1,
      map: 1,
      reduce: 1,
      loop: 1,
    });
  });

  it('all re-run after a write to one element, whatever part of the array each one read', () => {
    const {store, runs, readAll} = createTodoList();
    readAll();

    store.items[1].name = 'B';

    // `firstName` read only element 0 and `size` read only the length.
    expect(readAll()).toEqual(['a', 2, 1, ['a', 'B'], 1, 'aB']);
    expect(runs).toEqual({
      index: 2,
      length: 2,
      filter: 2,
      map: 2,
      reduce: 2,
      loop: 2,
    });
  });

  it('none re-run after a sibling write, a same-value write or a sort that moves nothing', () => {
    const {store, runs, readAll} = createTodoList();
    readAll();

    store.count = 1;
    store.items[1].done = true;
    store.items.sort((left, right) => left.name.localeCompare(right.name));

    expect(readAll()).toEqual(['a', 2, 1, ['a', 'b'], 1, 'ab']);
    expect(runs).toEqual({
      index: 1,
      length: 1,
      filter: 1,
      map: 1,
      reduce: 1,
      loop: 1,
    });
  });

  it.each([
    ['push', (items: Todo[]) => items.push({name: 'c', done: false})],
    ['reverse', (items: Todo[]) => items.reverse()],
    ['splice', (items: Todo[]) => items.splice(0, 1)],
    [
      'an element replaced',
      (items: Todo[]) => {
        items[0] = {name: 'z', done: false};
      },
    ],
    [
      'a length write',
      (items: Todo[]) => {
        items.length = 1;
      },
    ],
  ] as const)('all re-run once after %s', (_name, change) => {
    const {store, runs, readAll} = createTodoList();
    readAll();

    change(store.items);
    readAll();

    expect(runs).toEqual({
      index: 2,
      length: 2,
      filter: 2,
      map: 2,
      reduce: 2,
      loop: 2,
    });
  });
});

function createDirectory() {
  const runs = {size: 0, has: 0, names: 0, tagged: 0};
  class Directory {
    users = reactiveMap<string, {name: string}>([['a', {name: 'Ada'}]]);
    tags = reactiveSet<string>(['x']);
    count = 0;

    get userCount() {
      runs.size++;
      return this.users.size;
    }

    get hasB() {
      runs.has++;
      return this.users.has('b');
    }

    get names() {
      runs.names++;
      return [...this.users.values()].map((user) => user.name);
    }

    get tagged() {
      runs.tagged++;
      return this.tags.has('y');
    }
  }
  return {store: createClassyStore(new Directory()), runs};
}

describe('getters that read a reactive collection', () => {
  it('re-run after a new key, after an edit to a stored value, and after a delete', () => {
    const {store, runs} = createDirectory();
    expect([store.userCount, store.hasB, store.names]).toEqual([
      1,
      false,
      ['Ada'],
    ]);

    store.users.set('b', {name: 'Bob'});
    expect([store.userCount, store.hasB, store.names]).toEqual([
      2,
      true,
      ['Ada', 'Bob'],
    ]);

    // `userCount` and `hasB` never read a value, and still re-run.
    const bob = store.users.get('b');
    if (bob) bob.name = 'Bobby';
    expect([store.userCount, store.hasB, store.names]).toEqual([
      2,
      true,
      ['Ada', 'Bobby'],
    ]);

    store.users.delete('a');
    expect([store.userCount, store.hasB, store.names]).toEqual([
      1,
      true,
      ['Bobby'],
    ]);

    expect(runs).toEqual({size: 4, has: 4, names: 4, tagged: 0});
  });

  it('do not re-run after the stored value is set again, a missing key is deleted, or a sibling is written', () => {
    const {store, runs} = createDirectory();
    expect([store.userCount, store.hasB, store.names]).toEqual([
      1,
      false,
      ['Ada'],
    ]);

    const ada = store.users.get('a');
    if (ada) store.users.set('a', ada);
    store.users.delete('missing');
    store.count = 1;
    store.tags.add('z');

    expect([store.userCount, store.hasB, store.names]).toEqual([
      1,
      false,
      ['Ada'],
    ]);
    expect(runs).toEqual({size: 1, has: 1, names: 1, tagged: 0});
  });

  it('over a set re-run after add and clear, not after a duplicate add or a clear when empty', () => {
    const {store, runs} = createDirectory();
    expect(store.tagged).toBe(false);

    store.tags.add('x');
    expect(store.tagged).toBe(false);
    expect(runs.tagged).toBe(1);

    store.tags.add('y');
    expect(store.tagged).toBe(true);
    expect(runs.tagged).toBe(2);

    store.tags.clear();
    expect(store.tagged).toBe(false);
    expect(runs.tagged).toBe(3);

    store.tags.clear();
    expect(store.tagged).toBe(false);
    expect(runs.tagged).toBe(3);
  });

  it('evaluate on a snapshot and stay memoized across an unrelated write', () => {
    const {store, runs} = createDirectory();
    const first = snapshot(store);
    expect([first.userCount, first.hasB, first.names, first.tagged]).toEqual([
      1,
      false,
      ['Ada'],
      false,
    ]);

    store.count = 1;
    const second = snapshot(store);

    expect([second.userCount, second.hasB, second.tagged]).toEqual([
      1,
      false,
      false,
    ]);
    expect(second.names).toBe(first.names);
    expect(runs).toEqual({size: 1, has: 1, names: 1, tagged: 1});
  });
});

describe('getters that reach beyond their own fields', () => {
  it('a root getter that reads a child getter re-runs after any write under the child; the child getter only when its own dependency changed', () => {
    const runs = {root: 0, child: 0};
    const store = createClassyStore({
      cart: {
        prices: [1, 2],
        note: '',
        get total(): number {
          runs.child++;
          return this.prices.reduce((sum, price) => sum + price, 0);
        },
      },
      get summary(): string {
        runs.root++;
        return `total ${this.cart.total}`;
      },
    });
    expect(store.summary).toBe('total 3');
    expect(runs).toEqual({root: 1, child: 1});

    store.cart.note = 'gift';
    expect(store.summary).toBe('total 3');
    expect(runs).toEqual({root: 2, child: 1});

    store.cart.prices.push(3);
    expect(store.summary).toBe('total 6');
    expect(runs).toEqual({root: 3, child: 2});
  });

  it('a getter that reads a store embedded as a child re-runs when that store changes', () => {
    const editor = createClassyStore({text: 'a'});
    let runs = 0;
    const app = createClassyStore({
      editor,
      get upper(): string {
        runs++;
        return this.editor.text.toUpperCase();
      },
    });
    expect(app.upper).toBe('A');

    editor.text = 'b';

    expect(app.upper).toBe('B');
    expect(runs).toBe(2);
  });

  // FINDING: a getter that reads another store is never re-run by a write to that store.
  it('a getter that reads another store keeps its result after that store changes', () => {
    const rates = createClassyStore({tax: 1});
    let runs = 0;
    const cart = createClassyStore({
      net: 1,
      get gross(): number {
        runs++;
        return this.net + rates.tax;
      },
    });
    expect(cart.gross).toBe(2);

    rates.tax = 5;

    expect(cart.gross).toBe(2);
    expect(runs).toBe(1);

    // A write to one of its own fields re-runs it, and it then sees both.
    cart.net = 2;
    expect(cart.gross).toBe(7);
  });

  // FINDING: the same holds on snapshots, including the snapshot after an unrelated write.
  it('a snapshot getter that reads another store keeps its result after that store changes', () => {
    const rates = createClassyStore({tax: 1});
    const cart = createClassyStore({
      net: 1,
      note: '',
      get gross(): number {
        return this.net + rates.tax;
      },
    });
    const first = snapshot(cart);
    expect(first.gross).toBe(2);

    rates.tax = 5;
    expect(snapshot(cart)).toBe(first);
    expect(first.gross).toBe(2);

    cart.note = 'later';
    expect(snapshot(cart)).not.toBe(first);
    expect(snapshot(cart).gross).toBe(2);
  });

  // FINDING: a getter that reads its own child through a reference held outside `this` is never re-run.
  it('a getter that reads a child through a held reference keeps its result after the child changes', () => {
    let held: number[] = [];
    let runs = 0;
    const store = createClassyStore({
      items: [1, 2],
      get count(): number {
        runs++;
        return held.length;
      },
    });
    held = store.items;
    expect(store.count).toBe(2);

    store.items.push(3);

    expect(held.length).toBe(3);
    expect(store.count).toBe(2);
    expect(runs).toBe(1);
  });
});

// ── Getters that return an object or an array ────────────────────────────────

function createCatalogue() {
  const rawItems = [{id: 1}, {id: 2}];
  class Catalogue {
    count = 1;
    unrelated = 0;
    items = rawItems;

    get view() {
      return {n: this.count};
    }

    get pair() {
      return [this.count, this.count + 1];
    }

    get all() {
      return this.items;
    }

    get positive() {
      return this.items.filter((item) => item.id > 0);
    }
  }
  return {store: createClassyStore(new Catalogue()), rawItems};
}

describe('a getter that returns an object or an array, on the live store', () => {
  it('returns the same object and the same array between reads, also after an unrelated write', () => {
    const {store} = createCatalogue();
    const view = store.view;
    const pair = store.pair;

    store.unrelated = 1;

    expect(store.view).toBe(view);
    expect(store.pair).toBe(pair);
  });

  it('returns a new object and a new array after a dependency changes', () => {
    const {store} = createCatalogue();
    const view = store.view;
    const pair = store.pair;

    store.count = 2;

    expect(store.view).not.toBe(view);
    expect(store.view).toEqual({n: 2});
    expect(store.pair).not.toBe(pair);
    expect(store.pair).toEqual([2, 3]);
  });

  it('returns the value the getter built as it is: not a store proxy and not frozen', () => {
    const {store} = createCatalogue();

    expect(isStoreProxy(store.view)).toBe(false);
    expect(Object.isFrozen(store.view)).toBe(false);
    expect(isStoreProxy(store.pair)).toBe(false);
    expect(Object.isFrozen(store.pair)).toBe(false);
  });

  // FINDING: the returned object is the cached one, so mutating it changes later reads, silently.
  it('returns a mutated result again on later reads, and the mutation notifies no one', () => {
    const {store} = createCatalogue();
    const listener = watch(store);

    store.view.n = 99;
    store.pair.push(7);

    expect(store.view).toEqual({n: 99});
    expect(store.pair).toEqual([1, 2, 7]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns the child proxy when the getter returns a child', () => {
    const {store, rawItems} = createCatalogue();

    expect(store.all).toBe(store.items);
    expect(store.all).not.toBe(rawItems);
    expect(isStoreProxy(store.all)).toBe(true);
  });

  it('returns a plain array of child proxies from a filter getter', () => {
    const {store, rawItems} = createCatalogue();
    const positive = store.positive;

    expect(isStoreProxy(positive)).toBe(false);
    expect(Object.isFrozen(positive)).toBe(false);
    expect(positive[0]).toBe(store.items[0]);
    expect(positive[0]).not.toBe(rawItems[0]);
  });

  it('notifies once for a write through an element of a filter result, and then returns a new array', () => {
    const {store} = createCatalogue();
    const listener = watch(store);
    const positive = store.positive;

    positive[0].id = 10;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.items[0].id).toBe(10);
    expect(store.positive).not.toBe(positive);
  });
});

describe('a getter that returns an object or an array, on a snapshot', () => {
  // FINDING: the object a getter returns on a snapshot is not frozen, though the snapshot is.
  it('returns an unfrozen object from a deeply frozen snapshot', () => {
    const {store} = createCatalogue();
    const snap = snapshot(store);

    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.view)).toBe(false);
    expect(Object.isFrozen(snap.pair)).toBe(false);
  });

  // FINDING: mutating that object changes what this snapshot and the next ones return.
  it('carries a mutation of the returned object into the next snapshot', () => {
    const {store} = createCatalogue();
    const first = snapshot(store);

    (first.view as {n: number}).n = 99;
    expect(first.view).toEqual({n: 99});

    store.unrelated = 1;
    const second = snapshot(store);
    expect(second).not.toBe(first);
    expect(second.view).toBe(first.view);
    expect(second.view).toEqual({n: 99});

    // The live store computed its own object and is unaffected.
    expect(store.view).toEqual({n: 1});
  });

  it('returns the frozen child snapshot when the getter returns a child', () => {
    const {store} = createCatalogue();
    const snap = snapshot(store);

    expect(snap.all).toBe(snap.items);
    expect(Object.isFrozen(snap.all)).toBe(true);
  });

  it('returns an unfrozen array of frozen element snapshots from a filter getter', () => {
    const {store} = createCatalogue();
    const snap = snapshot(store);

    expect(Object.isFrozen(snap.positive)).toBe(false);
    expect(snap.positive[0]).toBe(snap.items[0]);
    expect(Object.isFrozen(snap.positive[0])).toBe(true);
  });
});

// ── Cycles ───────────────────────────────────────────────────────────────────

function createCycle() {
  class Cycle {
    closed = false;

    get a(): number {
      return this.b + 1;
    }

    get b(): number {
      return this.a + 1;
    }

    get self(): number {
      return this.self + 1;
    }

    get fine() {
      return 'fine';
    }

    // `x` and `y` read each other only while `closed` is true.
    get x(): number {
      return this.closed ? this.y : 1;
    }

    get y(): number {
      return this.x + 1;
    }
  }
  return createClassyStore(new Cycle());
}

/** Run `read` and return what it threw. */
function thrownBy(read: () => unknown): unknown {
  try {
    read();
  } catch (error) {
    return error;
  }
  throw new Error('expected the read to throw');
}

describe('getters that read each other in a cycle', () => {
  it('throw a plain Error that names the path, starting from the getter that was read', () => {
    const store = createCycle();

    const fromA = thrownBy(() => store.a);
    const fromB = thrownBy(() => store.b);

    expect(Object.getPrototypeOf(fromA)).toBe(Error.prototype);
    expect((fromA as Error).message).toBe(
      '@codebelt/classy-store [getter-cycle]: a → b → a',
    );
    expect((fromB as Error).message).toBe(
      '@codebelt/classy-store [getter-cycle]: b → a → b',
    );
  });

  it('name a getter that reads itself twice', () => {
    const store = createCycle();

    expect((thrownBy(() => store.self) as Error).message).toBe(
      '@codebelt/classy-store [getter-cycle]: self → self',
    );
  });

  it('throw a new error on every read', () => {
    const store = createCycle();

    const first = thrownBy(() => store.a);
    const second = thrownBy(() => store.a);

    expect(second).not.toBe(first);
    expect((second as Error).message).toBe((first as Error).message);
  });

  it('name symbol-keyed getters by their description', () => {
    const alpha = Symbol('alpha');
    const unnamed = Symbol();
    const store = createClassyStore({
      get [alpha](): number {
        return this[unnamed] + 1;
      },
      get [unnamed](): number {
        return this[alpha] + 1;
      },
    });

    expect((thrownBy(() => store[alpha]) as Error).message).toBe(
      '@codebelt/classy-store [getter-cycle]: Symbol(alpha) → Symbol() → Symbol(alpha)',
    );
  });

  it('leave the other getters of the store working', () => {
    const store = createCycle();
    expect(() => store.a).toThrow();

    expect(store.fine).toBe('fine');
    expect(store.x).toBe(1);
  });

  it('throw only while the state closes the cycle', () => {
    const store = createCycle();
    expect([store.x, store.y]).toEqual([1, 2]);

    store.closed = true;
    expect((thrownBy(() => store.x) as Error).message).toBe(
      '@codebelt/classy-store [getter-cycle]: x → y → x',
    );
    expect((thrownBy(() => store.y) as Error).message).toBe(
      '@codebelt/classy-store [getter-cycle]: y → x → y',
    );

    store.closed = false;
    expect([store.x, store.y]).toEqual([1, 2]);
  });

  // FINDING: on a snapshot the same cycle is not detected: it overflows the stack with a RangeError.
  it('overflow the stack on a snapshot instead of reporting the cycle', () => {
    const snap = snapshot(createCycle());

    expect(() => snap.a).toThrow(RangeError);
    expect(() => snap.self).toThrow(RangeError);

    // The snapshot is still usable afterwards.
    expect(snap.fine).toBe('fine');
    expect(snap.x).toBe(1);
  });
});

// ── A getter that throws ─────────────────────────────────────────────────────

function createLoader() {
  const runs = {strict: 0, outer: 0};
  class Loader {
    count = 0;
    unrelated = 0;

    get strict(): number {
      runs.strict++;
      if (this.count === 0)
        throw new RangeError(`not ready (run ${runs.strict})`);
      return this.count * 2;
    }

    get outer(): number {
      runs.outer++;
      return this.strict + 1;
    }
  }
  return {store: createClassyStore(new Loader()), runs};
}

describe('a getter that throws', () => {
  it('runs its body and throws a new error on every read', () => {
    const {store, runs} = createLoader();

    const first = thrownBy(() => store.strict);
    const second = thrownBy(() => store.strict);

    expect(first).toBeInstanceOf(RangeError);
    expect((first as Error).message).toBe('not ready (run 1)');
    expect((second as Error).message).toBe('not ready (run 2)');
    expect(runs.strict).toBe(2);
  });

  it('keeps throwing after a write to a field it never read', () => {
    const {store, runs} = createLoader();
    expect(() => store.strict).toThrow('not ready (run 1)');

    store.unrelated = 1;

    expect(() => store.strict).toThrow('not ready (run 2)');
    expect(runs.strict).toBe(2);
  });

  it('returns a value once its dependency changes, and caches it from then on', () => {
    const {store, runs} = createLoader();
    expect(() => store.strict).toThrow('not ready (run 1)');

    store.count = 2;

    expect([store.strict, store.strict]).toEqual([4, 4]);
    expect(runs.strict).toBe(2);
  });

  it('throws again when its dependency returns to the failing value', () => {
    const {store} = createLoader();
    store.count = 2;
    expect(store.strict).toBe(4);

    store.count = 0;

    expect(() => store.strict).toThrow('not ready (run 2)');
  });

  it('passes its error through a getter that reads it, which is not cached either', () => {
    const {store, runs} = createLoader();

    expect(() => store.outer).toThrow('not ready (run 1)');
    expect(() => store.outer).toThrow('not ready (run 2)');
    expect(runs).toEqual({strict: 2, outer: 2});

    store.count = 2;
    expect([store.outer, store.outer]).toEqual([5, 5]);
    expect(runs).toEqual({strict: 3, outer: 3});
  });

  it('throws on every read of a snapshot, while a snapshot taken after the fix returns', () => {
    const {store, runs} = createLoader();
    const broken = snapshot(store);

    expect(() => broken.strict).toThrow('not ready (run 1)');
    expect(() => broken.strict).toThrow('not ready (run 2)');

    store.count = 2;
    expect(snapshot(store).strict).toBe(4);
    expect(() => broken.strict).toThrow('not ready (run 4)');
    expect(runs.strict).toBe(4);
  });

  // FINDING: a snapshot cannot be spread or serialised while one of its getters throws.
  it('makes spreading and JSON.stringify of the snapshot throw, but not Object.keys', () => {
    const {store} = createLoader();
    const snap = snapshot(store);

    expect(() => ({...snap})).toThrow(RangeError);
    expect(() => JSON.stringify(snap)).toThrow(RangeError);
    expect(Object.keys(snap)).toEqual([
      'count',
      'unrelated',
      'strict',
      'outer',
    ]);

    // The live store keeps class getters off its own keys, so it is unaffected.
    expect({...store}).toEqual({count: 0, unrelated: 0});
    expect(JSON.stringify(store)).toBe('{"count":0,"unrelated":0}');
  });
});

function createGuarded() {
  let runs = 0;
  class Guarded {
    ready = false;

    get strict(): string {
      if (!this.ready) throw new Error('not ready');
      return 'ready';
    }

    get safe(): string {
      runs++;
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  return {store: createClassyStore(new Guarded()), runs: () => runs};
}

describe('a getter that catches the error of another getter', () => {
  // FINDING: it records no dependency on the getter that threw, so it never leaves its fallback.
  it('keeps its fallback on the live store after the other getter recovers', () => {
    const {store, runs} = createGuarded();
    expect(store.safe).toBe('fallback');

    store.ready = true;

    expect(store.strict).toBe('ready');
    expect(store.safe).toBe('fallback');
    expect(runs()).toBe(1);

    // A snapshot of the same state computes it afresh and disagrees.
    expect(snapshot(store).safe).toBe('ready');
  });

  // FINDING: the snapshot layer has the same gap once a snapshot computed the fallback.
  it('keeps its fallback on later snapshots after the other getter recovers', () => {
    const {store, runs} = createGuarded();
    expect(snapshot(store).safe).toBe('fallback');

    store.ready = true;

    expect(snapshot(store).strict).toBe('ready');
    expect(snapshot(store).safe).toBe('fallback');
    expect(runs()).toBe(1);
  });
});

// ── A getter that writes to the store ────────────────────────────────────────

function createAudited() {
  const runs = {counted: 0, logged: 0};
  class Audited {
    count = 1;
    reads = 0;
    log = '';

    // Writes a field it also reads.
    get counted() {
      runs.counted++;
      this.reads++;
      return this.count;
    }

    // Writes a field it does not read.
    get logged() {
      runs.logged++;
      this.log = `saw ${this.count}`;
      return this.count * 2;
    }
  }
  return {store: createClassyStore(new Audited()), runs};
}

describe('a getter that writes to the store while it runs', () => {
  // FINDING: a getter that writes a field it reads is never memoized and notifies on every read.
  it('re-runs, writes and notifies on every read when it writes a field it reads', async () => {
    const {store, runs} = createAudited();
    const sync = watch(store);
    const batched = mock(() => {});
    subscribe(store, batched);

    expect([store.counted, store.counted, store.counted]).toEqual([1, 1, 1]);

    expect(runs.counted).toBe(3);
    expect(store.reads).toBe(3);
    expect(sync).toHaveBeenCalledTimes(3);
    await flush();
    expect(batched).toHaveBeenCalledTimes(1);
  });

  it('writes and notifies once per recomputation when it writes a field it does not read', () => {
    const {store, runs} = createAudited();
    const listener = watch(store);

    expect([store.logged, store.logged]).toEqual([2, 2]);
    expect(store.log).toBe('saw 1');
    expect(runs.logged).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    store.count = 2;
    expect(store.log).toBe('saw 1');
    expect(store.logged).toBe(4);
    expect(store.log).toBe('saw 2');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('never settles when it pushes to an array it reads', () => {
    let runs = 0;
    const store = createClassyStore({
      items: [1],
      get grown(): number {
        runs++;
        this.items.push(this.items.length + 1);
        return this.items.length;
      },
    });

    expect([store.grown, store.grown]).toEqual([2, 3]);

    expect(runs).toBe(2);
    expect(store.items).toEqual([1, 2, 3]);
  });

  // FINDING: a sync subscriber that reads the getter during that write gets a circular-dependency error.
  it('reports a circular dependency to a sync subscriber that reads the getter during its write', () => {
    const {store} = createAudited();
    const seen: number[] = [];
    const report = spyOn(console, 'error').mockImplementation(() => {});
    try {
      subscribe(
        store,
        () => {
          seen.push(store.counted);
        },
        {sync: true},
      );

      expect(store.counted).toBe(1);

      // The subscriber's own read threw, so it recorded nothing.
      expect(seen).toEqual([]);
      expect(report).toHaveBeenCalledTimes(1);
      const [reported] = report.mock.calls[0];
      expect((reported as Error).message).toBe(
        '@codebelt/classy-store [getter-cycle]: counted → counted',
      );
    } finally {
      report.mockRestore();
    }
  });

  // FINDING: on a snapshot the write is dropped without an error, although the snapshot is frozen.
  it('drops the write on a snapshot: no error, no notification, snapshot and store unchanged', () => {
    const {store} = createAudited();
    const snap = snapshot(store);
    const listener = watch(store);

    expect(snap.counted).toBe(1);
    expect(snap.logged).toBe(2);

    expect(Object.isFrozen(snap)).toBe(true);
    expect([snap.reads, snap.log]).toEqual([0, '']);
    expect([store.reads, store.log]).toEqual([0, '']);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── Getters on an object literal ─────────────────────────────────────────────

function createLiteral() {
  let runs = 0;
  const store = createClassyStore({
    count: 2,
    get double() {
      runs++;
      return this.count * 2;
    },
  });
  return {store, runs: () => runs};
}

describe('a getter on an object literal passed to createClassyStore', () => {
  it('is memoized like a class getter, and spread and JSON.stringify read the memoized result', () => {
    const {store, runs} = createLiteral();

    expect([store.double, store.double]).toEqual([4, 4]);
    expect({...store}).toEqual({count: 2, double: 4});
    expect(JSON.stringify(store)).toBe('{"count":2,"double":4}');
    expect(runs()).toBe(1);

    store.count = 3;
    expect(store.double).toBe(6);
    expect(runs()).toBe(2);
  });

  it('is an own enumerable key of the store, where a class getter is not', () => {
    const {store: literal} = createLiteral();
    class Counter {
      count = 2;

      get double() {
        return this.count * 2;
      }
    }
    const instance = createClassyStore(new Counter());

    expect(Object.keys(literal)).toEqual(['count', 'double']);
    expect(Object.hasOwn(literal, 'double')).toBe(true);
    expect(Object.keys(instance)).toEqual(['count']);
    expect(Object.hasOwn(instance, 'double')).toBe(false);
    expect('double' in instance).toBe(true);

    // So the live store leaves a class getter out of a copy; a snapshot does not.
    expect({...instance}).toEqual({count: 2});
    expect(JSON.stringify(instance)).toBe('{"count":2}');
    expect(JSON.stringify(snapshot(instance))).toBe('{"count":2,"double":4}');
  });

  it('throws a TypeError when assigned to, and notifies no one', () => {
    const {store} = createLiteral();
    const listener = watch(store);

    expect(() => {
      (store as {double: number}).double = 5;
    }).toThrow(TypeError);

    expect(store.double).toBe(4);
    expect(listener).not.toHaveBeenCalled();
  });

  it('can be deleted, which notifies once, and a data value can then take its place', () => {
    const {store} = createLiteral();
    const writable = store as {count: number; double?: number};
    const listener = watch(store);

    expect(delete writable.double).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(writable.double).toBeUndefined();
    expect(Object.keys(store)).toEqual(['count']);
    expect(snapshot(writable)).toEqual({count: 2});

    writable.double = 7;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(writable.double).toBe(7);
    expect(snapshot(writable)).toEqual({count: 2, double: 7});
  });

  // FINDING: the cache is keyed by property name, so a redefined getter keeps the old getter's result.
  it('keeps returning the old result after the getter is redefined, until a dependency changes', () => {
    const store = createClassyStore({
      count: 2,
      get view(): string {
        return `old ${this.count}`;
      },
    });
    expect(store.view).toBe('old 2');

    Object.defineProperty(store, 'view', {
      get(this: {count: number}) {
        return `new ${this.count}`;
      },
      enumerable: true,
      configurable: true,
    });

    expect(store.view).toBe('old 2');
    store.count = 3;
    expect(store.view).toBe('new 3');
  });
});

// ── Getters on a subclass ────────────────────────────────────────────────────

function createDerived() {
  const runs = {base: 0, derived: 0, inherited: 0};
  class Base {
    count = 5;

    get label(): string {
      runs.base++;
      return `base:${this.count}`;
    }

    get next() {
      runs.inherited++;
      return this.count + 1;
    }
  }
  class Derived extends Base {
    suffix = '!';

    override get label(): string {
      runs.derived++;
      return `derived(${super.label})${this.suffix}`;
    }
  }
  return {store: createClassyStore(new Derived()), runs};
}

describe('getters on a subclass', () => {
  it('an overriding getter that calls super runs the base body inside its own computation', () => {
    const {store, runs} = createDerived();

    expect([store.label, store.label]).toEqual([
      'derived(base:5)!',
      'derived(base:5)!',
    ]);

    expect(runs).toEqual({base: 1, derived: 1, inherited: 0});
  });

  it('the base body is not memoized on its own: it re-runs when only the subclass field changed', () => {
    const {store, runs} = createDerived();
    expect([store.label, store.next]).toEqual(['derived(base:5)!', 6]);

    store.suffix = '?';

    expect([store.label, store.next]).toEqual(['derived(base:5)?', 6]);
    // The inherited getter, which is memoized on its own, did not re-run.
    expect(runs).toEqual({base: 2, derived: 2, inherited: 1});
  });

  it('a snapshot runs the base body inside the overriding getter in the same way', () => {
    const {store, runs} = createDerived();
    const first = snapshot(store);
    expect([first.label, first.label, first.next]).toEqual([
      'derived(base:5)!',
      'derived(base:5)!',
      6,
    ]);
    expect(runs).toEqual({base: 1, derived: 1, inherited: 1});

    store.suffix = '?';
    const second = snapshot(store);
    expect([second.label, second.next]).toEqual(['derived(base:5)?', 6]);
    expect(runs).toEqual({base: 2, derived: 2, inherited: 1});
  });

  it('an own data property hides a prototype getter until it is deleted', () => {
    class Labelled {
      count = 1;

      get label(): string {
        return `getter:${this.count}`;
      }
    }
    const instance = new Labelled();
    Object.defineProperty(instance, 'label', {
      value: 'own data',
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const store = createClassyStore(instance) as {
      count: number;
      label?: string;
    };
    const listener = watch(store);

    expect(store.label).toBe('own data');
    expect(snapshot(store).label).toBe('own data');

    store.label = 'changed';
    expect(store.label).toBe('changed');
    expect(listener).toHaveBeenCalledTimes(1);

    delete store.label;
    // Typed by hand: after `delete`, TypeScript takes the property for undefined.
    expect<string | undefined>(store.label).toBe('getter:1');
    expect(snapshot(store).label).toBe('getter:1');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

// ── Symbol-keyed getters ─────────────────────────────────────────────────────

describe('a getter with a symbol key', () => {
  const total = Symbol('total');

  function createTotals() {
    let runs = 0;
    class Totals {
      count = 2;

      get [total]() {
        runs++;
        return this.count * 10;
      }
    }
    return {store: createClassyStore(new Totals()), runs: () => runs};
  }

  it('is memoized and re-runs after a dependency changes', () => {
    const {store, runs} = createTotals();

    expect([store[total], store[total]]).toEqual([20, 20]);
    expect(runs()).toBe(1);

    store.count = 3;
    expect(store[total]).toBe(30);
    expect(runs()).toBe(2);
  });

  it('is an inherited key of the store and an own enumerable accessor of the snapshot', () => {
    const {store, runs} = createTotals();
    const snap = snapshot(store);

    expect(total in store).toBe(true);
    expect(Object.hasOwn(store, total)).toBe(false);
    expect(Object.getOwnPropertySymbols(snap)).toEqual([total]);
    expect(Object.getOwnPropertyDescriptor(snap, total)?.enumerable).toBe(true);
    expect([snap[total], snap[total]]).toEqual([20, 20]);
    expect(runs()).toBe(1);
  });
});

// ── Static getters ───────────────────────────────────────────────────────────

describe('static getters', () => {
  // FINDING: store.constructor is a bound wrapper, not the class, so statics are out of reach through it.
  it('are not reachable through store.constructor, which is not the class', () => {
    class Shape {
      static sides = 4;

      static get doubled() {
        return Shape.sides * 2;
      }

      size = 1;
    }
    const store = createClassyStore(new Shape());
    const viaStore = store.constructor as typeof Shape;

    expect(viaStore).not.toBe(Shape);
    expect(viaStore.sides).toBeUndefined();
    expect(viaStore.doubled).toBeUndefined();

    // The class is still reachable in the other ways, and through a snapshot.
    expect(store).toBeInstanceOf(Shape);
    expect(Object.getPrototypeOf(store).constructor).toBe(Shape);
    expect(new viaStore()).toBeInstanceOf(Shape);
    expect(snapshot(store).constructor).toBe(Shape);
  });

  // FINDING: for the same reason a getter that reads `this.constructor` differs between store and snapshot.
  it('read through this.constructor are undefined on the store and correct on a snapshot', () => {
    class Shape {
      static sides = 4;

      get sides() {
        return (this.constructor as typeof Shape).sides;
      }
    }
    const store = createClassyStore(new Shape());

    expect(store.sides).toBeUndefined();
    expect(snapshot(store).sides).toBe(4);
  });

  it('a getter that reads a static field by class name is not re-run when the static changes', () => {
    class Shape {
      static sides = 4;
      size = 2;

      get total() {
        return this.size * Shape.sides;
      }
    }
    const store = createClassyStore(new Shape());
    expect(store.total).toBe(8);

    Shape.sides = 5;
    expect(store.total).toBe(8);

    store.size = 3;
    expect(store.total).toBe(15);
  });

  it('on a class that is itself the store are memoized and re-run after a write through the store', () => {
    let runs = 0;
    class Settings {
      static base = 2;

      static get viaThis() {
        runs++;
        return this.base * 3;
      }

      instanceField = 0;
    }
    const store = createClassyStore(Settings);
    const listener = watch(store);

    expect([store.viaThis, store.viaThis]).toEqual([6, 6]);
    expect(runs).toBe(1);

    store.base = 5;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(Settings.base).toBe(5);
    expect(store.viaThis).toBe(15);
    expect(runs).toBe(2);
  });

  // FINDING: a static getter that names its class reads past the store and is never re-run.
  it('on a class store keep their result when they read the class by name instead of through this', () => {
    class Settings {
      static base = 2;

      static get viaName() {
        return Settings.base * 3;
      }

      instanceField = 0;
    }
    const store = createClassyStore(Settings);
    expect(store.viaName).toBe(6);

    store.base = 5;

    expect(Settings.viaName).toBe(15);
    expect(store.viaName).toBe(6);
  });

  // FINDING: the snapshot of a class store is a plain object, and spreading it throws.
  it('on a class store are computed on its snapshot, which is an object and not a class', () => {
    class Settings {
      static base = 2;

      static get viaThis() {
        return this.base * 3;
      }

      instanceField = 0;
    }
    const snap = snapshot(createClassyStore(Settings));

    expect(typeof snap).toBe('object');
    expect((snap as unknown as {viaThis: number}).viaThis).toBe(6);
    expect((snap as unknown as {base: number}).base).toBe(2);
    // Function.prototype's `arguments` and `caller` accessors were copied on.
    expect(() => ({...snap})).toThrow(TypeError);
  });
});

// ── Accessor pairs ───────────────────────────────────────────────────────────

function createNameForm() {
  const runs = {get: 0, set: 0};
  class NameForm {
    first = 'Ada';
    last = 'Lovelace';
    age = 36;

    get full() {
      runs.get++;
      return `${this.first} ${this.last}`;
    }

    set full(value: string) {
      runs.set++;
      const [first, last] = value.split(' ');
      this.first = first;
      this.last = last;
    }

    /** The same two writes as the setter, as a method. */
    rename(value: string) {
      const [first, last] = value.split(' ');
      this.first = first;
      this.last = last;
    }

    get initial() {
      return this.first[0];
    }

    set checkedAge(value: number) {
      if (value < 0) return;
      this.age = value;
    }
  }
  return {store: createClassyStore(new NameForm()), runs};
}

describe('a property with both a getter and a setter', () => {
  // FINDING: a setter is not a transaction: two writes inside it are two sync notifications; a method gives one.
  it('notifies a sync subscriber once per write inside the setter, where a method notifies once', () => {
    const {store} = createNameForm();
    const listener = watch(store);

    store.full = 'Grace Hopper';
    expect(listener).toHaveBeenCalledTimes(2);

    store.rename('Alan Turing');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  // FINDING: so a sync subscriber sees the state between the setter's two writes.
  it('shows a sync subscriber the half-applied state between the two writes', () => {
    const {store} = createNameForm();
    const seen: string[] = [];
    subscribe(
      store,
      () => {
        const snap = snapshot(store);
        seen.push(`${snap.first} ${snap.last}`);
      },
      {sync: true},
    );

    store.full = 'Grace Hopper';

    expect(seen).toEqual(['Grace Lovelace', 'Grace Hopper']);
  });

  it('notifies a batched subscriber once', async () => {
    const {store} = createNameForm();
    const listener = mock(() => {});
    subscribe(store, listener);

    store.full = 'Grace Hopper';
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies a sync subscriber once when the assignment is wrapped in batch()', () => {
    const {store} = createNameForm();
    const listener = watch(store);

    batch(() => {
      store.full = 'Grace Hopper';
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('re-runs the getter once after the setter changed what it reads', () => {
    const {store, runs} = createNameForm();
    expect(store.full).toBe('Ada Lovelace');

    store.full = 'Grace Hopper';

    expect([store.full, store.full]).toEqual(['Grace Hopper', 'Grace Hopper']);
    expect(runs).toEqual({get: 2, set: 1});
  });

  it('runs the setter when it is given the current value, which then notifies no one', () => {
    const {store, runs} = createNameForm();
    const listener = watch(store);

    store.full = 'Ada Lovelace';

    expect(runs.set).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies once when the setter changes one of its two fields', () => {
    const {store} = createNameForm();
    const listener = watch(store);

    store.full = 'Ada Byron';

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies no one when the setter decides to write nothing', () => {
    const {store} = createNameForm();
    const listener = watch(store);

    store.checkedAge = -1;

    expect(store.age).toBe(36);
    expect(listener).not.toHaveBeenCalled();
  });

  it('behaves the same on an object literal', () => {
    const store = createClassyStore({
      celsius: 0,
      get fahrenheit() {
        return this.celsius * 1.8 + 32;
      },
      set fahrenheit(value: number) {
        this.celsius = (value - 32) / 1.8;
      },
    });
    const listener = watch(store);

    store.fahrenheit = 212;

    expect(listener).toHaveBeenCalledTimes(1);
    expect([store.celsius, store.fahrenheit]).toEqual([100, 212]);
    expect(snapshot(store)).toEqual({celsius: 100, fahrenheit: 212});
  });
});

describe('a property with only a getter or only a setter', () => {
  it('throws a TypeError when a getter-only property is assigned, and notifies no one', () => {
    const {store} = createNameForm();
    const listener = watch(store);

    expect(() => {
      (store as {initial: string}).initial = 'X';
    }).toThrow(TypeError);
    expect(Reflect.set(store, 'initial', 'X')).toBe(false);

    expect(store.initial).toBe('A');
    expect(listener).not.toHaveBeenCalled();
  });

  it('reads a setter-only property as undefined on the live store, though the key is present', () => {
    const {store} = createNameForm();

    expect('checkedAge' in store).toBe(true);
    expect((store as {checkedAge: unknown}).checkedAge).toBeUndefined();
  });

  it('throws a TypeError when an accessor is assigned on a snapshot', () => {
    const {store} = createNameForm();
    const snap = snapshot(store);

    expect(() => {
      (snap as {full: string}).full = 'Grace Hopper';
    }).toThrow(TypeError);
    expect(snap.full).toBe('Ada Lovelace');
  });
});

// ── Getters that depend on the shape of an object ────────────────────────────

function createShape() {
  const runs = {keys: 0, hasExtra: 0, forIn: 0, entries: 0};
  class Shape {
    a = 1;
    // Declared for the type only: no `extra` property exists until it is set.
    declare extra?: number;

    get keys() {
      runs.keys++;
      return Object.keys(this);
    }

    get hasExtra() {
      runs.hasExtra++;
      return 'extra' in this;
    }

    get forIn() {
      runs.forIn++;
      const keys: string[] = [];
      for (const key in this) keys.push(key);
      return keys;
    }

    get entries(): string[] {
      runs.entries++;
      return Object.entries(this).map(([key]) => key);
    }
  }
  return {store: createClassyStore(new Shape()), runs};
}

describe('a getter whose result depends on which keys the store has', () => {
  // FINDING: the proxy has no `has` or `ownKeys` trap, so these getters record no dependency and never re-run.
  it('keeps the first result of Object.keys(this), `in` and for...in after a key is added', () => {
    const {store, runs} = createShape();
    expect([store.keys, store.hasExtra, store.forIn]).toEqual([
      ['a'],
      false,
      ['a'],
    ]);

    store.extra = 2;

    // The store itself answers correctly; the getters do not.
    expect(Object.keys(store)).toEqual(['a', 'extra']);
    expect('extra' in store).toBe(true);
    expect([store.keys, store.hasExtra, store.forIn]).toEqual([
      ['a'],
      false,
      ['a'],
    ]);
    expect(runs).toEqual({keys: 1, hasExtra: 1, forIn: 1, entries: 0});
  });

  // FINDING: the same getters stay stale after a key they listed is deleted.
  it('keeps the first result of Object.keys(this), `in` and for...in after a key is deleted', () => {
    const {store, runs} = createShape();
    store.extra = 2;
    expect([store.keys, store.hasExtra, store.forIn]).toEqual([
      ['a', 'extra'],
      true,
      ['a', 'extra'],
    ]);

    delete store.extra;

    expect(Object.keys(store)).toEqual(['a']);
    expect([store.keys, store.hasExtra, store.forIn]).toEqual([
      ['a', 'extra'],
      true,
      ['a', 'extra'],
    ]);
    expect(runs).toEqual({keys: 1, hasExtra: 1, forIn: 1, entries: 0});
  });

  // FINDING: Object.entries(this) reads each value, so it re-runs when a listed key goes, not when one arrives.
  it('re-runs Object.entries(this) after a listed key is deleted, but not after a key is added', () => {
    const {store, runs} = createShape();
    expect(store.entries).toEqual(['a']);

    store.extra = 2;
    expect(store.entries).toEqual(['a']);
    expect(runs.entries).toBe(1);

    delete (store as {a?: number}).a;
    expect(store.entries).toEqual(['extra']);
    expect(runs.entries).toBe(2);
  });

  it('re-runs a getter that reads a child when a key is added to or deleted from that child', () => {
    const runs = {keys: 0, has: 0, json: 0};
    class Holder {
      child: Record<string, number> = {x: 1};

      get childKeys() {
        runs.keys++;
        return Object.keys(this.child);
      }

      get childHasY() {
        runs.has++;
        return 'y' in this.child;
      }

      get childJson() {
        runs.json++;
        return JSON.stringify(this.child);
      }
    }
    const store = createClassyStore(new Holder());
    expect([store.childKeys, store.childHasY, store.childJson]).toEqual([
      ['x'],
      false,
      '{"x":1}',
    ]);

    store.child.y = 2;
    expect([store.childKeys, store.childHasY, store.childJson]).toEqual([
      ['x', 'y'],
      true,
      '{"x":1,"y":2}',
    ]);

    delete store.child.x;
    expect([store.childKeys, store.childHasY, store.childJson]).toEqual([
      ['y'],
      true,
      '{"y":2}',
    ]);
    expect(runs).toEqual({keys: 3, has: 3, json: 3});
  });
});

describe('a getter that reads a property the store does not have', () => {
  function createProfile() {
    let runs = 0;
    const store = createClassyStore<{
      name: string;
      nickname?: string;
      readonly label: string;
    }>({
      name: 'Ada',
      get label() {
        runs++;
        return this.nickname ?? this.name;
      },
    });
    return {store, runs: () => runs};
  }

  // FINDING: a dependency on a missing property never validates, so the getter runs on every read.
  it('runs on every read while the property is missing', () => {
    const {store, runs} = createProfile();

    expect([store.label, store.label, store.label]).toEqual([
      'Ada',
      'Ada',
      'Ada',
    ]);

    expect(runs()).toBe(3);
  });

  it('is memoized once the property exists, even with the value undefined', () => {
    const {store, runs} = createProfile();

    store.nickname = undefined;

    expect([store.label, store.label, store.label]).toEqual([
      'Ada',
      'Ada',
      'Ada',
    ]);
    expect(runs()).toBe(1);
  });

  it('runs on every read again after the property is deleted', () => {
    const {store, runs} = createProfile();
    store.nickname = 'Countess';
    expect([store.label, store.label]).toEqual(['Countess', 'Countess']);
    expect(runs()).toBe(1);

    delete store.nickname;

    expect([store.label, store.label]).toEqual(['Ada', 'Ada']);
    expect(runs()).toBe(3);
  });

  // FINDING: so a getter that builds an object from a missing property returns a new object on every read.
  it('returns a new object on every read when it builds one', () => {
    const store = createClassyStore<{
      name: string;
      nickname?: string;
      readonly card: {label: string};
    }>({
      name: 'Ada',
      get card() {
        return {label: this.nickname ?? this.name};
      },
    });

    expect(store.card).not.toBe(store.card);

    store.nickname = 'Countess';
    expect(store.card).toBe(store.card);
  });

  it('is memoized per snapshot all the same', () => {
    const {store, runs} = createProfile();
    const snap = snapshot(store);

    expect([snap.label, snap.label]).toEqual(['Ada', 'Ada']);

    expect(runs()).toBe(1);
  });
});

describe('a getter that asks for the shape of `this` on a snapshot', () => {
  // FINDING: on a snapshot a getter runs with `this` bound to a tracking proxy over an empty object.
  it('sees no own keys: Object.keys(this), `in`, for...in, spread and JSON.stringify come back empty', () => {
    class Shape {
      a = 1;
      b = 2;

      get keys() {
        return Object.keys(this);
      }

      get hasA() {
        return 'a' in this;
      }

      get forIn() {
        const keys: string[] = [];
        for (const key in this) keys.push(key);
        return keys;
      }

      get copy() {
        return {...this};
      }

      get json() {
        return JSON.stringify(this);
      }
    }
    const store = createClassyStore(new Shape());
    const snap = snapshot(store);

    expect([store.keys, store.hasA, store.forIn, store.json]).toEqual([
      ['a', 'b'],
      true,
      ['a', 'b'],
      '{"a":1,"b":2}',
    ]);
    expect(Object.keys(store.copy)).toEqual(['a', 'b']);

    expect([snap.keys, snap.hasA, snap.forIn, snap.json]).toEqual([
      [],
      false,
      [],
      '{}',
    ]);
    expect(Object.keys(snap.copy)).toEqual([]);
  });

  // FINDING: for the same reason `this` is not an instance of the class there, though the snapshot is.
  it('is not an instance of its class inside the getter, though the snapshot is', () => {
    class Shape {
      get isShape(): boolean {
        return this instanceof Shape;
      }

      get hasShapePrototype() {
        return Object.getPrototypeOf(this) === Shape.prototype;
      }
    }
    const store = createClassyStore(new Shape());
    const snap = snapshot(store);

    expect([store.isShape, store.hasShapePrototype]).toEqual([true, true]);
    expect(snap).toBeInstanceOf(Shape);
    expect([snap.isShape, snap.hasShapePrototype]).toEqual([false, false]);
  });

  // FINDING: a getter that returns `this` hands out that tracking proxy instead of the snapshot.
  it('returns the store from a getter that returns `this`, but not the snapshot', () => {
    class Self {
      a = 1;

      get self() {
        return this;
      }
    }
    const store = createClassyStore(new Self());
    const snap = snapshot(store);

    expect(store.self).toBe(store);
    expect(snap.self).not.toBe(snap);
    expect(Object.keys(snap.self)).toEqual([]);
    expect(snap.self.a).toBe(1);
  });

  it('reads children and calls methods through `this` as usual', () => {
    class Shape {
      child: Record<string, number> = {x: 1};
      scale = 2;

      scaled(value: number) {
        return value * this.scale;
      }

      get childKeys() {
        return Object.keys(this.child);
      }

      get viaMethod() {
        return this.scaled(21);
      }
    }
    const snap = snapshot(createClassyStore(new Shape()));

    expect(snap.childKeys).toEqual(['x']);
    expect(snap.viaMethod).toBe(42);
  });
});

// ── Getters that read an opaque value ────────────────────────────────────────

function createOpaqueHolder() {
  const runs = {year: 0, size: 0, limit: 0, done: 0};
  class Task {
    done = false;
  }
  class Holder {
    created = new Date(2020, 0, 1);
    lookup = new Map([['a', 1]]);
    config = Object.freeze({nested: {limit: 10}});
    task = new Task();
    unrelated = 0;

    get year() {
      runs.year++;
      return this.created.getFullYear();
    }

    get size() {
      runs.size++;
      return this.lookup.size;
    }

    get limit() {
      runs.limit++;
      return this.config.nested.limit;
    }

    get done() {
      runs.done++;
      return this.task.done;
    }
  }
  const store = createClassyStore(new Holder());
  /** Change all four values without replacing any of them. */
  const mutateInPlace = () => {
    store.created.setFullYear(2030);
    store.lookup.set('b', 2);
    store.config.nested.limit = 99;
    store.task.done = true;
  };
  const read = (view: Pick<Holder, 'year' | 'size' | 'limit' | 'done'>) => [
    view.year,
    view.size,
    view.limit,
    view.done,
  ];
  return {store, runs, mutateInPlace, read, Task};
}

describe('a getter that reads a Date, a Map, a frozen object or an unmarked class instance', () => {
  it('is not re-run, and no one is notified, when the value is mutated in place', () => {
    const {store, runs, mutateInPlace, read} = createOpaqueHolder();
    const listener = watch(store);
    expect(read(store)).toEqual([2020, 1, 10, false]);

    mutateInPlace();

    expect(listener).not.toHaveBeenCalled();
    expect(read(store)).toEqual([2020, 1, 10, false]);
    expect(runs).toEqual({year: 1, size: 1, limit: 1, done: 1});
  });

  it('keeps its result on the snapshot, whose own data does show the mutation', () => {
    const {store, mutateInPlace, read} = createOpaqueHolder();
    const snap = snapshot(store);
    expect(read(snap)).toEqual([2020, 1, 10, false]);

    mutateInPlace();

    expect(snapshot(store)).toBe(snap);
    expect(read(snap)).toEqual([2020, 1, 10, false]);
    expect([
      snap.created.getFullYear(),
      snap.lookup.size,
      snap.config.nested.limit,
      snap.task.done,
    ]).toEqual([2030, 2, 99, true]);
  });

  it('is still not re-run after a later unrelated write, on the store or on the next snapshot', () => {
    const {store, runs, mutateInPlace, read} = createOpaqueHolder();
    expect(read(store)).toEqual([2020, 1, 10, false]);
    expect(read(snapshot(store))).toEqual([2020, 1, 10, false]);
    mutateInPlace();

    store.unrelated = 1;

    expect(read(store)).toEqual([2020, 1, 10, false]);
    expect(read(snapshot(store))).toEqual([2020, 1, 10, false]);
    expect(runs).toEqual({year: 2, size: 2, limit: 2, done: 2});
  });

  it('is re-run when a Date, a Map or a class instance is replaced', () => {
    const {store, runs, read, Task} = createOpaqueHolder();
    const listener = watch(store);
    expect(read(store)).toEqual([2020, 1, 10, false]);
    const finished = new Task();
    finished.done = true;

    store.created = new Date(2040, 0, 1);
    store.lookup = new Map([
      ['y', 25],
      ['z', 26],
    ]);
    store.task = finished;

    expect(listener).toHaveBeenCalledTimes(3);
    expect(read(store)).toEqual([2040, 2, 10, true]);
    expect(runs).toEqual({year: 2, size: 2, limit: 1, done: 2});
    expect(read(snapshot(store))).toEqual([2040, 2, 10, true]);
  });

  it('is not re-run, and no one is notified, when the instance it holds is assigned again', () => {
    const {store, runs, read} = createOpaqueHolder();
    const listener = watch(store);
    expect(read(store)).toEqual([2020, 1, 10, false]);
    const {created, lookup, task} = store;

    store.created = created;
    store.lookup = lookup;
    store.task = task;

    expect(listener).not.toHaveBeenCalled();
    expect(read(store)).toEqual([2020, 1, 10, false]);
    expect(runs).toEqual({year: 1, size: 1, limit: 1, done: 1});
  });
});

// ── Private fields ───────────────────────────────────────────────────────────

describe('a getter that reads a #private field', () => {
  it('throws a TypeError on the store and on its snapshot', () => {
    class Vault {
      #secret = 42;

      get secret() {
        return this.#secret;
      }
    }
    const raw = new Vault();
    const store = createClassyStore(raw);

    expect(raw.secret).toBe(42);
    expect(() => store.secret).toThrow(TypeError);
    expect(() => snapshot(store).secret).toThrow(TypeError);
  });
});
