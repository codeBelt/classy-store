'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {shoppingStore} from '@/stores/shopping-store';

const links = [
  {href: '/', label: 'Dashboard', exact: true},
  {href: '/recipes', label: 'Recipes', exact: true},
  {href: '/recipes/editor', label: 'Editor', exact: false},
  {href: '/planner', label: 'Planner', exact: false},
  {href: '/shopping', label: 'Shopping', exact: false},
  {href: '/settings', label: 'Settings', exact: false},
  {href: '/features', label: 'Features', exact: false},
];

export function NavBar() {
  const pathname = usePathname();
  const shoppingSnap = useClassyStore(shoppingStore);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl supports-[backdrop-filter]:bg-black/20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center text-white font-bold shadow-lg shadow-orange-900/20 group-hover:shadow-orange-900/40 transition-shadow">
            CK
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            Classy Kitchen
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  isActive
                    ? 'text-white bg-white/10 shadow-[inner_0_0_10px_rgba(255,255,255,0.05)] border border-white/5'
                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
                {link.label === 'Shopping' && (
                  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                    {shoppingSnap.items.length}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          {/* Mobile menu button could go here */}
        </div>
      </div>
    </nav>
  );
}
