import type {ReactNode} from 'react';

export function CardDivided({children}: {children: ReactNode}) {
  return (
    <div className="border-t border-(--color-border-subtle)">{children}</div>
  );
}
