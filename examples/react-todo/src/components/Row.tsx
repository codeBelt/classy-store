import type {ReactNode} from 'react';

type Justify = 'between' | 'around';

const justifyStyles: Record<Justify, string> = {
  between: 'justify-between',
  around: 'justify-around',
};

export function Row({
  justify = 'between',
  children,
}: {
  justify?: Justify;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center ${justifyStyles[justify]}`}>
      {children}
    </div>
  );
}
