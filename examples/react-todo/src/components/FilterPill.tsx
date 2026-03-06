export function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer
        ${
          active
            ? 'bg-(--color-accent) text-white shadow-md shadow-indigo-500/25'
            : 'text-(--color-text-muted) hover:text-(--color-text-secondary) hover:bg-(--color-surface-overlay)'
        }
      `}
    >
      {label}
    </button>
  );
}
