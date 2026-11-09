import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '../components/Shell.tsx';
import './globals.css';

export const metadata: Metadata = { title: 'RadHires role intelligence', description: 'Keep recruiters current with what the client needs, with every AI step checked and traced.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
