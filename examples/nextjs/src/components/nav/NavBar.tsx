'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ThemeToggle} from './ThemeToggle';

const links = [
  {href: '/', label: 'Dashboard', exact: true},
  {href: '/recipes', label: 'Recipes', exact: true},
  {href: '/recipes/editor', label: 'Editor', exact: false},
  {href: '/planner', label: 'Planner', exact: false},
  {href: '/shopping', label: 'Shopping', exact: false},
  {href: '/settings', label: 'Settings', exact: false},
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-accent shrink-0">
          Classy Kitchen
        </Link>
        <div className="flex gap-1 overflow-x-auto flex-1">
          {links.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-foreground hover:bg-border'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <ThemeToggle />
      </div>
    </nav>
  );
}
