export function RenderBadge({count}: {count: number}) {
  return (
    <span
      key={count}
      className="animate-render-flash inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono text-emerald-400 border border-emerald-400/30"
    >
      renders: {count}
    </span>
  );
}
