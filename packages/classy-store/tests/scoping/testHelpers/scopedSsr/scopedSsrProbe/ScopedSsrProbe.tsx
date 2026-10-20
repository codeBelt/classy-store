import {useEditorStore} from '../../../example/hooks/useEditorStore';
import type {ScopedSsrObservation} from '../scopedSsr.types';

type Props = Pick<ScopedSsrObservation, 'onStore'>;

export function ScopedSsrProbe({onStore}: Props) {
  const store = useEditorStore();
  onStore?.(store);
  return null;
}
