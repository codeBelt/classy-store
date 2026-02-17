import {Highlight, themes} from 'prism-react-renderer';

export function CodeBlock({
  code,
  language = 'tsx',
  title,
  compact = false,
}: {
  code: string;
  language?: string;
  title?: string;
  compact?: boolean;
}) {
  const trimmed = code.trim();

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
      {title && (
        <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-mono">
          {title}
        </div>
      )}
      <Highlight theme={themes.nightOwl} code={trimmed} language={language}>
        {({tokens, getLineProps, getTokenProps}) => (
          <pre
            className={`overflow-x-auto font-mono text-xs leading-relaxed ${compact ? 'p-3' : 'p-4'}`}
            style={{background: 'transparent'}}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({line})}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({token})} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
