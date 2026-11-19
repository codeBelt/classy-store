import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  spyOn,
} from 'bun:test';
import {batch, createClassyStore, snapshot, subscribe} from '../index';

// Characterisation tests for the order and the timing of notifications. They
// pin what the store does today, through the public entry only, so that a
// rewrite of the internals has to keep it or change it on purpose. A comment
// starting with FINDING marks behaviour that looks like a bug or a surprise;
// it is pinned all the same.

/** Let the microtask that serves ordinary (batched) subscribers run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Both kinds of subscriber, for behaviour the two have in common. */
const kinds = [
  {kind: 'sync', options: {sync: true}},
  {kind: 'batched', options: {}},
] as const;

describe('notification order on one node', () => {
  it('sync subscribers run in the order they subscribed', () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('first'), {sync: true});
    subscribe(store, () => calls.push('second'), {sync: true});
    subscribe(store, () => calls.push('third'), {sync: true});

    store.count = 1;

    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('batched subscribers run in the order they subscribed', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('first'));
    subscribe(store, () => calls.push('second'));
    subscribe(store, () => calls.push('third'));

    store.count = 1;
    await flush();

    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('every sync subscriber runs before any batched one, whichever subscribed first', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('batched, subscribed first'));
    subscribe(store, () => calls.push('sync, subscribed second'), {sync: true});
    subscribe(store, () => calls.push('batched, subscribed third'));
    subscribe(store, () => calls.push('sync, subscribed fourth'), {sync: true});

    store.count = 1;
    await flush();

    expect(calls).toEqual([
      'sync, subscribed second',
      'sync, subscribed fourth',
      'batched, subscribed first',
      'batched, subscribed third',
    ]);
  });

  it('the same callback subscribed as sync and as batched is two subscriptions', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    const callback = () => calls.push(`count ${snapshot(store).count}`);
    const stopSync = subscribe(store, callback, {sync: true});
    subscribe(store, callback);

    store.count = 1;
    store.count = 2;
    await flush();
    expect(calls).toEqual(['count 1', 'count 2', 'count 2']);

    stopSync();
    store.count = 3;
    await flush();
    expect(calls).toEqual(['count 1', 'count 2', 'count 2', 'count 3']);
  });
});

describe('notification order across the owners of one write', () => {
  it.each(kinds)(
    'a nested write notifies $kind subscribers from the written node up to the root',
    async ({options}) => {
      const store = createClassyStore({outer: {middle: {inner: {value: 0}}}});
      const calls: string[] = [];
      // Subscribed root first: the order of subscription across nodes is not
      // what decides.
      subscribe(store, () => calls.push('root'), options);
      subscribe(store.outer, () => calls.push('outer'), options);
      subscribe(store.outer.middle, () => calls.push('middle'), options);
      subscribe(store.outer.middle.inner, () => calls.push('inner'), options);

      store.outer.middle.inner.value = 1;
      await flush();

      expect(calls).toEqual(['inner', 'middle', 'outer', 'root']);
    },
  );

  it('a root write then a nested write in one turn notifies the root batched subscriber first', async () => {
    const store = createClassyStore({user: {name: 'a'}, count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('root'));
    subscribe(store.user, () => calls.push('user'));

    store.count = 1;
    store.user.name = 'b';
    await flush();

    expect(calls).toEqual(['root', 'user']);
  });

  it('a nested write then a root write in one turn notifies the nested batched subscriber first', async () => {
    const store = createClassyStore({user: {name: 'a'}, count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('root'));
    subscribe(store.user, () => calls.push('user'));

    store.user.name = 'b';
    store.count = 1;
    await flush();

    expect(calls).toEqual(['user', 'root']);
  });

  it('inside a batch, a root write then a nested write notifies the root sync subscriber first', () => {
    const store = createClassyStore({user: {name: 'a'}, count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('root'), {sync: true});
    subscribe(store.user, () => calls.push('user'), {sync: true});

    batch(() => {
      store.count = 1;
      store.user.name = 'b';
    });

    expect(calls).toEqual(['root', 'user']);
  });

  it('inside a batch, a nested write then a root write notifies the nested sync subscriber first', () => {
    const store = createClassyStore({user: {name: 'a'}, count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('root'), {sync: true});
    subscribe(store.user, () => calls.push('user'), {sync: true});

    batch(() => {
      store.user.name = 'b';
      store.count = 1;
    });

    expect(calls).toEqual(['user', 'root']);
  });

  it.each(kinds)(
    'two containers that share a child have their $kind subscribers called in the order they first held it',
    async ({options}) => {
      const record = {count: 1};
      const store = createClassyStore({left: {record}, right: {record}});
      const calls: string[] = [];
      subscribe(store, () => calls.push('root'), options);
      subscribe(store.right, () => calls.push('right'), options);
      subscribe(store.left, () => calls.push('left'), options);
      subscribe(store.left.record, () => calls.push('record'), options);

      // Written through the second container; the first is still told first.
      store.right.record.count = 2;
      await flush();

      expect(calls).toEqual(['record', 'left', 'right', 'root']);
    },
  );

  it('the key order of the initial state decides which container held the shared child first', () => {
    const record = {count: 1};
    const store = createClassyStore({right: {record}, left: {record}});
    const calls: string[] = [];
    subscribe(store.left, () => calls.push('left'), {sync: true});
    subscribe(store.right, () => calls.push('right'), {sync: true});

    store.left.record.count = 2;

    expect(calls).toEqual(['right', 'left']);
  });

  it('a container that drops the shared child and takes it back is called after the other one', () => {
    const record = {count: 1};
    const store = createClassyStore({left: {record}, right: {record}});
    const shared = store.left.record;
    store.left.record = {count: 100};
    store.left.record = shared;
    const calls: string[] = [];
    subscribe(store, () => calls.push('root'), {sync: true});
    subscribe(store.left, () => calls.push('left'), {sync: true});
    subscribe(store.right, () => calls.push('right'), {sync: true});
    subscribe(shared, () => calls.push('record'), {sync: true});

    shared.count = 2;

    expect(calls).toEqual(['record', 'right', 'left', 'root']);
  });

  it.each(kinds)(
    'two stores that share a child have their $kind subscribers called in the order the stores were created, after the child',
    async ({options}) => {
      const child = {count: 1};
      const one = createClassyStore({child});
      const two = createClassyStore({child});
      const calls: string[] = [];
      subscribe(two, () => calls.push('two'), options);
      subscribe(one, () => calls.push('one'), options);
      subscribe(two.child, () => calls.push('child'), options);

      // Written through the second store; the first store is still told first.
      two.child.count = 2;
      await flush();

      expect(calls).toEqual(['child', 'one', 'two']);
    },
  );

  // FINDING: owners are called level by level from the written node, not path
  // by path. A child held by the root and by a container inside that root has
  // the root called before the container, so "nested before root" does not
  // hold for a shared child.
  it.each(kinds)(
    'a child held by the root and by a nested container has the root $kind subscriber called before the one on that container',
    async ({options}) => {
      const record = {count: 1};
      const store = createClassyStore({record, box: {record}});
      const calls: string[] = [];
      subscribe(store.box, () => calls.push('box'), options);
      subscribe(store, () => calls.push('root'), options);
      subscribe(store.record, () => calls.push('record'), options);

      store.box.record.count = 2;
      await flush();

      expect(calls).toEqual(['record', 'root', 'box']);
    },
  );
});

describe('notification order across stores', () => {
  it('sync subscribers of two stores written in one turn run write by write', () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    subscribe(first, () => calls.push(`first ${snapshot(first).value}`), {
      sync: true,
    });
    subscribe(second, () => calls.push(`second ${snapshot(second).value}`), {
      sync: true,
    });

    second.value = 1;
    first.value = 1;
    second.value = 2;

    expect(calls).toEqual(['second 1', 'first 1', 'second 2']);
  });

  it('batched subscribers of two stores written in one turn run once each, in the order the stores were first written', async () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    subscribe(first, () => calls.push(`first ${snapshot(first).value}`));
    subscribe(second, () => calls.push(`second ${snapshot(second).value}`));

    second.value = 1;
    first.value = 1;
    second.value = 2;
    await flush();

    expect(calls).toEqual(['second 2', 'first 1']);
  });

  it('one microtask serves the batched subscribers of every store written in the turn', async () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    subscribe(first, () => calls.push('first'));
    subscribe(second, () => calls.push('second'));

    first.value = 1;
    queueMicrotask(() => calls.push('microtask queued between the writes'));
    second.value = 1;
    await flush();

    expect(calls).toEqual([
      'first',
      'second',
      'microtask queued between the writes',
    ]);
  });

  it('a store method that writes two stores notifies their sync subscribers when it returns, in the order they were first written', () => {
    const second = createClassyStore({value: 0});
    const first = createClassyStore({
      value: 0,
      writeBoth() {
        second.value = 1;
        this.value = 1;
        second.value = 2;
      },
    });
    const calls: string[] = [];
    const values = () =>
      `first=${snapshot(first).value} second=${snapshot(second).value}`;
    subscribe(first, () => calls.push(`first subscriber: ${values()}`), {
      sync: true,
    });
    subscribe(second, () => calls.push(`second subscriber: ${values()}`), {
      sync: true,
    });

    first.writeBoth();

    expect(calls).toEqual([
      'second subscriber: first=1 second=2',
      'first subscriber: first=1 second=2',
    ]);
  });

  it('a batch that writes two stores notifies their sync subscribers when it ends, in the order they were first written', () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    const values = () =>
      `first=${snapshot(first).value} second=${snapshot(second).value}`;
    subscribe(second, () => calls.push(`second subscriber: ${values()}`), {
      sync: true,
    });
    subscribe(first, () => calls.push(`first subscriber: ${values()}`), {
      sync: true,
    });

    batch(() => {
      first.value = 10;
      second.value = 10;
      first.value = 11;
    });

    expect(calls).toEqual([
      'first subscriber: first=11 second=10',
      'second subscriber: first=11 second=10',
    ]);
  });

  it('batched subscribers hear about a batch after every sync subscriber, in the same store order', async () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    subscribe(second, () => calls.push('second batched'));
    subscribe(first, () => calls.push('first batched'));
    subscribe(second, () => calls.push('second sync'), {sync: true});
    subscribe(first, () => calls.push('first sync'), {sync: true});

    batch(() => {
      first.value = 1;
      second.value = 1;
    });
    await flush();

    expect(calls).toEqual([
      'first sync',
      'second sync',
      'first batched',
      'second batched',
    ]);
  });
});

describe('batched delivery and microtask turns', () => {
  it('a write made by a microtask queued before the first write joins that notification', async () => {
    const store = createClassyStore({count: 0});
    const seen: number[] = [];
    subscribe(store, () => seen.push(snapshot(store).count));

    queueMicrotask(() => {
      store.count = 2;
    });
    store.count = 1;
    await flush();

    expect(seen).toEqual([2]);
  });

  it('a write made by a microtask queued after the first write gets a notification of its own', async () => {
    const store = createClassyStore({count: 0});
    const seen: number[] = [];
    subscribe(store, () => seen.push(snapshot(store).count));

    store.count = 1;
    queueMicrotask(() => {
      store.count = 2;
    });
    await flush();

    expect(seen).toEqual([1, 2]);
  });
});

describe('subscribing or unsubscribing between a write and its delivery', () => {
  // FINDING: whether a late batched subscriber hears about an earlier write of
  // the same turn depends on whether its node had another batched subscriber
  // when the write happened. This test and the next one pin the two outcomes.
  it('a batched subscriber added after a write is not told about it when its node had no batched subscriber at that time', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    // A sync subscriber does not count: the two kinds are tracked apart.
    subscribe(store, () => calls.push('sync'), {sync: true});

    store.count = 1;
    subscribe(store, () => calls.push('late batched'));
    await flush();

    expect(calls).toEqual(['sync']);
  });

  // FINDING: the other half of the pair above. The late subscriber is called
  // for a write that happened before it subscribed.
  it('a batched subscriber added after a write is told about it when its node already had a batched subscriber', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('early batched'));

    store.count = 1;
    subscribe(store, () => calls.push('late batched'));
    await flush();

    expect(calls).toEqual(['early batched', 'late batched']);
  });

  // FINDING: the same dependence for sync subscribers inside a transaction.
  // This test and the next one pin the two outcomes.
  it('a sync subscriber added inside a batch after a write is not told about it when its node had no sync subscriber at that time', () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];

    batch(() => {
      store.count = 1;
      subscribe(store, () => calls.push('late sync'), {sync: true});
    });

    expect(calls).toEqual([]);
  });

  // FINDING: the other half of the pair above.
  it('a sync subscriber added inside a batch after a write is told about it when its node already had a sync subscriber', () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => calls.push('early sync'), {sync: true});

    batch(() => {
      store.count = 1;
      subscribe(store, () => calls.push('late sync'), {sync: true});
    });

    expect(calls).toEqual(['early sync', 'late sync']);
  });

  it('a batched subscriber removed after a write and before its delivery is not called', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    const stop = subscribe(store, () => calls.push('removed'));
    subscribe(store, () => calls.push('kept'));

    store.count = 1;
    stop();
    await flush();

    expect(calls).toEqual(['kept']);
  });

  it('a sync subscriber removed inside a batch after a write is not called', () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    const stop = subscribe(store, () => calls.push('removed'), {sync: true});
    subscribe(store, () => calls.push('kept'), {sync: true});

    batch(() => {
      store.count = 1;
      stop();
    });

    expect(calls).toEqual(['kept']);
  });
});

describe('a write made inside a sync subscriber', () => {
  it('is delivered at once, inside the delivery that is still running', () => {
    const store = createClassyStore({source: 0, copy: 0});
    const calls: string[] = [];
    const values = () => {
      const {source, copy} = snapshot(store);
      return `source=${source} copy=${copy}`;
    };
    subscribe(
      store,
      () => {
        calls.push(`copier enters: ${values()}`);
        if (store.copy !== store.source) store.copy = store.source;
        calls.push(`copier leaves: ${values()}`);
      },
      {sync: true},
    );
    subscribe(store, () => calls.push(`reader: ${values()}`), {sync: true});

    store.source = 1;

    // The copier's own write notifies both subscribers before the copier
    // returns; only then does the first delivery reach the reader.
    expect(calls).toEqual([
      'copier enters: source=1 copy=0',
      'copier enters: source=1 copy=1',
      'copier leaves: source=1 copy=1',
      'reader: source=1 copy=1',
      'copier leaves: source=1 copy=1',
      'reader: source=1 copy=1',
    ]);
  });

  // FINDING: a subscriber that runs after the writing one hears about the
  // first write only after it has heard about the second, so it is called
  // twice with the identical snapshot and never sees the state in between.
  it('a subscriber that runs after the writing one is called twice with the same snapshot', () => {
    const store = createClassyStore({source: 0, copy: 0});
    const seen: unknown[] = [];
    subscribe(
      store,
      () => {
        if (store.copy !== store.source) store.copy = store.source;
      },
      {sync: true},
    );
    subscribe(store, () => seen.push(snapshot(store)), {sync: true});

    store.source = 1;

    expect(seen).toEqual([
      {source: 1, copy: 1},
      {source: 1, copy: 1},
    ]);
    expect(seen[0]).toBe(seen[1]);
  });

  it('a subscriber that runs before the writing one sees each state in turn', () => {
    const store = createClassyStore({source: 0, copy: 0});
    const calls: string[] = [];
    subscribe(
      store,
      () => {
        const {source, copy} = snapshot(store);
        calls.push(`reader: source=${source} copy=${copy}`);
      },
      {sync: true},
    );
    subscribe(
      store,
      () => {
        calls.push('copier enters');
        if (store.copy !== store.source) store.copy = store.source;
        calls.push('copier leaves');
      },
      {sync: true},
    );

    store.source = 1;

    expect(calls).toEqual([
      'reader: source=1 copy=0',
      'copier enters',
      'reader: source=1 copy=1',
      'copier enters',
      'copier leaves',
      'copier leaves',
    ]);
  });

  it('a write to a second store notifies that store before the first store has finished its own delivery', () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    subscribe(
      first,
      () => {
        calls.push('first store, forwarding subscriber enters');
        second.value = first.value;
        calls.push('first store, forwarding subscriber leaves');
      },
      {sync: true},
    );
    subscribe(first, () => calls.push('first store, next subscriber'), {
      sync: true,
    });
    subscribe(
      second,
      () =>
        calls.push(`second store subscriber sees ${snapshot(second).value}`),
      {sync: true},
    );

    first.value = 1;

    expect(calls).toEqual([
      'first store, forwarding subscriber enters',
      'second store subscriber sees 1',
      'first store, forwarding subscriber leaves',
      'first store, next subscriber',
    ]);
  });

  it('writes grouped by batch() inside the subscriber are delivered once, when that batch ends', () => {
    const store = createClassyStore({
      source: 0,
      copy: 0,
      copies: 0,
      setSource(value: number) {
        this.source = value;
      },
    });
    const calls: string[] = [];
    const values = () => {
      const {source, copy, copies} = snapshot(store);
      return `source=${source} copy=${copy} copies=${copies}`;
    };
    subscribe(
      store,
      () => {
        calls.push(`copier enters: ${values()}`);
        if (store.copy !== store.source) {
          batch(() => {
            store.copy = store.source;
            store.copies++;
            calls.push('copier wrote two fields');
          });
        }
        calls.push('copier leaves');
      },
      {sync: true},
    );
    subscribe(store, () => calls.push(`reader: ${values()}`), {sync: true});

    store.setSource(1);

    expect(calls).toEqual([
      'copier enters: source=1 copy=0 copies=0',
      'copier wrote two fields',
      'copier enters: source=1 copy=1 copies=1',
      'copier leaves',
      'reader: source=1 copy=1 copies=1',
      'copier leaves',
      'reader: source=1 copy=1 copies=1',
    ]);
  });

  it('batched subscribers hear once about the first write and the one the subscriber added', async () => {
    const store = createClassyStore({source: 0, copy: 0});
    const seen: unknown[] = [];
    subscribe(
      store,
      () => {
        if (store.copy !== store.source) store.copy = store.source;
      },
      {sync: true},
    );
    subscribe(store, () => seen.push(snapshot(store)));

    store.source = 1;
    await flush();

    expect(seen).toEqual([{source: 1, copy: 1}]);
  });

  // FINDING: nothing stops a subscriber that writes on every call. The
  // recursion runs until the stack overflows; the overflow is then reported
  // through console.error like any subscriber error, the writer is told
  // nothing, and the store keeps the thousands of writes that were made.
  describe('when the subscriber writes on every call', () => {
    let report: Mock<typeof console.error>;

    beforeEach(() => {
      report = spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      report.mockRestore();
    });

    it('recurses until the stack overflows, and reports the overflow instead of throwing it to the writer', () => {
      const store = createClassyStore({count: 0});
      subscribe(
        store,
        () => {
          store.count++;
        },
        {sync: true},
      );

      expect(() => {
        store.count = 1;
      }).not.toThrow();

      // How deep the recursion gets, and how many times the overflow is
      // reported on the way back up, depends on the engine's stack size.
      expect(store.count).toBeGreaterThan(1);
      expect(report.mock.calls.length).toBeGreaterThan(0);
      for (const [error] of report.mock.calls) {
        expect(error).toBeInstanceOf(RangeError);
      }
    });
  });
});

describe('a write made inside a batched subscriber', () => {
  it('is delivered by a microtask of its own, after the delivery that is running', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => {
      calls.push(`writer sees ${snapshot(store).count}`);
      if (store.count === 1) {
        store.count = 2;
        calls.push('writer wrote 2');
      }
    });
    subscribe(store, () => calls.push(`reader sees ${snapshot(store).count}`));

    store.count = 1;
    queueMicrotask(() => calls.push('microtask queued after the first write'));
    await flush();

    // The second delivery was queued while the first one ran, so it comes
    // after a microtask that was queued before the first one started.
    expect(calls).toEqual([
      'writer sees 1',
      'writer wrote 2',
      'reader sees 2',
      'microtask queued after the first write',
      'writer sees 2',
      'reader sees 2',
    ]);
  });

  // FINDING: a batched subscriber that runs after the writing one is called
  // again by the second delivery although nothing changed since its first
  // call; it gets the identical snapshot twice.
  it('a subscriber that runs after the writing one is called again with an unchanged snapshot', async () => {
    const store = createClassyStore({count: 0});
    const seen: unknown[] = [];
    subscribe(store, () => {
      if (store.count === 1) store.count = 2;
    });
    subscribe(store, () => seen.push(snapshot(store)));

    store.count = 1;
    await flush();

    expect(seen).toEqual([{count: 2}, {count: 2}]);
    expect(seen[0]).toBe(seen[1]);
  });

  it('a subscriber that runs before the writing one sees each state once', async () => {
    const store = createClassyStore({count: 0});
    const seen: number[] = [];
    subscribe(store, () => seen.push(snapshot(store).count));
    subscribe(store, () => {
      if (store.count === 1) store.count = 2;
    });

    store.count = 1;
    await flush();

    expect(seen).toEqual([1, 2]);
  });

  it('reaches sync subscribers at once, and the batched subscribers of the written store one microtask later', async () => {
    const first = createClassyStore({value: 0});
    const second = createClassyStore({value: 0});
    const calls: string[] = [];
    subscribe(first, () => {
      calls.push('first store, forwarding subscriber enters');
      second.value = first.value;
      calls.push('first store, forwarding subscriber leaves');
    });
    subscribe(first, () => calls.push('first store, next subscriber'));
    subscribe(second, () => calls.push('second store, batched subscriber'));
    subscribe(second, () => calls.push('second store, sync subscriber'), {
      sync: true,
    });

    first.value = 1;
    await flush();

    expect(calls).toEqual([
      'first store, forwarding subscriber enters',
      'second store, sync subscriber',
      'first store, forwarding subscriber leaves',
      'first store, next subscriber',
      'second store, batched subscriber',
    ]);
  });

  // FINDING: nothing bounds a batched subscriber that writes on every call
  // either. Each delivery queues the next one as a microtask, so no timer or
  // I/O callback runs until the subscriber stops writing; one that never
  // stops would hang the event loop. The writer here stops at 50.
  it('a subscriber that writes on each call is served in back-to-back microtasks, ahead of a timer that was already due', async () => {
    const store = createClassyStore({count: 0});
    const seenByTimer: number[] = [];
    subscribe(store, () => {
      if (store.count < 50) store.count++;
    });

    setTimeout(() => seenByTimer.push(store.count), 0);
    store.count = 1;
    await flush();

    expect(seenByTimer).toEqual([50]);
  });
});

describe('a subscriber that throws', () => {
  let report: Mock<typeof console.error>;

  beforeEach(() => {
    report = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    report.mockRestore();
  });

  it.each(kinds)(
    'a $kind subscriber that throws leaves the write applied and in the snapshot',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      subscribe(
        store,
        () => {
          throw new Error('boom');
        },
        options,
      );

      store.count = 1;
      await flush();

      expect(store.count).toBe(1);
      expect(snapshot(store)).toEqual({count: 1});
    },
  );

  it.each(kinds)(
    'a $kind subscriber that throws on a nested node does not stop the subscribers further up',
    async ({options}) => {
      const store = createClassyStore({user: {name: 'a'}});
      const calls: string[] = [];
      subscribe(
        store.user,
        () => {
          calls.push('user subscriber throws');
          throw new Error('boom');
        },
        options,
      );
      subscribe(store.user, () => calls.push('next user subscriber'), options);
      subscribe(store, () => calls.push('root subscriber'), options);

      store.user.name = 'b';
      await flush();

      expect(calls).toEqual([
        'user subscriber throws',
        'next user subscriber',
        'root subscriber',
      ]);
    },
  );

  it.each(kinds)(
    'a $kind subscriber that throws stays subscribed, and later writes are delivered and reported again',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      const failure = new Error('boom');
      const seen: number[] = [];
      subscribe(
        store,
        () => {
          throw failure;
        },
        options,
      );
      subscribe(store, () => seen.push(snapshot(store).count), options);

      store.count = 1;
      await flush();
      store.count = 2;
      await flush();

      expect(seen).toEqual([1, 2]);
      expect(report.mock.calls).toEqual([[failure], [failure]]);
    },
  );

  it('each subscriber that throws is reported on its own, in delivery order, with the value it threw', () => {
    const store = createClassyStore({count: 0});
    const failure = new Error('boom');
    subscribe(
      store,
      () => {
        throw failure;
      },
      {sync: true},
    );
    subscribe(
      store,
      () => {
        throw 'a string';
      },
      {sync: true},
    );
    subscribe(
      store,
      () => {
        throw {code: 7};
      },
      {sync: true},
    );

    store.count = 1;

    expect(report.mock.calls).toEqual([[failure], ['a string'], [{code: 7}]]);
  });

  it('a subscriber that throws when a store method returns does not change what the method returns', () => {
    const store = createClassyStore({
      count: 0,
      increment() {
        this.count++;
        return 'returned';
      },
    });
    const failure = new Error('boom');
    subscribe(
      store,
      () => {
        throw failure;
      },
      {sync: true},
    );

    expect(store.increment()).toBe('returned');
    expect(store.count).toBe(1);
    expect(report.mock.calls).toEqual([[failure]]);
  });

  it('a subscriber that throws when a batch ends does not change what batch() returns', () => {
    const store = createClassyStore({count: 0});
    const failure = new Error('boom');
    subscribe(
      store,
      () => {
        throw failure;
      },
      {sync: true},
    );

    const result = batch(() => {
      store.count = 1;
      return 'returned';
    });

    expect(result).toBe('returned');
    expect(report.mock.calls).toEqual([[failure]]);
  });

  it('a transaction whose subscriber threw is closed: the next direct write notifies at once', () => {
    const store = createClassyStore({count: 0});
    const calls: number[] = [];
    subscribe(
      store,
      () => {
        calls.push(snapshot(store).count);
        throw new Error('boom');
      },
      {sync: true},
    );

    batch(() => {
      store.count = 1;
    });
    store.count = 2;

    expect(calls).toEqual([1, 2]);
  });

  it('a sync subscriber that throws does not cancel the batched notification of the same write', async () => {
    const store = createClassyStore({count: 0});
    const seen: number[] = [];
    subscribe(
      store,
      () => {
        throw new Error('boom');
      },
      {sync: true},
    );
    subscribe(store, () => seen.push(snapshot(store).count));

    store.count = 1;
    await flush();

    expect(seen).toEqual([1]);
  });

  it('a throw inside a nested delivery is reported once for each delivery, and both deliveries finish', () => {
    const store = createClassyStore({source: 0, copy: 0});
    const calls: string[] = [];
    const failure = new Error('boom');
    subscribe(
      store,
      () => {
        calls.push('copier enters');
        if (store.copy !== store.source) store.copy = store.source;
        calls.push('copier leaves');
      },
      {sync: true},
    );
    subscribe(
      store,
      () => {
        calls.push('thrower');
        throw failure;
      },
      {sync: true},
    );

    store.source = 1;

    expect(calls).toEqual([
      'copier enters',
      'copier enters',
      'copier leaves',
      'thrower',
      'copier leaves',
      'thrower',
    ]);
    expect(report.mock.calls).toEqual([[failure], [failure]]);
  });

  // FINDING: only a synchronous throw is caught. A subscriber that returns a
  // rejected promise (an async callback) is not awaited and not reported, so
  // its failure is left to become an unhandled rejection.
  it('the rejection of an async subscriber is neither awaited nor reported', async () => {
    const store = createClassyStore({count: 0});
    const failure = new Error('boom');
    const returned: Promise<void>[] = [];
    subscribe(
      store,
      () => {
        const promise = Promise.reject<void>(failure);
        returned.push(promise);
        return promise;
      },
      {sync: true},
    );

    store.count = 1;
    // Observe the rejection here, so that it is handled before the turn ends.
    const outcome = returned[0].then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await flush();

    expect(await outcome).toBe(failure);
    expect(report).not.toHaveBeenCalled();
  });
});

describe('subscribing during delivery', () => {
  it.each(kinds)(
    'a $kind subscriber added by another one during delivery is first called for the next write',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      const calls: string[] = [];
      let added = false;
      subscribe(
        store,
        () => {
          calls.push('first');
          if (added) return;
          added = true;
          subscribe(store, () => calls.push('added'), options);
        },
        options,
      );
      subscribe(store, () => calls.push('second'), options);

      store.count = 1;
      await flush();
      expect(calls).toEqual(['first', 'second']);

      store.count = 2;
      await flush();
      expect(calls).toEqual(['first', 'second', 'first', 'second', 'added']);
    },
  );

  it.each(kinds)(
    'a $kind subscriber added to the root while a nested node is being delivered is first called for the next write',
    async ({options}) => {
      const store = createClassyStore({user: {name: 'a'}});
      const calls: string[] = [];
      let added = false;
      subscribe(
        store.user,
        () => {
          calls.push('user');
          if (added) return;
          added = true;
          subscribe(store, () => calls.push('root, added'), options);
        },
        options,
      );

      store.user.name = 'b';
      await flush();
      expect(calls).toEqual(['user']);

      store.user.name = 'c';
      await flush();
      expect(calls).toEqual(['user', 'user', 'root, added']);
    },
  );
});

describe('unsubscribing during delivery', () => {
  it.each(kinds)(
    'a $kind subscriber that unsubscribes itself is not called again, and the one after it still runs',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      const calls: string[] = [];
      subscribe(store, () => calls.push('before'), options);
      const stop = subscribe(
        store,
        () => {
          calls.push('unsubscribes itself');
          stop();
        },
        options,
      );
      subscribe(store, () => calls.push('after'), options);

      store.count = 1;
      await flush();
      expect(calls).toEqual(['before', 'unsubscribes itself', 'after']);

      store.count = 2;
      await flush();
      expect(calls).toEqual([
        'before',
        'unsubscribes itself',
        'after',
        'before',
        'after',
      ]);
    },
  );

  it.each(kinds)(
    'a $kind subscriber removed by a later one, after it ran, is not called for the next write',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      const calls: string[] = [];
      const stopEarlier = subscribe(
        store,
        () => calls.push('earlier'),
        options,
      );
      subscribe(
        store,
        () => {
          calls.push('remover');
          stopEarlier();
        },
        options,
      );

      store.count = 1;
      await flush();
      store.count = 2;
      await flush();

      expect(calls).toEqual(['earlier', 'remover', 'remover']);
    },
  );

  // FINDING: the subscribers of a delivery are copied before the first one
  // runs, so one that an earlier subscriber removes is still called once,
  // after its unsubscribe function has returned. The adapters guard against
  // this with a flag of their own.
  it.each(kinds)(
    'a $kind subscriber removed by an earlier one is still called once in the delivery that is running',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      const calls: string[] = [];
      let stopLater = () => {};
      subscribe(
        store,
        () => {
          stopLater();
          calls.push('remover, after unsubscribing the later one');
        },
        options,
      );
      stopLater = subscribe(store, () => calls.push('later'), options);

      store.count = 1;
      await flush();
      expect(calls).toEqual([
        'remover, after unsubscribing the later one',
        'later',
      ]);

      store.count = 2;
      await flush();
      expect(calls).toEqual([
        'remover, after unsubscribing the later one',
        'later',
        'remover, after unsubscribing the later one',
      ]);
    },
  );

  // FINDING: the same across nodes. A root subscriber removed while a nested
  // node is being delivered is still called for that write.
  it.each(kinds)(
    'a root $kind subscriber removed by a nested one is still called once in the delivery that is running',
    async ({options}) => {
      const store = createClassyStore({user: {name: 'a'}});
      const calls: string[] = [];
      const stopRoot = subscribe(store, () => calls.push('root'), options);
      subscribe(
        store.user,
        () => {
          stopRoot();
          calls.push('user, after unsubscribing the root one');
        },
        options,
      );

      store.user.name = 'b';
      await flush();
      store.user.name = 'c';
      await flush();

      expect(calls).toEqual([
        'user, after unsubscribing the root one',
        'root',
        'user, after unsubscribing the root one',
      ]);
    },
  );

  it.each(kinds)(
    'a $kind subscriber that unsubscribes and subscribes itself again during delivery is not called twice for that write, and runs last from then on',
    async ({options}) => {
      const store = createClassyStore({count: 0});
      const calls: string[] = [];
      let stop = () => {};
      const mover = () => {
        calls.push('mover');
        stop();
        stop = subscribe(store, mover, options);
      };
      stop = subscribe(store, mover, options);
      subscribe(store, () => calls.push('other'), options);

      store.count = 1;
      await flush();
      expect(calls).toEqual(['mover', 'other']);

      store.count = 2;
      await flush();
      expect(calls).toEqual(['mover', 'other', 'other', 'mover']);
    },
  );

  it('an unsubscribe function called again after its callback was subscribed again leaves the new subscription in place', () => {
    const store = createClassyStore({count: 0});
    const calls: number[] = [];
    const callback = () => calls.push(snapshot(store).count);
    const stopFirst = subscribe(store, callback, {sync: true});
    stopFirst();
    const stopSecond = subscribe(store, callback, {sync: true});

    stopFirst();
    store.count = 1;
    expect(calls).toEqual([1]);

    stopSecond();
    store.count = 2;
    expect(calls).toEqual([1]);
  });
});
