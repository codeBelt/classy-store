import {useClassyStore} from '@codebelt/classy-store/react';
import {memo} from 'react';
import {useEditorStore} from '../../../example/hooks/useEditorStore';

export const QaMemoSelector = memo(function QaMemoSelector() {
  const store = useEditorStore();
  const title = useClassyStore(store, (state) => state.title);
  return <output data-qa-selected={true}>{title}</output>;
});
