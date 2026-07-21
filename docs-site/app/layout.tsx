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
