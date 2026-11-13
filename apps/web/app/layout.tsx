import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'FoodTrack' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
