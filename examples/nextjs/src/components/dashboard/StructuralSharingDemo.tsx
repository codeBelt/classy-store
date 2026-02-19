'use client';

import {snapshot, subscribe} from '@codebelt/classy-store';
import {useEffect, useRef, useState} from 'react';
import {recipeStore} from '@/stores/recipe-store';

export function StructuralSharingDemo() {
  const prevSnap = useRef(snapshot(recipeStore));
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribe(recipeStore, () => {
      const nextSnap = snapshot(recipeStore);
      const prev = prevSnap.current;
      const entries: string[] = [];

      const topLevel = Object.is(prev, nextSnap);
      entries.push(`Top-level same ref: ${topLevel}`);

      const filterSame = Object.is(
        (prev as Record<string, unknown>).filter,
        (nextSnap as Record<string, unknown>).filter,
      );
      entries.push(`filter sub-tree same ref: ${filterSame}`);

      const recipesSame = Object.is(
        (prev as Record<string, unknown>).recipes,
        (nextSnap as Record<string, unknown>).recipes,
      );
      entries.push(`recipes sub-tree same ref: ${recipesSame}`);

      prevSnap.current = nextSnap;
      setLog((l) => [...entries, '---', ...l].slice(0, 30));
    });
    return unsub;
  }, []);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Structural Sharing</h2>
      <p className="text-sm text-muted">
        Compares snapshot sub-tree references with{' '}
        <code className="font-mono text-xs bg-border px-1 rounded">
          Object.is
        </code>{' '}
        after each mutation.
      </p>
      {log.length === 0 ? (
        <p className="text-xs text-muted italic">
          Mutate a recipe store property to see Object.is comparisons...
        </p>
      ) : (
        <div className="font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto">
          {log.map((entry, i) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: log entries have no stable id
              key={i}
              className={entry === '---' ? 'border-t border-border my-1' : ''}
            >
              {entry !== '---' && entry}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
