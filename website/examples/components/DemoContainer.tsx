'use client';

import {Children, isValidElement, type ReactNode, useState} from 'react';

// The MDX page supplies the live control and pre-highlighted, copyable code blocks.
export function DemoContainer({
  demo,
  labels,
  children,
}: {
  demo: ReactNode;
  labels: string[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const blocks = Children.toArray(children).filter(isValidElement);
  return (
    <section className="not-prose rounded-xl border border-fd-border bg-fd-card">
      <div className="p-4 sm:p-5">{demo}</div>
      <fieldset
        aria-label="Example source"
        className="flex gap-1 border-t border-fd-border px-3"
      >
        {['Demo', ...labels].map((label, i) => (
          <button
            type="button"
            key={label}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
            className="cursor-pointer px-3 py-2 text-sm aria-pressed:border-b-2 aria-pressed:border-fd-primary"
          >
            {label}
          </button>
        ))}
      </fieldset>
      {active > 0 && <div className="example-source">{blocks[active - 1]}</div>}
    </section>
  );
}
