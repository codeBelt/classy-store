import {afterEach, describe, expect, type Mock, spyOn, test} from 'bun:test';
import {createClassyStore} from '../../index';
import type {PersistHandle, StorageAdapter} from '../index';
import {persist} from '../index';

const storage: StorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const handles: PersistHandle[] = [];
const spies: Mock<(...args: never[]) => unknown>[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
  for (const spy of spies.splice(0)) spy.mockRestore();
});

/**
 * Stands in for the global scope's listener list, so a test can see which
 * `storage` listeners persist() leaves registered and deliver an event itself.
 */
function trackStorageListeners() {
  const listeners = new Set<EventListener>();
  spies.push(
    spyOn(globalThis, 'addEventListener').mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject | null) => {
        if (type === 'storage' && typeof listener === 'function')
          listeners.add(listener);
      },
    ),
    spyOn(globalThis, 'removeEventListener').mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject | null) => {
        if (type === 'storage' && typeof listener === 'function')
          listeners.delete(listener);
      },
    ),
  );
  return listeners;
}

describe('persist storage listener', () => {
  test('dispose() removes the storage listener that syncTabs registered', () => {
    const listeners = trackStorageListeners();
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      storage,
      skipHydration: true,
      syncTabs: true,
    });
    handles.push(handle);
    expect(listeners.size).toBe(1);

    handle.dispose();

    expect(listeners.size).toBe(0);
  });

  test('a storage event that still reaches a disposed handle is ignored', () => {
    const listeners = trackStorageListeners();
    const store = createClassyStore({count: 0});
    const handle = persist(store, {
      name: 'draft',
      storage,
      skipHydration: true,
      syncTabs: true,
    });
    handles.push(handle);
    // Some event targets, happy-dom among them, still call a listener that
    // was removed while the event was being delivered.
    const [deliver] = [...listeners];
    handle.dispose();

    deliver?.(
      new StorageEvent('storage', {
        key: 'draft',
        newValue: JSON.stringify({version: 0, state: {count: 9}}),
      }),
    );

    expect(store.count).toBe(0);
  });

  test('without syncTabs, persist() and dispose() work where the global scope has no listener API', () => {
    const unavailable = () => {
      throw new TypeError('not available in this runtime');
    };
    spies.push(
      spyOn(globalThis, 'addEventListener').mockImplementation(unavailable),
      spyOn(globalThis, 'removeEventListener').mockImplementation(unavailable),
    );
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      storage,
      skipHydration: true,
    });
    handles.push(handle);

    expect(() => handle.dispose()).not.toThrow();
    expect(handle.getSnapshot().isDisposed).toBe(true);
  });
});
