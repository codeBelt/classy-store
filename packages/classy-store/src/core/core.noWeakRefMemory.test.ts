import {afterEach, describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// Without WeakRef a child holds each of its owners for good, so the only thing
// that lets a container be collected is the store cutting the links below it
// when it leaves unobserved. `core.characterisation.detached.test.ts` shows
// what the collector can free where WeakRef exists; these tests show the same
// for the fallback. Each test keeps the real constructor to watch its objects
// with, and puts it back before it waits for the collector. A comment starting
// with FINDING marks behaviour that looks like a bug; it is pinned all the
// same.
describe('what the collector can free in a runtime without WeakRef', () => {
  const NativeWeakRef = globalThis.WeakRef;

  const removeWeakRef = () => Reflect.set(globalThis, 'WeakRef', undefined);
  const restoreWeakRef = () =>
    Reflect.set(globalThis, 'WeakRef', NativeWeakRef);

  afterEach(() => {
    restoreWeakRef();
  });

  /**
   * Whether the collector has freed the object behind `reference`. A
   * collection cannot be forced in one call, so it is requested up to
   * `attempts` times with a task boundary before each, as in
   * `core.characterisation.detached.test.ts`. Tests that expect `false` ask
   * fewer times: an object that is still referenced stays however often the
   * collector runs.
   */
  async function isCollected(
    reference: WeakRef<object>,
    attempts = 30,
  ): Promise<boolean> {
    for (
      let attempt = 0;
      attempt < attempts && reference.deref() !== undefined;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      Bun.gc(true);
    }
    return reference.deref() === undefined;
  }

  // Each test builds the objects it expects to be freed inside a helper
  // function, so that no local variable of the test itself refers to them.

  it('a list that was replaced is collected while a row it held lives on in the store', async () => {
    removeWeakRef();
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const replaceList = () => {
      const replaced = store.rows;
      store.rows = replaced.filter((row) => row.n === 1);
      return new NativeWeakRef(replaced);
    };
    const replaced = replaceList();
    restoreWeakRef();

    expect(await isCollected(replaced)).toBe(true);

    store.rows[0].n = 5;
    expect(snapshot(store)).toEqual({rows: [{n: 5}]});
  });

  it('a list that was replaced while it had a subscriber is kept alive by a row that lives on in the store', async () => {
    removeWeakRef();
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const replaceList = () => {
      const replaced = store.rows;
      subscribe(replaced, () => {});
      store.rows = replaced.filter((row) => row.n === 1);
      return new NativeWeakRef(replaced);
    };
    const replaced = replaceList();
    restoreWeakRef();

    expect(await isCollected(replaced, 5)).toBe(false);

    expect(snapshot(store)).toEqual({rows: [{n: 1}]});
  });

  // FINDING: without WeakRef, an object held from a removed container keeps that container alive, which the store avoids where WeakRef exists.
  it('a row held from a removed list keeps that list alive', async () => {
    removeWeakRef();
    const removeList = () => {
      const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
      const list = store.rows;
      const row = list[0];
      store.rows = [];
      return {store, row, removed: new NativeWeakRef(list)};
    };
    const {store, row, removed} = removeList();
    restoreWeakRef();

    expect(await isCollected(removed, 5)).toBe(false);

    row.n = 9;
    expect(snapshot(row)).toEqual({n: 9});
    expect(snapshot(store)).toEqual({rows: []});
  });
});
