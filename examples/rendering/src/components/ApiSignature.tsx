export function ApiSignature({
  importPath,
  signature,
}: {
  importPath: string;
  signature: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 mb-6 font-mono text-xs">
      <div className="text-zinc-500">
        import {'{'}{' '}
        <span className="text-indigo-400">{signature.split('(')[0]}</span> {'}'}{' '}
        from <span className="text-emerald-400">'{importPath}'</span>
      </div>
      <div className="text-zinc-300 mt-1">{signature}</div>
    </div>
  );
}
