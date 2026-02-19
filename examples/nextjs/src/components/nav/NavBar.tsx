'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

const links = [
  {href: '/', label: 'Dashboard'},
  {href: '/recipes', label: 'Recipes'},
  {href: '/recipes/editor', label: 'Editor'},
  {href: '/planner', label: 'Planner'},
  {href: '/shopping', label: 'Shopping'},
  {href: '/settings', label: 'Settings'},
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-accent shrink-0">
          Classy Kitchen
        </Link>
        <div className="flex gap-1 overflow-x-auto">
          {links.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
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
      </div>
    </nav>
  );
}
