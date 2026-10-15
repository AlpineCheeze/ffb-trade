import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trade Horny | Fantasy Football Trade Matchmaker',
  description: 'Grindr for the gridiron. Trade matchmaking for fantasy football managers with Trade Horny. Sync your ESPN league, shop your players, and match with league mates.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0B0F19] to-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
