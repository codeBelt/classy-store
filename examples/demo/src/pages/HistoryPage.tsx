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

      <ApiSignature
        importPath="@codebelt/classy-store/utils"
        signature="withHistory(store, options?): HistoryHandle"
      />

      <div className="flex flex-col gap-6">
        <UndoRedoDemo />
        <TipBox>
          Use <code className="text-xs bg-zinc-800 px-1 rounded">pause()</code>{' '}
          / <code className="text-xs bg-zinc-800 px-1 rounded">resume()</code>{' '}
          to batch multiple edits into a single history entry. This is useful
          for form submissions or complex multi-field updates.
        </TipBox>
      </div>
    </>
  );
}
