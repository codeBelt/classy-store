export function TodoLabel({
  text,
  completed,
}: {
  text: string;
  completed: boolean;
}) {
  return (
    <span
      className={`
        flex-1 text-sm transition-all duration-200 select-none
        ${
          completed
            ? 'line-through text-(--color-text-muted)'
            : 'text-(--color-text-primary)'
        }
      `}
    >
      {text}
    </span>
  );
}
