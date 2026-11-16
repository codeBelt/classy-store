export function RenderBadge({count}: {count: number}) {
  return (
    <span
      key={count}
      className="animate-render-flash inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono text-indigo-400 border border-zinc-700"
    >
      renders: {count}
    </span>
  );
}
