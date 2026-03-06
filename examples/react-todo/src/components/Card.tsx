import type {ReactNode} from 'react';

export function Card({children}: {children: ReactNode}) {
  return (
    <div className="bg-(--color-surface-raised) border border-(--color-border) rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}
