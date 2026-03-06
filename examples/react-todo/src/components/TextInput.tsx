import type {InputHTMLAttributes} from 'react';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className="
        flex-1 px-4 py-2.5 rounded-xl text-sm
        bg-(--color-surface-raised) border border-(--color-border)
        text-(--color-text-primary) placeholder:text-(--color-text-muted)
        outline-none transition-colors duration-200
        focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)/30
      "
      {...props}
    />
  );
}
