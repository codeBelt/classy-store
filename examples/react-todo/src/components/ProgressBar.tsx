export function ProgressBar({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="w-full h-1 rounded-full bg-(--color-surface-overlay) overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${pct}%`,
          background:
            pct === 100
              ? 'var(--color-success)'
              : 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))',
        }}
      />
    </div>
  );
}
