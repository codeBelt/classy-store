import {afterEach, describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../index';
import type {PersistHandle} from '../index';
import {persist} from '../index';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const handles: PersistHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
});

describe('persist after dispose', () => {
  test('every status subscriber hears about dispose, also when an earlier one calls dispose() again', () => {
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      skipHydration: true,
      storage: {getItem: () => null, setItem: () => {}, removeItem: () => {}},
    });
    handles.push(handle);
    const first = mock(() => handle.dispose());
    const second = mock(() => {});
    handle.subscribe(first);
    handle.subscribe(second);

    handle.dispose();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(handle.getSnapshot().isDisposed).toBe(true);
  });

  test('a write that finishes after dispose leaves the disposed status as it was', async () => {
    const failure = new Error('quota');
    const write = deferred<void>();
    const setItem = mock<() => void | Promise<void>>()
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockReturnValueOnce(write.promise);
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      skipHydration: true,
      storage: {getItem: () => null, setItem, removeItem: () => {}},
    });
    handles.push(handle);
    await expect(handle.save()).rejects.toBe(failure);
    const saving = handle.save();
    handle.dispose();
    const disposedStatus = handle.getSnapshot();

    write.resolve();
    await saving;

    expect(handle.getSnapshot()).toBe(disposedStatus);
    expect(disposedStatus.lastError).toEqual({
      error: failure,
      operation: 'write',
    });
  });

  test('clear() on a disposed handle rejects at once, without waiting for a write still in flight', async () => {
    const write = deferred<void>();
    const removeItem = mock(() => {});
    const handle = persist(createClassyStore({count: 0}), {
      name: 'draft',
      skipHydration: true,
      storage: {getItem: () => null, setItem: () => write.promise, removeItem},
    });
    handles.push(handle);
    const saving = handle.save();
    handle.dispose();

    let rejection: unknown;
    const clearing = handle.clear().catch((error: unknown) => {
      rejection = error;
    });
    await tick();

    try {
      expect(rejection).toBeInstanceOf(Error);
    } finally {
      write.resolve();
      await Promise.all([saving, clearing]);
    }
    expect(removeItem).not.toHaveBeenCalled();
  });
});
