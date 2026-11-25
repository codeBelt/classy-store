import {describe, expect, it} from 'bun:test';
import {createClassyStore, PROXYABLE, snapshot} from '../index';
import {withHistory} from '../utils/index';

// Undo rebuilds a changed branch of the store from a recorded snapshot. A
// snapshot carries each getter as an own property, so the rebuild has to tell
// a getter the object declared itself from one its class provides: the first
// is put back on the object, the second is left to the class.

/** Let the microtask that serves ordinary (batched) subscribers run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class Cart {
  static [PROXYABLE] = true;

  prices = [2, 3];

  get total(): number {
    return this.prices.reduce((sum, price) => sum + price, 0);
  }
}

describe('a nested object rebuilt by undo', () => {
  it('still takes a class getter from its class, and lists it in a snapshot as before', async () => {
    const store = createClassyStore({cart: new Cart()});
    const history = withHistory(store);
    const before = Object.keys(snapshot(store).cart);
    store.cart.prices.push(5);
    await flush();

    history.undo();
    await flush();
    history.dispose();

    expect(before).toEqual(['prices', 'total']);
    expect(Object.keys(snapshot(store).cart)).toEqual(['prices', 'total']);
    expect(Object.hasOwn(store.cart, 'total')).toBe(false);
    expect(store.cart.total).toBe(5);
    expect(snapshot(store).cart.total).toBe(5);
  });

  it('gets back a getter that the object declared itself', async () => {
    const store = createClassyStore({
      cart: {
        prices: [2, 3],
        get total(): number {
          return this.prices.reduce((sum, price) => sum + price, 0);
        },
      },
    });
    const history = withHistory(store);
    store.cart.prices.push(5);
    await flush();

    history.undo();
    await flush();
    history.dispose();

    expect(Object.hasOwn(store.cart, 'total')).toBe(true);
    expect(store.cart.total).toBe(5);
    expect(Object.keys(snapshot(store).cart)).toEqual(['prices', 'total']);
  });
});
