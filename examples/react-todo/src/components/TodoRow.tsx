import type {ReactNode} from 'react';

export function TodoRow({children}: {children: ReactNode}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150 hover:bg-(--color-surface-overlay) animate-fade-in">
      {children}
    </div>
  );
}
