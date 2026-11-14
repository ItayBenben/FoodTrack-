import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'FoodTrack',
  description: 'Log food, gut and how you feel in under a minute a day — and find out what is behind your bad days.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FoodTrack', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#FBFAF8' }, { media: '(prefers-color-scheme: dark)', color: '#14130F' }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="bg-bg text-text font-sans text-body antialiased min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
