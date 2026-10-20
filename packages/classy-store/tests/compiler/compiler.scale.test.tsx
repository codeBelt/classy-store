import {afterEach, describe, expect, test} from 'bun:test';
import type {ComponentType} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {ScaleSelectorField} from './fixtures/scaleSelectorField/ScaleSelectorField';
import {ScaleSelectorRow} from './fixtures/scaleSelectorRow/ScaleSelectorRow';
import {ScaleTrackedField} from './fixtures/scaleTrackedField/ScaleTrackedField';
import {ScaleTrackedRow} from './fixtures/scaleTrackedRow/ScaleTrackedRow';
import {act} from './reactAct';
import {createScaleStore} from './scale.store';
import type {ScaleConsumerProps} from './scale.types';

const mounted = new Map<Root, HTMLDivElement>();
const formSize = 256;
const listSize = 512;
const fieldCases = [
  {description: 'selectors', Component: ScaleSelectorField},
  {description: 'auto-tracking', Component: ScaleTrackedField},
];
const rowCases = [
  {description: 'selectors', Component: ScaleSelectorRow},
  {description: 'auto-tracking', Component: ScaleTrackedRow},
];

afterEach(async () => {
  for (const [root, container] of mounted) {
    await act(async () => root.unmount());
    container.remove();
  }
  mounted.clear();
});

async function mountConsumers(
  Component: ComponentType<ScaleConsumerProps>,
  size: number,
  kind: 'form' | 'list',
) {
  const store = createScaleStore(size);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.set(root, container);
  const commits: number[] = [];
  const onCommit = (index: number) => commits.push(index);
  const consumers = Array.from({length: size}, (_, index) => ({
    id: `consumer-${index}`,
    index,
  }));
  const render = (label = 'Initial', count = size) => {
    const children = consumers
      .slice(0, count)
      .map(({id, index}) => (
        <Component
          key={id}
          store={store}
          index={index}
          label={label}
          onCommit={onCommit}
        />
      ));
    root.render(
      kind === 'list' ? <ul>{children}</ul> : <form>{children}</form>,
    );
  };
  await act(async () => render());
  expect(commits).toHaveLength(size);
  commits.length = 0;
  const readConsumer = (index: number) =>
    container.querySelector(`[data-consumer="${index}"]`);
  const readInput = (index: number) =>
    readConsumer(index)?.querySelector('input')?.value;
  const readOutput = (index: number) =>
    readConsumer(index)?.querySelector('output')?.textContent;
  const clickLocal = (index: number) =>
    readConsumer(index)?.querySelector('button')?.click();
  return {
    store,
    commits,
    render,
    readInput,
    readOutput,
    readConsumer,
    clickLocal,
    root,
    container,
  };
}

describe('large controlled forms', () => {
  test.each(
    fieldCases,
  )('$description commits only fields with changed values', async ({
    Component,
  }) => {
    const {store, commits, readInput} = await mountConsumers(
      Component,
      formSize,
      'form',
    );
    await act(async () => {
      store.ignored++;
      store.rows[0].title = 'Unread row';
      store.fields[137].value = 'Field 137';
    });
    expect(commits).toEqual([]);

    await act(async () => {
      store.fields[137].value = 'Typed value';
    });
    expect(commits).toEqual([137]);
    expect(readInput(137)).toBe('Typed value');
    expect(readInput(136)).toBe('Field 136');

    commits.length = 0;
    await act(async () => {
      store.fields[137].value = 'Typed value';
    });
    expect(commits).toEqual([]);

    await act(async () => {
      for (const index of [1, 64, 128, 255]) {
        store.fields[index].value = `Updated ${index}`;
      }
    });
    expect([...commits].sort((left, right) => left - right)).toEqual([
      1, 64, 128, 255,
    ]);
    for (const index of [1, 64, 128, 255]) {
      expect(readInput(index)).toBe(`Updated ${index}`);
    }
  });

  test.each(
    fieldCases,
  )('$description preserves one-field updates after parent and local renders', async ({
    Component,
  }) => {
    const {store, commits, render, clickLocal, readInput, readConsumer} =
      await mountConsumers(Component, formSize, 'form');
    await act(async () => render('Parent'));
    expect(commits).toHaveLength(formSize);
    expect(readConsumer(137)?.textContent).toContain('Parent 137');
    commits.length = 0;

    await act(async () => clickLocal(137));
    expect(commits).toEqual([137]);
    expect(readConsumer(137)?.textContent).toContain('Local 1');
    commits.length = 0;

    await act(async () => {
      store.fields[137].value = 'After memoized render';
    });
    expect(commits).toEqual([137]);
    expect(readInput(137)).toBe('After memoized render');
    commits.length = 0;
    await act(async () => {
      store.ignored++;
    });
    expect(commits).toEqual([]);
  });
});

describe('large lists', () => {
  test.each(
    rowCases,
  )('$description keeps row updates isolated through removal and remount', async ({
    Component,
  }) => {
    const {store, commits, render, readOutput, root, container} =
      await mountConsumers(Component, listSize, 'list');
    await act(async () => {
      store.ignored++;
      store.fields[0].value = 'Unread field';
      store.rows[400].title = 'Row 400';
    });
    expect(commits).toEqual([]);

    await act(async () => {
      store.rows[400].title = 'Updated';
      store.rows[400].count = 900;
    });
    expect(commits).toEqual([400]);
    expect(readOutput(400)).toBe('Initial:Updated:900');
    expect(readOutput(399)).toBe('Initial:Row 399:399');

    await act(async () => render('Initial', listSize / 2));
    commits.length = 0;
    await act(async () => {
      store.rows[400].title = 'While unmounted';
    });
    expect(commits).toEqual([]);
    expect(readOutput(400)).toBeUndefined();
    await act(async () => {
      store.rows[100].count++;
    });
    expect(commits).toEqual([100]);
    expect(readOutput(100)).toBe('Initial:Row 100:101');

    await act(async () => render());
    expect(readOutput(400)).toBe('Initial:While unmounted:900');
    commits.length = 0;
    await act(async () => {
      store.rows[400].count++;
    });
    expect(commits).toEqual([400]);
    expect(readOutput(400)).toBe('Initial:While unmounted:901');

    await act(async () => root.unmount());
    mounted.delete(root);
    container.remove();
    commits.length = 0;
    await act(async () => {
      store.rows[100].title = 'No mounted consumers';
      store.rows[400].count++;
    });
    expect(commits).toEqual([]);
  });

  test.each(
    rowCases,
  )('$description retains memoized reads without waking sibling rows', async ({
    Component,
  }) => {
    const {store, commits, render, clickLocal, readOutput} =
      await mountConsumers(Component, listSize, 'list');
    await act(async () => render('Parent'));
    expect(commits).toHaveLength(listSize);
    commits.length = 0;

    await act(async () => clickLocal(400));
    expect(commits).toEqual([400]);
    commits.length = 0;
    await act(async () => {
      store.rows[400].title = 'After local render';
    });
    expect(commits).toEqual([400]);
    expect(readOutput(400)).toBe('Parent:After local render:400');

    commits.length = 0;
    await act(async () => {
      store.rows[400].count = 401;
    });
    expect(commits).toEqual([400]);
    expect(readOutput(400)).toBe('Parent:After local render:401');
    commits.length = 0;
    await act(async () => {
      store.ignored++;
    });
    expect(commits).toEqual([]);
  });
});
