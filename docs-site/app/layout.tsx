import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import './global.css';
import { Inter } from 'next/font/google';
import { appName } from '@/lib/shared';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: `${appName} — Class-based reactive state management`,
    template: `%s | ${appName}`,
  },
  description:
    'Class-based reactive state management for React, Vue, Svelte, Solid, and Angular. Write plain TypeScript classes — get fine-grained reactivity, immutable snapshots, and zero-boilerplate hooks.',
  metadataBase: new URL('https://codebelt.github.io/classy-store'),
  icons: {
    icon: {
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%236366f1'/%3E%3Cstop offset='1' stop-color='%23d946ef'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='7' fill='url(%23g)'/%3E%3Cpath d='M16 7 25 12 16 17 7 12Z' fill='white'/%3E%3C/svg%3E",
      type: 'image/svg+xml',
    },
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
