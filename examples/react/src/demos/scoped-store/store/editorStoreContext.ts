import {createContext} from 'react';
import type {EditorStore} from './editorStore';

// Share the context definition, never a mutable store instance, across requests.
export const EditorStoreContext = createContext<EditorStore | null>(null);
