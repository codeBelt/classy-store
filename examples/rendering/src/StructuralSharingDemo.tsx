import {snapshot, subscribe} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';
import {useEffect, useRef, useState} from 'react';
import {Panel} from './Panel';
import {documentStore} from './stores';

type Snap = ReturnType<typeof snapshot<typeof documentStore>>;

const titles = ['Untitled', 'My Report', 'Draft v2', 'Final Copy'];
let titleIndex = 0;

const bodies = [
  'Welcome to the document.',
  'This section has been updated.',
  'New content was added here.',
  'Revised for clarity.',
];
let bodyIndex = 0;

function useRefComparison() {
  const prevSnap = useRef<Snap | null>(null);
  const snap = snapshot(documentStore);
  const prev = prevSnap.current;
  prevSnap.current = snap;
  return {snap, prev};
}

function RefIndicator({same}: {same: boolean | null}) {
  if (same === null) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono bg-zinc-700/50 text-zinc-500 border border-zinc-600/30">
        init
      </span>
    );
  }
  if (same) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        same ref ===
      </span>
    );
  }
  return (
    <span
      key={Date.now()}
      className="animate-ref-flash inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono text-red-400 border border-red-400/30"
    >
      new ref
    </span>
  );
}

function TreeNode({
  label,
  getValue,
  depth = 0,
  children,
}: {
  label: string;
  getValue: (snap: Snap) => unknown;
  depth?: number;
  children?: React.ReactNode;
}) {
  useStore(documentStore, () => snapshot(documentStore));
  const {snap, prev} = useRefComparison();

  const currentVal = getValue(snap);
  const prevVal = prev ? getValue(prev) : undefined;
  const same = prev === null ? null : currentVal === prevVal;

  return (
    <div style={{marginLeft: depth * 20}}>
      <div className="flex items-center gap-2 py-1">
        <span className="text-sm font-mono text-zinc-300">{label}</span>
        <RefIndicator same={same} />
      </div>
      {children}
    </div>
  );
}

function SnapshotTree() {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
      <div className="text-xs text-zinc-400 uppercase tracking-wide mb-3">
        Snapshot Reference Tree
      </div>
      <TreeNode label="root" getValue={(store) => store}>
        <TreeNode
          label=".metadata"
          getValue={(store) => store.metadata}
          depth={1}
        />
        <TreeNode
          label=".content"
          getValue={(store) => store.content}
          depth={1}
        >
          <TreeNode
            label=".sections[0]"
            getValue={(store) => store.content.sections[0]}
            depth={2}
          />
          <TreeNode
            label=".sections[1]"
            getValue={(store) => store.content.sections[1]}
            depth={2}
          />
        </TreeNode>
        <TreeNode
          label=".settings"
          getValue={(store) => store.settings}
          depth={1}
        />
      </TreeNode>
    </div>
  );
}

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
}

let logId = 0;

function EventLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    const unsub = subscribe(documentStore, () => {
      const snap = snapshot(documentStore);
      const now = new Date();
      const ts = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
        .getMilliseconds()
        .toString()
        .padStart(3, '0')}`;
      setEntries((prev) => [
        {
          id: ++logId,
          timestamp: ts,
          message: `title="${snap.metadata.title}" theme=${snap.settings.theme} sections=${snap.content.sections.length}`,
        },
        ...prev.slice(0, 19),
      ]);
    });
    return unsub;
  }, []);

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
      <div className="text-xs text-zinc-400 uppercase tracking-wide mb-2">
        subscribe() Event Log <span className="text-zinc-500">(non-React)</span>
      </div>
      <div className="h-32 overflow-y-auto font-mono text-xs space-y-0.5">
        {entries.length === 0 ? (
          <p className="text-zinc-600 py-2">
            No events yet. Click a button to trigger a mutation.
          </p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="text-zinc-400">
              <span className="text-zinc-500">[{e.timestamp}]</span> {e.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function StructuralSharingDemo() {
  return (
    <Panel
      title="Structural Sharing Explorer"
      description="Visualize snapshot reference identity. Green means the reference is the same (===) as the previous snapshot — only mutated branches get new references."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SnapshotTree />
        <EventLog />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            titleIndex = (titleIndex + 1) % titles.length;
            documentStore.updateTitle(titles[titleIndex] as string);
          }}
          className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-400 transition-colors cursor-pointer"
        >
          Edit Title
        </button>
        <button
          type="button"
          onClick={() => {
            bodyIndex = (bodyIndex + 1) % bodies.length;
            documentStore.updateSectionBody(1, bodies[bodyIndex] as string);
          }}
          className="px-3 py-1.5 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-400 transition-colors cursor-pointer"
        >
          Edit Section 1 Body
        </button>
        <button
          type="button"
          onClick={() => {
            bodyIndex = (bodyIndex + 1) % bodies.length;
            documentStore.updateSectionBody(2, bodies[bodyIndex] as string);
          }}
          className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition-colors cursor-pointer"
        >
          Edit Section 2 Body
        </button>
        <button
          type="button"
          onClick={() => documentStore.toggleTheme()}
          className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-colors cursor-pointer"
        >
          Toggle Theme
        </button>
      </div>

      <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-4">
        <div className="text-xs text-zinc-400 uppercase tracking-wide mb-2">
          What to watch
        </div>
        <p className="text-sm text-zinc-300">
          Click{' '}
          <span className="font-semibold text-violet-400">Edit Title</span> —
          only{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.metadata</code>{' '}
          and <code className="text-xs bg-zinc-800 px-1 rounded">root</code>{' '}
          flash red. The{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.content</code>,{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.sections</code>,
          and{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.settings</code>{' '}
          nodes stay green because their snapshot references are structurally
          shared.
        </p>
      </div>
    </Panel>
  );
}
