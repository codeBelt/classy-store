import type {FormHTMLAttributes, ReactNode} from 'react';

export function InputRow({
  children,
  ...props
}: {children: ReactNode} & FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className="flex gap-2" {...props}>
      {children}
    </form>
  );
}
