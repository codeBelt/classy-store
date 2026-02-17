const navGroups = [
  {
    label: 'Getting Started',
    items: [{href: '#/', label: 'Overview', route: '/'}],
  },
  {
    label: 'Core',
    items: [
      {href: '#/reactivity', label: 'Reactivity', route: '/reactivity'},
      {href: '#/collections', label: 'Collections', route: '/collections'},
      {href: '#/snapshots', label: 'Snapshots', route: '/snapshots'},
    ],
  },
  {
    label: 'React',
    items: [
      {
        href: '#/use-local-store',
        label: 'useLocalStore',
        route: '/use-local-store',
      },
    ],
  },
  {
    label: 'Utilities',
    items: [
      {href: '#/persist', label: 'Persist', route: '/persist'},
      {href: '#/history', label: 'History', route: '/history'},
      {href: '#/devtools', label: 'DevTools', route: '/devtools'},
      {
        href: '#/subscribe-key',
        label: 'subscribeKey',
        route: '/subscribe-key',
      },
      {
        href: '#/shallow-equal',
        label: 'shallowEqual',
        route: '/shallow-equal',
      },
    ],
  },
];

export function NavSidebar({
  route,
  open,
  onClose,
}: {
  route: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 bg-black/50 z-40 lg:hidden cursor-default"
          onClick={onClose}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-zinc-950 border-r border-zinc-800 z-50 transform transition-transform lg:relative lg:translate-x-0 lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-zinc-800">
          <a
            href="#/"
            className="text-sm font-bold text-zinc-100 hover:text-indigo-400 transition-colors"
          >
            @codebelt/classy-store
          </a>
          <div className="text-xs text-zinc-500 mt-0.5">
            Interactive Examples
          </div>
        </div>

        <div className="px-3 pt-3">
          <a
            href="../"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Docs
          </a>
        </div>

        <nav className="p-3 overflow-y-auto h-[calc(100%-108px)]">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                {group.label}
              </div>
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`block px-2 py-1.5 rounded-md text-sm transition-colors ${
                    route === item.route
                      ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
