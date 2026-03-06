import type {ButtonHTMLAttributes, ReactNode} from 'react';

export function SubmitButton({
  children,
  ...props
}: {
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className="
        px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer
        bg-(--color-accent) text-white transition-all duration-200
        hover:bg-(--color-accent-hover) hover:shadow-lg hover:shadow-indigo-500/20
        disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none
      "
      {...props}
    >
      {children}
    </button>
  );
}
