import {ApiSignature} from '../components/ApiSignature';
import {TipBox} from '../components/TipBox';
import {UndoRedoDemo} from '../demos/history/UndoRedoDemo';

export function HistoryPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">History</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Add undo/redo capability to any store with withHistory().
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <UndoRedoDemo />
        <ApiSignature
          importPath="@codebelt/classy-store/utils"
          signature="withHistory(store, options?): HistoryHandle"
        />
        <TipBox>
          Use <code className="text-xs bg-zinc-800 px-1 rounded">pause()</code>{' '}
          / <code className="text-xs bg-zinc-800 px-1 rounded">resume()</code>{' '}
          to skip recording while paused. New changes are recorded after
          resuming.
        </TipBox>
      </div>
    </>
  );
}
