import type {ButtonHTMLAttributes} from 'react';

export function DeleteButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Delete"
      className="
        p-1.5 rounded-lg transition-all duration-150 cursor-pointer
        text-(--color-text-muted) hover:text-(--color-danger) hover:bg-red-500/10
        opacity-0 group-hover:opacity-100
      "
      {...props}
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
