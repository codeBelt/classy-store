import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, subscribe} from '../index';

// `Object.defineProperty` on a store can be refused by the object behind it.
// A refused definition changes nothing, and that includes the link between
// the store and the object the field holds.

describe('a definition that the object behind a store refuses', () => {
  it('leaves the object under that field connected: a write to it still notifies the store', () => {
    const raw = {settings: {volume: 1}};
    const store = createClassyStore(raw);
    const settings = store.settings;
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});
    // Made read-only on the raw object, so the field refuses a new value.
    Object.defineProperty(raw, 'settings', {
      writable: false,
      configurable: false,
    });

    const defined = Reflect.defineProperty(store, 'settings', {
      value: {volume: 2},
    });
    settings.volume = 3;

    expect(defined).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
