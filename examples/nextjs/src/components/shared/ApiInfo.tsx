export function ApiInfo({
  apis,
  description,
  code,
}: {
  apis: string[];
  description: string;
  code?: string;
}) {
  return (
    <details className="group text-xs">
      <summary className="cursor-pointer text-muted hover:text-foreground transition-colors select-none inline-flex items-center gap-1">
        <svg
          className="w-3 h-3 transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        How it works
      </summary>
      <div className="mt-2 border border-border rounded-md bg-background p-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {apis.map((api) => (
            <span
              key={api}
              className="inline-block px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono text-[11px]"
            >
              {api}
            </span>
          ))}
        </div>
        <p className="text-muted text-sm leading-relaxed">{description}</p>
        {code ? (
          <pre className="bg-card border border-border rounded p-2 overflow-x-auto text-[11px] leading-relaxed font-mono whitespace-pre">
            {code}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
