export function StatBadge({label, value}: {label: string; value: number}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="text-lg font-semibold tabular-nums text-(--color-text-primary)"
        style={{fontFamily: 'var(--font-mono)'}}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-(--color-text-muted)">
        {label}
      </span>
    </div>
  );
}
