export function ApiInfo({
  apis,
  description,
  code,
  minimal = false,
  alignment = 'right',
}: {
  apis: string[];
  description: string;
  code?: string;
  minimal?: boolean;
  alignment?: 'left' | 'right';
}) {
  return (
    <details className="group text-xs relative">
      <summary
        className={`cursor-pointer transition-colors select-none inline-flex items-center gap-1.5 
        ${minimal ? 'text-muted-foreground hover:text-white' : 'text-primary hover:text-primary/80'}`}
      >
        <div
          className={`flex items-center justify-center w-4 h-4 rounded full 
          ${minimal ? 'bg-white/5 group-hover:bg-white/10' : 'bg-primary/10 text-primary'}`}
        >
          <svg
            className="w-3 h-3 transition-transform duration-200 group-open:rotate-90"
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
        </div>
        <span className="font-medium">How it works</span>
      </summary>

      <div
        className={`absolute top-full mt-2 w-80 z-20 glass-card p-4 space-y-3 animate-appear ${
          alignment === 'right'
            ? 'right-0 origin-top-right'
            : 'left-0 origin-top-left'
        }`}
      >
        <div className="flex flex-wrap gap-1.5">
          {apis.map((api) => (
            <span
              key={api}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono bg-primary/10 text-primary border border-primary/20"
            >
              {api}
            </span>
          ))}
        </div>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
        {code ? (
          <div className="relative">
            <pre className="custom-scrollbar bg-black/40 border border-white/5 rounded-lg p-3 overflow-x-auto text-[10px] leading-relaxed font-mono text-blue-200/90 shadow-inner">
              {code}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}
