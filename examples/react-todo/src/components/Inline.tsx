import type {ReactNode} from 'react';

export function Inline({children}: {children: ReactNode}) {
  return <div className="flex gap-1">{children}</div>;
}
