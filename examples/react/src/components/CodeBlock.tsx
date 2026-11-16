import {Highlight, type PrismTheme} from 'prism-react-renderer';

const signalSyntax: PrismTheme = {
  plain: {color: '#e6eef3', backgroundColor: '#101923'},
  styles: [
    {types: ['comment'], style: {color: '#9aaebd'}},
    {types: ['keyword', 'operator'], style: {color: '#ff80c5'}},
    {types: ['class-name', 'number', 'boolean'], style: {color: '#71e4f0'}},
    {types: ['string', 'attr-value'], style: {color: '#9be3ce'}},
    {types: ['function', 'function-variable'], style: {color: '#ffcf72'}},
  ],
};

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
    <div className="demo-code rounded-lg overflow-hidden border border-zinc-800">
      {title && (
        <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-mono">
          {title}
        </div>
      )}
      <Highlight theme={signalSyntax} code={trimmed} language={language}>
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
