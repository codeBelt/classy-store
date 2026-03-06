import type {ButtonHTMLAttributes, ReactNode} from 'react';

type Variant = 'muted' | 'danger';

const variantStyles: Record<Variant, string> = {
  muted: 'text-(--color-text-muted) hover:text-(--color-text-secondary)',
  danger: 'text-(--color-text-muted) hover:text-(--color-danger)',
};

export function TextButton({
  variant = 'muted',
  children,
  ...props
}: {
  variant?: Variant;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`text-xs transition-colors duration-150 cursor-pointer ${variantStyles[variant]}`}
      {...props}
    >
      {children}
    </button>
  );
}
