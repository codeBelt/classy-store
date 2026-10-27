import {useLocalStore} from '@codebelt/classy-store/react';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';
import {persist, type StorageAdapter} from '@codebelt/classy-store/utils';
import {type ReactNode, useEffect} from 'react';
import {type EditorData, EditorStore} from '../../editorStore';
import {EditorStoreContext} from '../../editorStoreContext';

type Props = {
  initialData: EditorData;
  children: ReactNode;
  persistence?: {name: string; storage: StorageAdapter};
};

/** Own one store per mount. Change the provider's key to start a new session. */
export function EditorStoreProvider({
  initialData,
  children,
  persistence,
}: Props) {
  const store = prepareStoreForHydration(
    useLocalStore(() => new EditorStore(initialData)),
  );
  const name = persistence?.name;
  const storage = persistence?.storage;

  useEffect(() => {
    if (name === undefined || storage === undefined) return;
    const handle = persist(store, {
      name,
      storage,
      properties: ['title', 'body'],
      skipHydration: true,
    });
    void handle
      .rehydrate()
      .catch((error) => console.error('Could not restore editor data', error));
    return () => handle.dispose();
  }, [store, name, storage]);

  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}
