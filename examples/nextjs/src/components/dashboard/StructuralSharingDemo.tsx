'use client';

import {snapshot, subscribe} from '@codebelt/classy-store';
import {useEffect, useRef, useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';

export function StructuralSharingDemo() {
  const prevSnap = useRef(snapshot(recipeStore));
  const [log, setLog] = useState<{id: number; text: string}[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    const unsub = subscribe(recipeStore, () => {
      const nextSnap = snapshot(recipeStore);
      const prev = prevSnap.current;
      const entries: string[] = [];
      const timestamp = new Date().toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // Check structural sharing
      const topLevel = Object.is(prev, nextSnap);
      entries.push(
        `[${timestamp}] Top-level ref: ${topLevel ? 'SAME' : 'CHANGED'}`,
      );

      const filterSame = Object.is(
        (prev as Record<string, unknown>).filter,
        (nextSnap as Record<string, unknown>).filter,
      );
      entries.push(
        `[${timestamp}] Filter sub-tree: ${filterSame ? 'SAME' : 'CHANGED'}`,
      );

      const recipesSame = Object.is(
        (prev as Record<string, unknown>).recipes,
        (nextSnap as Record<string, unknown>).recipes,
      );
      entries.push(
        `[${timestamp}] Recipes sub-tree: ${recipesSame ? 'SAME' : 'CHANGED'}`,
      );

      prevSnap.current = nextSnap;

      const newEntries = [
        ...entries.map((text) => ({id: ++idCounter.current, text})),
        {id: ++idCounter.current, text: '---'},
      ];

      setLog((l) => [...newEntries, ...l].slice(0, 40));
    });
    return unsub;
  }, []);

  return (
    <div className="glass-card flex flex-col h-full animate-slide-up-delay-3">
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-sm">Structure & Ref Checks</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Memory Efficiency
            </p>
          </div>
        </div>

        <ApiInfo
          minimal={true}
          apis={['snapshot', 'Object.is']}
          description="Takes two consecutive snapshots and compares sub-trees with Object.is to demonstrate structural sharing."
          code={`const topLevel = Object.is(prev, nextSnap);
const filterSame = Object.is(prev.filter, nextSnap.filter);`}
        />
      </div>

      <div className="p-5 flex-1 flex flex-col min-h-[220px]">
        <div
          ref={logContainerRef}
          className="flex-1 bg-black/40 rounded-lg border border-white/5 p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar flex flex-col-reverse"
          style={{maxHeight: '300px'}}
        >
          {log.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic space-y-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-8 h-8 opacity-20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>Waiting for mutations...</p>
              <p className="text-[10px]">
                Modify a store to see structural sharing in action
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 w-full">
              {log.map((entry) => {
                if (entry.text === '---')
                  return (
                    <div
                      key={entry.id}
                      className="h-px bg-white/5 my-2 w-full"
                    />
                  );

                const isSame = entry.text.includes('SAME');
                const isChanged = entry.text.includes('CHANGED');

                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 w-full"
                  >
                    <span className="text-muted-foreground/70 select-none">
                      {entry.text.match(/^\[(.*?)\]/)?.[1] || ''}
                    </span>
                    <span className="text-muted-foreground">
                      {entry.text.replace(/^\[.*?\]\s*/, '').split(':')[0]}:
                    </span>
                    <span
                      className={`ml-auto font-bold ${
                        isSame
                          ? 'text-emerald-400'
                          : isChanged
                            ? 'text-orange-400'
                            : 'text-foreground'
                      }`}
                    >
                      {isSame ? 'SAME REF' : isChanged ? 'NEW REF' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
