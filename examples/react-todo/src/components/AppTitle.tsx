import type {ReactNode} from 'react';

export function AppTitle({children}: {children: ReactNode}) {
  return <h1 className="text-xl font-semibold tracking-tight">{children}</h1>;
}
