import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import {NavBar} from '@/components/nav/NavBar';
import {ThemeProvider} from '@/components/nav/ThemeProvider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Classy Kitchen',
  description:
    'Recipe manager & meal planner — powered by @codebelt/classy-store',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider />
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
