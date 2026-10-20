import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#090d16',
};

export const metadata: Metadata = {
  title: 'Pasta Loft | Fantasy Football Trade Matchmaker',
  description: 'Trade matchmaking for fantasy football managers with Pasta Loft. Sync your ESPN league, shop your players, and match with league mates.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-[100dvh] bg-gradient-to-b from-slate-950 via-[#0B0F19] to-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
