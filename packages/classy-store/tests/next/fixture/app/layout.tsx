import type {ReactNode} from 'react';
import {Navigation} from '../components/shared/navigation/Navigation';

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
