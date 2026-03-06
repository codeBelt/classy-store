import type {ReactNode} from 'react';

type Gap = 'sm' | 'md';

const gapStyles: Record<Gap, string> = {
  sm: 'gap-1',
  md: 'gap-4',
};

export function Stack({
  gap = 'md',
  children,
}: {
  gap?: Gap;
  children: ReactNode;
}) {
  return <div className={`flex flex-col ${gapStyles[gap]}`}>{children}</div>;
}
