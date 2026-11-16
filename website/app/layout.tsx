import type {Metadata} from 'next';
import {Provider} from '@/components/provider';
import {siteUrl} from '@/lib/shared';
import './global.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Classy Store',
    template: '%s | Classy Store',
  },
  description:
    'Class-based reactive state management for React, Vue, Svelte, Solid, and Angular.',
};

export default function Layout({children}: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className="flex min-h-screen flex-col font-sans">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
