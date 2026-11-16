'use client';

import {snapshot, subscribe} from '@codebelt/classy-store';
import {useEffect, useState} from 'react';
import {Button} from '../../components/Button';
import {documentStore} from '../../stores/documentStore';

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

// #region reference-tree
function SnapshotTree() {
  const [pair, setPair] = useState<{current: Snap; previous?: Snap}>(() => ({
    current: snapshot(documentStore),
  }));
  useEffect(
    () =>
      subscribe(documentStore, () => {
        const current = snapshot(documentStore);
        setPair((old) => ({current, previous: old.current}));
      }),
    [],
  );
  const {current, previous} = pair;
  const rows = [
    ['root', previous === current, 0],
    ['.metadata', previous?.metadata === current.metadata, 1],
    ['.content', previous?.content === current.content, 1],
    [
      '.sections[0]',
      previous?.content.sections[0] === current.content.sections[0],
      2,
    ],
    [
      '.sections[1]',
      previous?.content.sections[1] === current.content.sections[1],
      2,
    ],
    ['.settings', previous?.settings === current.settings, 1],
  ] as const;
  return (
    <section className="lab-display ref-tree">
      <h4>Snapshot reference tree</h4>
      <ul>
        {rows.map(([name, same, depth]) => (
          <li
            style={{paddingInlineStart: depth * 15}}
            key={name}
            data-identity={previous && !same ? 'new' : 'same'}
          >
            <span>{name}</span>
            <span>
              {previous ? (same ? 'same ref' : 'new ref') : 'initial'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
// #endregion reference-tree

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
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SnapshotTree />
        <EventLog />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          onClick={() => {
            titleIndex = (titleIndex + 1) % titles.length;
            documentStore.updateTitle(titles[titleIndex] as string);
          }}
        >
          Edit Title
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            bodyIndex = (bodyIndex + 1) % bodies.length;
            documentStore.updateSectionBody(1, bodies[bodyIndex] as string);
          }}
        >
          Edit Section 1 Body
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            bodyIndex = (bodyIndex + 1) % bodies.length;
            documentStore.updateSectionBody(2, bodies[bodyIndex] as string);
          }}
        >
          Edit Section 2 Body
        </Button>
        <Button variant="secondary" onClick={() => documentStore.toggleTheme()}>
          Toggle Theme
        </Button>
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
          show new references. The{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.content</code>,{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.sections</code>,
          and{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">.settings</code>{' '}
          nodes retain their references because their snapshot references are
          structurally shared.
        </p>
      </div>
    </>
  );
}
