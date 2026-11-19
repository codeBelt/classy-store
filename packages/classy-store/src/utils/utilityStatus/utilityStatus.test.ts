import {describe, expect, mock, spyOn, test} from 'bun:test';
import {createUtilityStatus} from './utilityStatus';

describe('createUtilityStatus', () => {
  test('publishes a frozen status and notifies on a changed field', () => {
    const status = createUtilityStatus({ready: false, attempts: 0});
    const listener = mock(() => {});
    status.source.subscribe(listener);

    status.update({ready: true, attempts: 0});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(status.source.getSnapshot()).toEqual({ready: true, attempts: 0});
    expect(Object.isFrozen(status.source.getSnapshot())).toBe(true);
  });

  test('keeps the same snapshot and stays silent when no field changed', () => {
    const status = createUtilityStatus({ready: false, attempts: 0});
    const listener = mock(() => {});
    status.source.subscribe(listener);
    const before = status.source.getSnapshot();

    status.update({ready: false, attempts: 0});

    expect(listener).not.toHaveBeenCalled();
    expect(status.source.getSnapshot()).toBe(before);
  });

  test('the server snapshot stays the initial status', () => {
    const status = createUtilityStatus({ready: false});
    const initial = status.source.getServerSnapshot();

    status.update({ready: true});

    expect(status.source.getServerSnapshot()).toBe(initial);
    expect(initial).toEqual({ready: false});
  });

  test('a listener that throws does not stop the others or the update', () => {
    const status = createUtilityStatus({ready: false});
    const failure = new Error('render failed');
    const after = mock(() => {});
    const report = spyOn(console, 'error').mockImplementation(() => {});
    try {
      status.source.subscribe(() => {
        throw failure;
      });
      status.source.subscribe(after);

      expect(() => status.update({ready: true})).not.toThrow();

      expect(after).toHaveBeenCalledTimes(1);
      expect(status.source.getSnapshot()).toEqual({ready: true});
      expect(report).toHaveBeenCalledWith(failure);
    } finally {
      report.mockRestore();
    }
  });

  test('a listener removed during a notification is not called', () => {
    const status = createUtilityStatus({ready: false});
    const second = mock(() => {});
    let unsubscribeSecond = () => {};
    status.source.subscribe(() => unsubscribeSecond());
    unsubscribeSecond = status.source.subscribe(second);

    status.update({ready: true});

    expect(second).not.toHaveBeenCalled();
  });

  test('an unsubscribed listener is no longer notified', () => {
    const status = createUtilityStatus({ready: false});
    const listener = mock(() => {});
    const unsubscribe = status.source.subscribe(listener);

    unsubscribe();
    status.update({ready: true});

    expect(listener).not.toHaveBeenCalled();
  });

  test('dispose publishes the final status once, then goes quiet', () => {
    const status = createUtilityStatus({ready: true, disposed: false});
    const listener = mock(() => {});
    status.source.subscribe(listener);

    status.dispose({ready: false, disposed: true});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(status.source.getSnapshot()).toEqual({ready: false, disposed: true});

    // Later updates still change what is read, but no one is notified.
    const late = mock(() => {});
    const unsubscribe = status.source.subscribe(late);
    status.update({ready: true, disposed: true});
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });
});
