import type {ReactNode} from 'react';

export function ListStack({children}: {children: ReactNode}) {
  return (
    <div className="flex flex-col divide-y divide-(--color-border-subtle)">
      {children}
    </div>
  );
}
