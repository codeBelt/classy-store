import type {StorageAdapter} from '@codebelt/classy-store/utils';
import {Suspense} from 'react';
import {EditorStoreProvider} from '../../../example/components/editorStoreProvider/EditorStoreProvider';
import type {EditorData} from '../../../example/editorStore';
import type {
  HydrationGate,
  ScopedSsrMode,
  ScopedSsrObservation,
} from '../scopedSsr.types';
import {ScopedSsrProbe} from '../scopedSsrProbe/ScopedSsrProbe';
import {ScopedSsrValue} from '../scopedSsrValue/ScopedSsrValue';

type Props = ScopedSsrObservation & {
  initialData: EditorData;
  gate?: HydrationGate;
  mode: ScopedSsrMode;
  persistence?: {name: string; storage: StorageAdapter};
};

export function ScopedSsrTree({
  initialData,
  gate,
  mode,
  persistence,
  onStore,
  onRead,
  onCommit,
}: Props) {
  return (
    <EditorStoreProvider initialData={initialData} persistence={persistence}>
      <ScopedSsrProbe onStore={onStore} />
      <main>
        <p>Request shell</p>
        <Suspense fallback={<span>Loading editor</span>}>
          <ScopedSsrValue
            gate={gate}
            mode={mode}
            onRead={onRead}
            onCommit={onCommit}
          />
        </Suspense>
      </main>
    </EditorStoreProvider>
  );
}
