import {type ReactNode, useState} from 'react';
import {CodeBlock} from './CodeBlock';

interface CodeTab {
  label: string;
  code: string;
  language?: string;
}

export function DemoContainer({
  title,
  description,
  children,
  codeTabs,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  codeTabs?: CodeTab[];
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [showCode, setShowCode] = useState(true);

  if (!codeTabs || codeTabs.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-zinc-100 mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-zinc-400 mb-4">{description}</p>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex flex-col lg:flex-row">
        {/* Live demo */}
        <div className="flex-[3] p-6 min-w-0">
          <h3 className="text-lg font-semibold text-zinc-100 mb-1">{title}</h3>
          {description && (
            <p className="text-sm text-zinc-400 mb-4">{description}</p>
          )}
          {children}
        </div>

        {/* Code panel */}
        <div className="flex-[2] border-t lg:border-t-0 lg:border-l border-zinc-800 bg-zinc-950 min-w-0">
          <div className="flex items-center justify-between border-b border-zinc-800">
            <div className="flex">
              {codeTabs.map((tab, i) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === i
                      ? 'text-zinc-100 bg-zinc-900/50 border-b-2 border-indigo-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCode(!showCode)}
              className="px-2 py-1 mr-2 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer lg:hidden"
            >
              {showCode ? 'Hide' : 'Show'}
            </button>
          </div>
          {showCode && codeTabs[activeTab] && (
            <div className="max-h-[500px] overflow-y-auto">
              <CodeBlock
                code={codeTabs[activeTab].code}
                language={codeTabs[activeTab].language ?? 'tsx'}
                compact={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
