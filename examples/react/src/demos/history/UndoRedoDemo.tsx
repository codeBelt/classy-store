import {useStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {history, textEditorStore} from '../../stores/historyStore';

const STORE_CODE = `class TextEditorStore {
  title = 'Untitled Document';
  content = 'Start typing here...';

  setTitle(title: string) { this.title = title; }
  setContent(content: string) { this.content = content; }
  reset() {
    this.title = 'Untitled Document';
    this.content = 'Start typing here...';
  }
}

const store = createClassyStore(new TextEditorStore());
const history = withHistory(store, { limit: 50 });`;

const COMPONENT_CODE = `// Undo/redo controls
history.undo();
history.redo();

// Check availability
history.canUndo; // boolean
history.canRedo; // boolean

// Batch multiple edits into one history entry
history.pause();
store.setTitle('New Title');
store.setContent('New content');
history.resume(); // single history entry`;

function TitleEditor() {
  const title = useStore(textEditorStore, (state) => state.title);
  const renders = useRenderCount();

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          Title
        </span>
        <RenderBadge count={renders} />
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => textEditorStore.setTitle(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50"
      />
    </div>
  );
}

function ContentEditor() {
  const content = useStore(textEditorStore, (state) => state.content);
  const renders = useRenderCount();

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          Content
        </span>
        <RenderBadge count={renders} />
      </div>
      <textarea
        value={content}
        onChange={(e) => textEditorStore.setContent(e.target.value)}
        rows={4}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50 resize-none"
      />
    </div>
  );
}

function HistoryControls() {
  const snap = useStore(textEditorStore);
  const [paused, setPaused] = useState(false);
  const renders = useRenderCount();

  // Reading snap to force re-render so canUndo/canRedo update
  void snap;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          History Controls
        </span>
        <RenderBadge count={renders} />
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          onClick={() => history.undo()}
          disabled={!history.canUndo}
          className="disabled:opacity-30"
        >
          Undo
        </Button>
        <Button
          size="sm"
          onClick={() => history.redo()}
          disabled={!history.canRedo}
          className="disabled:opacity-30"
        >
          Redo
        </Button>
        <Button
          size="sm"
          variant={paused ? 'danger' : 'secondary'}
          onClick={() => {
            if (paused) {
              history.resume();
              setPaused(false);
            } else {
              history.pause();
              setPaused(true);
            }
          }}
        >
          {paused ? 'Resume (save entry)' : 'Pause'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => textEditorStore.reset()}
        >
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>
          Can undo:{' '}
          <span
            className={history.canUndo ? 'text-emerald-400' : 'text-zinc-600'}
          >
            {String(history.canUndo)}
          </span>
        </span>
        <span>
          Can redo:{' '}
          <span
            className={history.canRedo ? 'text-emerald-400' : 'text-zinc-600'}
          >
            {String(history.canRedo)}
          </span>
        </span>
        {paused && (
          <span className="text-amber-400 font-medium">
            Recording paused — edits will batch
          </span>
        )}
      </div>
    </div>
  );
}

export function UndoRedoDemo() {
  return (
    <DemoContainer
      title="Undo / Redo Editor"
      description="withHistory() adds undo/redo via snapshot stack. Use pause()/resume() to batch multiple edits into a single entry."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Usage', code: COMPONENT_CODE},
      ]}
    >
      <div className="flex flex-col gap-4">
        <TitleEditor />
        <ContentEditor />
        <HistoryControls />
      </div>
    </DemoContainer>
  );
}
