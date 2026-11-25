import {describe, expect, it} from 'bun:test';
import {createClassyStore} from '../index';

// Getters that read getters of another object: a nested object, a getter that
// leads into a cycle, and another store. A `FINDING` comment marks behaviour
// that looks like a bug: it is pinned as it is, not endorsed.

/** The message of the error a read throws. */
function messageThrownBy(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return 'no error';
}

describe('a getter that reads a getter of the same name on a nested object', () => {
  it('returns its result: two getters that share a name on different objects are not a cycle', () => {
    const store = createClassyStore({
      lines: {
        prices: [2, 3],
        get total(): number {
          return this.prices.reduce((sum, price) => sum + price, 0);
        },
      },
      shipping: 4,
      get total(): number {
        return this.lines.total + this.shipping;
      },
    });

    expect(store.total).toBe(9);

    store.lines.prices.push(1);

    expect(store.total).toBe(10);
  });
});

describe('a cycle of getters that is reached through a getter outside it', () => {
  it('is reported from the getter where it closes, without the getter that led into it', () => {
    const store = createClassyStore({
      get entry(): number {
        return this.first;
      },
      get first(): number {
        return this.second;
      },
      get second(): number {
        return this.first;
      },
    });

    expect(messageThrownBy(() => store.entry)).toBe(
      '@codebelt/classy-store [getter-cycle]: first → second → first',
    );
  });
});

describe('a getter that reads a getter of another store', () => {
  // FINDING: a getter that reads another store is never re-run by a write to that store, also when what it reads there is a getter that has itself recomputed.
  it('keeps its result after the other store changes and its getter has recomputed', () => {
    const rates = createClassyStore({
      tax: 1,
      get doubled(): number {
        return this.tax * 2;
      },
    });
    const cart = createClassyStore({
      net: 1,
      get gross(): number {
        return this.net + rates.doubled;
      },
    });
    expect(cart.gross).toBe(3);

    rates.tax = 5;

    expect(rates.doubled).toBe(10);
    expect(cart.gross).toBe(3);

    // A write to one of its own fields re-runs it, and it then sees both.
    cart.net = 2;
    expect(cart.gross).toBe(12);
  });
});
