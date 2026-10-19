import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from '@/lib/session/session-store';

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
  title: 'Fabrik',
  description: 'Panel de producción, stock y trazabilidad.',
};

/**
 * Layout raíz mínimo (docs/arquitectura.md §App shell client-rendered):
 * fuentes, `lang="es"`, metadata y los providers de cliente (`SessionProvider`
 * lee `sessionStorage`; `Toaster` para los avisos). El shell con sidebar vive en
 * `(app)/layout.tsx`.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
