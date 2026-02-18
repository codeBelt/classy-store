import type {ButtonHTMLAttributes, ReactNode} from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const variantStyles: Record<Variant, string> = {
  primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
  secondary: 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
  ghost:
    'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg font-medium transition-colors cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
