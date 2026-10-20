import type {Snapshot} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import type {ComponentProps} from 'react';
import type {EditorStoreProvider} from './example/components/editorStoreProvider/EditorStoreProvider';
import type {EditorStore} from './example/editorStore';
import {useEditorStore} from './example/hooks/useEditorStore';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Condition extends true> = Condition;
type ProviderProps = ComponentProps<typeof EditorStoreProvider>;

export function useScopedTypeAssertions() {
  const store = useEditorStore();
  const selected = useClassyStore(store, (state) => state.title);
  const tracked = useClassyStore(store);
  const assertions: [
    Expect<Equal<typeof store, EditorStore>>,
    Expect<Equal<typeof selected, string>>,
    Expect<Equal<typeof tracked, Snapshot<EditorStore>>>,
  ] = [true, true, true];
  store.setTitle('Typed title');
  store.setBody('Typed body');
  store.title = 'Mutable commands';

  // @ts-expect-error The strict context hook never returns an optional store.
  const missingStore: undefined = store;
  // @ts-expect-error Commands retain their argument types.
  store.setTitle(123);
  // @ts-expect-error Auto-tracked snapshots stay readonly through context.
  tracked.title = 'Readonly';
  // @ts-expect-error Selectors receive readonly snapshots.
  useClassyStore(store, (state) => (state.body = 'Readonly'));
  // @ts-expect-error The selected field is inferred as a string.
  const wrongSelection: number = selected;

  return {assertions, missingStore, wrongSelection};
}

const validProps: ProviderProps = {
  initialData: {title: 'Title', body: 'Body'},
  children: null,
};
const missingBody: ProviderProps = {
  // @ts-expect-error Initial data requires all editor fields.
  initialData: {title: 'Title'},
  children: null,
};
const missingStorage: ProviderProps = {
  ...validProps,
  // @ts-expect-error Persistence requires a storage adapter and key together.
  persistence: {name: 'editor'},
};
const invalidInitialData: ProviderProps = {
  // @ts-expect-error Initial fields retain their string types.
  initialData: {title: 1, body: 'Body'},
  children: null,
};

export const scopedProviderTypeAssertions = {
  validProps,
  missingBody,
  missingStorage,
  invalidInitialData,
};
