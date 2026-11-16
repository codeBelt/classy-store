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

  const selectedCode = codeTabs?.[activeTab - 1];
  const allTabs = [
    {label: 'Demo', type: 'demo' as const},
    ...(codeTabs ?? []).map((t) => ({...t, type: 'code' as const})),
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-0">
        <h3 className="text-lg font-semibold text-zinc-100 mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-zinc-400 mb-0">{description}</p>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">{children}</div>
      {/* Source tabs leave the live experiment mounted. */}
      <div className="flex border-b border-zinc-800 px-6 mt-4">
        {allTabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            aria-pressed={activeTab === i}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer -mb-px ${
              activeTab === i
                ? 'text-zinc-100 border-b-2 border-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selectedCode && (
        <div className="max-h-[500px] overflow-auto">
          <CodeBlock
            code={selectedCode.code}
            language={selectedCode.language ?? 'tsx'}
            compact={true}
          />
        </div>
      )}
    </div>
  );
}
