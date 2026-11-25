import {afterEach, describe, expect, test} from 'bun:test';
import {createClassyStore} from '../../index';
import type {PersistHandle} from '../index';
import {persist, subscribeKey} from '../index';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stored = (state: Record<string, unknown>) =>
  JSON.stringify({version: 0, state});
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persist restoring stored fields', () => {
  test('a restore in which one stored field already matches writes nothing back and does not swallow the next edit', async () => {
    const writes: string[] = [];
    const store = createClassyStore({theme: 'light', fontSize: 12});
    const handle = persist(store, {
      name: 'settings',
      storage: {
        getItem: () => stored({theme: 'light', fontSize: 20}),
        setItem: (_name, value) => {
          writes.push(value);
        },
        removeItem: () => {},
      },
    });
    handles.push(handle);

    await handle.hydrated;
    await tick();
    expect(store.fontSize).toBe(20);
    expect(writes).toEqual([]);

    store.theme = 'dark';
    await tick();
    expect(writes.map((value) => JSON.parse(value).state)).toEqual([
      {theme: 'dark', fontSize: 20},
    ]);
  });

  test("after clear() during a restore, a subscriber's edit made while a later field is restored is still saved", async () => {
    let saved: string | null = stored({count: 1, tail: 2});
    const events: string[] = [];
    const store = createClassyStore({count: 0, tail: 0, label: 'initial'});
    const handle = persist(store, {
      name: 'draft',
      skipHydration: true,
      storage: {
        getItem: () => saved,
        setItem: (_name, value) => {
          saved = value;
          events.push('write');
        },
        removeItem: () => {
          saved = null;
          events.push('clear');
        },
      },
    });
    handles.push(handle);
    let cleared: Promise<void> | undefined;
    const stopCount = subscribeKey(
      store,
      'count',
      () => {
        cleared = handle.clear();
      },
      {sync: true},
    );
    const stopTail = subscribeKey(
      store,
      'tail',
      () => {
        store.label = 'edited';
      },
      {sync: true},
    );

    try {
      await handle.rehydrate();
      await cleared;
      await tick();

      expect(store.tail).toBe(2);
      expect(events).toEqual(['clear', 'write']);
      expect(JSON.parse(String(saved)).state).toEqual({
        count: 1,
        tail: 2,
        label: 'edited',
      });
    } finally {
      stopCount();
      stopTail();
    }
  });

  test('a field written by the setter of an earlier restored field still receives its own stored value', async () => {
    class Profile {
      name = 'anonymous';
      get displayName() {
        return this.name;
      }
      set displayName(value: string) {
        this.name = value;
      }
    }
    const store = createClassyStore(new Profile());
    const handle = persist(store, {
      name: 'profile',
      properties: ['displayName', 'name'],
      storage: {
        getItem: () => stored({displayName: 'From the setter', name: 'Stored'}),
        setItem: () => {},
        removeItem: () => {},
      },
    });
    handles.push(handle);

    await handle.hydrated;

    expect(store.name).toBe('Stored');
  });
});
