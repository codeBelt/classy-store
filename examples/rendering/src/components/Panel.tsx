import type {ReactNode} from 'react';

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-zinc-400 mb-4">{description}</p>
      )}
      {children}
    </div>
  );
}
