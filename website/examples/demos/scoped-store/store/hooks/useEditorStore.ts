import {useContext} from 'react';
import {EditorStoreContext} from '../editorStoreContext';

/** Get the nearest scope's mutable store; useClassyStore subscribes to its data. */
export function useEditorStore() {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within EditorStoreProvider');
  }
  return store;
}
