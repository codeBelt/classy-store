import {afterEach, describe, expect, test} from 'bun:test';
import {createClassyStore, subscribe} from '@codebelt/classy-store';
import {createStoreHook, useClassyStore} from '@codebelt/classy-store/react';
import {StrictMode, useLayoutEffect, useMemo} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {act} from './reactAct';

class ConsumerStore {
  count = 0;
  firstName = 'Ada';
  lastName = 'Lovelace';
  names = ['Alice', 'Bob'];
  unrelated = 0;

  updateProfile() {
    this.firstName = 'Grace';
    this.lastName = 'Hopper';
    this.count++;
  }
}

type Selection = {name: string};
type ConsumerViewProps = {
  store: ConsumerStore;
  index?: number;
  isEqual?: (previous: Selection, next: Selection) => boolean;
  onCommit?: (value: string) => void;
};

function ConsumerView({
  store,
  index = 0,
  isEqual,
  onCommit,
}: ConsumerViewProps) {
  const tracked = useClassyStore(store);
  const selected = useClassyStore(store, (state) => state.names[index]);
  const useStore = useMemo(() => createStoreHook(store), [store]);
  const bound = useStore((state) => ({name: state.names[index]}), {
    isEqual: isEqual ?? ((previous, next) => previous.name === next.name),
  });
  const profile = useClassyStore(
    store,
    (state) => `${state.firstName} ${state.lastName}`,
  );
  const value = `${tracked.count}|${profile}|${selected}|${bound.name}`;
  useLayoutEffect(() => {
    onCommit?.(value);
  });
  return <output>{value}</output>;
}

const mounted: {root: Root; container: HTMLDivElement}[] = [];

afterEach(async () => {
  for (const {root, container} of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

async function mount(props: ConsumerViewProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({root, container});
  await act(async () => {
    root.render(
      <StrictMode>
        <ConsumerView {...props} />
      </StrictMode>,
    );
  });
  return {root, container};
}

describe('packed React consumer', () => {
  test('commits a multi-property update synchronously while normal subscribers batch', async () => {
    const store = createClassyStore(new ConsumerStore());
    const commits: string[] = [];
    const {container} = await mount({
      store,
      onCommit: (value) => commits.push(value),
    });
    commits.length = 0;
    const notifications: string[] = [];
    const unsubscribe = subscribe(store, () => {
      notifications.push(`${store.firstName} ${store.lastName}`);
    });

    try {
      act(() => {
        store.updateProfile();
        expect(notifications).toEqual([]);
      });
      expect(container.textContent).toBe('1|Grace Hopper|Alice|Alice');
      expect(commits).toEqual(['1|Grace Hopper|Alice|Alice']);

      await Promise.resolve();
      expect(notifications).toEqual(['Grace Hopper']);
      commits.length = 0;
      await act(async () => {
        store.unrelated++;
      });
      expect(commits).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test('updates selectors when props and equality functions change', async () => {
    const store = createClassyStore(new ConsumerStore());
    const {root, container} = await mount({store});
    act(() => root.render(<ConsumerView store={store} index={1} />));
    expect(container.textContent).toBe('0|Ada Lovelace|Bob|Bob');

    const ignoreChanges = () => true;
    act(() => {
      root.render(
        <ConsumerView store={store} index={1} isEqual={ignoreChanges} />,
      );
    });
    act(() => {
      store.names[1] = 'Bobby';
    });
    expect(container.textContent).toBe('0|Ada Lovelace|Bobby|Bob');
    act(() => root.render(<ConsumerView store={store} index={1} />));
    expect(container.textContent).toBe('0|Ada Lovelace|Bobby|Bobby');
  });

  test('switches stores and releases the old subscription', async () => {
    const firstStore = createClassyStore(new ConsumerStore());
    const secondStore = createClassyStore(new ConsumerStore());
    secondStore.count = 7;
    const commits: string[] = [];
    const onCommit = (value: string) => commits.push(value);
    const {root, container} = await mount({store: firstStore, onCommit});
    act(() => {
      root.render(<ConsumerView store={secondStore} onCommit={onCommit} />);
    });
    expect(container.textContent).toBe('7|Ada Lovelace|Alice|Alice');
    commits.length = 0;

    await act(async () => {
      firstStore.updateProfile();
    });
    expect(commits).toEqual([]);
    act(() => secondStore.updateProfile());
    expect(container.textContent).toBe('8|Grace Hopper|Alice|Alice');
  });
});
