import type {ReactNode} from 'react';

export function PageShell({children}: {children: ReactNode}) {
  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-12 sm:py-20">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <main className="w-full max-w-lg flex flex-col gap-6 relative">
        {children}
      </main>
    </div>
  );
}
