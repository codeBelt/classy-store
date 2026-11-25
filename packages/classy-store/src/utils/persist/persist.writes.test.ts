import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../index';
import type {PersistHandle} from '../index';
import {persist} from '../index';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persist writes and removals', () => {
  test.each([
    {method: 'save' as const, adapter: 'setItem' as const, calls: 2},
    {method: 'clear' as const, adapter: 'removeItem' as const, calls: 1},
  ])(
    '$method() reaches a synchronous adapter before it returns, also after an earlier write has finished',
    async ({method, adapter, calls}) => {
      const storage = {
        getItem: () => null,
        setItem: mock(() => {}),
        removeItem: mock(() => {}),
      };
      const handle = persist(createClassyStore({count: 1}), {
        name: 'draft',
        skipHydration: true,
        storage,
      });
      handles.push(handle);
      await handle.save();
      await tick(); // The first write has settled completely.

      // A page that is closing gets no later turn to finish the write in.
      const pending = handle[method]();
      expect(storage[adapter]).toHaveBeenCalledTimes(calls);

      await pending;
    },
  );
});
