import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {type ComponentType, StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {compilerStore, resetCompilerStore} from './compiler.store';
import type {ConsumerProps} from './compiler.types';
import {BoundSelector} from './components/boundSelector/BoundSelector';
import {BoundTracked} from './components/boundTracked/BoundTracked';
import {DirectSelector} from './components/directSelector/DirectSelector';
import {DirectTracked} from './components/directTracked/DirectTracked';
import {act} from './reactAct';

const mounted: {root: Root; container: HTMLDivElement}[] = [];

beforeEach(resetCompilerStore);

afterEach(async () => {
  for (const {root, container} of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

async function mount(Component: ComponentType<ConsumerProps>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({root, container});
  const commits: string[] = [];
  const onCommit = (value: string) => commits.push(value);
  const render = (props: Partial<ConsumerProps> = {}) => {
    root.render(
      <StrictMode>
        <Component onCommit={onCommit} {...props} />
      </StrictMode>,
    );
  };
  await act(async () => render());
  commits.length = 0;
  const read = () => container.querySelector('output')?.textContent;
  const profile = () => container.querySelector('[data-profile]')?.textContent;
  const switchGroup = () => container.querySelector('button')?.click();
  return {container, root, commits, render, read, profile, switchGroup};
}

for (const Component of [
  DirectTracked,
  BoundTracked,
  DirectSelector,
  BoundSelector,
]) {
  describe(`compiled ${Component.name}`, () => {
    test('keeps memoized reads subscribed after a local render', async () => {
      const {read, profile, switchGroup} = await mount(Component);
      expect(read()).toBe('0|Alpha');
      expect(profile()).toBe('Ada');
      act(switchGroup);
      expect(read()).toBe('0|Beta');

      act(() => {
        compilerStore.count = 1;
      });
      expect(read()).toBe('1|Beta');
      act(() => {
        compilerStore.profile.name = 'Grace';
      });
      expect(profile()).toBe('Grace');
      act(() => {
        compilerStore.groups[1].name = 'Updated';
      });
      expect(read()).toBe('1|Updated');
    });

    test('updates conditional nested reads and ignores unrelated fields', async () => {
      const {read, commits, switchGroup} = await mount(Component);
      act(() => {
        compilerStore.unrelated++;
      });
      expect(commits).toEqual([]);
      act(() => {
        compilerStore.groups[0].name = 'Active';
      });
      expect(read()).toBe('0|Active');
      act(switchGroup);
      expect(read()).toBe('0|Beta');
      act(() => {
        compilerStore.groups[1].name = 'Second';
      });
      expect(read()).toBe('0|Second');
      act(switchGroup);
      expect(read()).toBe('0|Active');
      act(() => {
        compilerStore.groups[0].name = 'Again';
      });
      expect(read()).toBe('0|Again');
    });

    test('keeps nested props live when a memoized child skips a render', async () => {
      const {profile, switchGroup} = await mount(Component);
      act(switchGroup);
      act(() => {
        compilerStore.groups[1].name = 'Local group';
      });
      expect(profile()).toBe('Ada');
      act(() => {
        compilerStore.profile = {name: 'Katherine', ignored: 0};
      });
      expect(profile()).toBe('Katherine');
      act(switchGroup);
      act(() => {
        compilerStore.profile.name = 'Dorothy';
      });
      expect(profile()).toBe('Dorothy');
    });
  });
}

for (const Component of [DirectSelector, BoundSelector]) {
  test(`compiled ${Component.name} refreshes selectors and equality from props`, async () => {
    const {read, render, switchGroup} = await mount(Component);
    act(() => render({prefix: 'Selected: '}));
    expect(read()).toBe('0|Selected: Alpha');
    act(switchGroup);
    expect(read()).toBe('0|Selected: Beta');
    const ignoreChanges = () => true;
    act(() => render({prefix: 'Selected: ', isEqual: ignoreChanges}));
    act(() => {
      compilerStore.groups[1].name = 'Newest';
    });
    expect(read()).toBe('0|Selected: Beta');
    act(() => render({prefix: 'Selected: '}));
    expect(read()).toBe('0|Selected: Newest');
  });
}

for (const Component of [DirectTracked, BoundTracked]) {
  test(`compiled ${Component.name} retains array reads used by a cached derivation`, async () => {
    const {container, read, switchGroup} = await mount(Component);
    const names = () => container.querySelector('[data-names]')?.textContent;
    expect(names()).toBe('Alpha,Beta');
    act(switchGroup);
    expect(read()).toBe('0|Beta');
    expect(names()).toBe('Alpha,Beta');
    act(() => {
      compilerStore.groups[0].name = 'Changed';
    });
    expect(read()).toBe('0|Beta');
    expect(names()).toBe('Changed,Beta');
  });
}
