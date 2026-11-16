import {useSyncExternalStore} from 'react';
import {usePersistenceExamples} from '../../stores/persistence-context';

function formatValue(raw: string | null) {
  if (raw === null) return '(empty)';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function StorageInspector({name}: {name: string}) {
  const {storage, subscribeStorage} = usePersistenceExamples();
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => storage.getItem(name),
    () => null,
  );
  return (
    <figure className="mt-4" aria-label={`Stored ${name}`}>
      <figcaption className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">
        localStorage["{name}"]
      </figcaption>
      <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-auto max-h-48 text-emerald-400/80 font-mono">
        {formatValue(raw)}
      </pre>
    </figure>
  );
}
