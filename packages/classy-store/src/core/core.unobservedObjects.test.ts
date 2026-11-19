import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// An object that nobody observes: one that has left its store and has no
// subscriber, or a store whose only subscriber has gone. The store stops
// following such an object and catches up when it is used again. These tests
// pin that the catching up is complete for an object that is taken out of an
// unobserved parent: its snapshot is current and its subscribers are told.
// A `FINDING` comment marks behaviour that looks like a bug: it is pinned as
// it is, not endorsed.
//
// Each test holds a proxy three levels down (`field`) and gives it a subscriber
// of its own. A write through it is then the one change that reaches nobody
// above it while the objects above are unobserved.

type Workspace = {
  panel?: {form?: {field: {value: number}}; title: string};
};

/** Narrow away `undefined` where a test knows the value is there. */
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value');
  return value;
}

/** A store with a panel, a form in it and a field in that, each held as a proxy. */
function createWorkspace() {
  const store = createClassyStore<Workspace>({
    panel: {form: {field: {value: 0}}, title: 'a'},
  });
  const panel = present(store.panel);
  const form = present(panel.form);
  const field = form.field;
  subscribe(field, () => {});
  return {store, panel, form, field};
}

describe('an object deleted from a parent that had already left the store', () => {
  it('gives a current snapshot after a change under it', () => {
    const {store, panel, form, field} = createWorkspace();
    expect(snapshot(form).field.value).toBe(0);
    delete store.panel;

    delete panel.form;
    field.value = 1;

    expect(snapshot(form).field.value).toBe(1);
  });

  it('tells a subscriber added after the delete about a change under it', () => {
    const {store, panel, form, field} = createWorkspace();
    delete store.panel;

    delete panel.form;
    const listener = mock(() => {});
    subscribe(form, listener, {sync: true});
    field.value = 1;

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('a store created from an object that had left another store', () => {
  it('hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it', () => {
    const {store, panel, form, field} = createWorkspace();
    expect(snapshot(form).field.value).toBe(0);
    delete store.panel;

    const second = createClassyStore(panel);
    Object.freeze(second);
    field.value = 1;

    expect(snapshot(form).field.value).toBe(1);
  });
});

describe('a store whose only subscriber has left', () => {
  it('hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it', () => {
    const store = createClassyStore({form: {field: {value: 0}}});
    const form = store.form;
    const field = form.field;
    subscribe(field, () => {});
    expect(snapshot(form).field.value).toBe(0);
    const unsubscribe = subscribe(store, () => {});
    unsubscribe();

    Object.freeze(store);
    field.value = 1;

    expect(snapshot(form).field.value).toBe(1);
  });
});

// FINDING: freezing an object that has left its store and has no subscriber (or making one of its fields read-only) does not catch it up first, as a read, a write or a delete does. The object under the frozen field then answers its next snapshot from before the change, and a subscriber added to it misses the change.
describe('an object under a field that was frozen on a parent that had already left the store', () => {
  it('returns its earlier snapshot once after a change under it, and a current one from then on', () => {
    const {store, panel, form, field} = createWorkspace();
    expect(snapshot(form).field.value).toBe(0);
    delete store.panel;

    Object.freeze(panel);
    field.value = 1;

    expect(snapshot(form).field.value).toBe(0);
    expect(snapshot(form).field.value).toBe(1);
  });

  it('does not tell a subscriber added after the freeze about a change under it', () => {
    const {store, panel, form, field} = createWorkspace();
    delete store.panel;

    Object.freeze(panel);
    const listener = mock(() => {});
    subscribe(form, listener, {sync: true});
    field.value = 1;

    expect(listener).toHaveBeenCalledTimes(0);
  });

  it('returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store', () => {
    const {store, panel, form, field} = createWorkspace();
    expect(snapshot(form).field.value).toBe(0);
    const unsubscribe = subscribe(panel, () => {});
    delete store.panel;
    unsubscribe();

    Object.freeze(panel);
    field.value = 1;

    expect(snapshot(form).field.value).toBe(0);
    expect(snapshot(form).field.value).toBe(1);
  });
});
