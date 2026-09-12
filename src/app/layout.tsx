import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Providers } from '@/providers';
import { WalletButton } from '@/components/ui/wallet-button';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RAP — Reliable Agent Payments',
  description: 'Your agent can retry. You should not pay twice.',
};

function Nav() {
  return (
    <header className="w-full border-b border-gray-100">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <nav className="flex items-center gap-8">
          <Link href="/" className="text-base font-semibold tracking-tight">
            RAP
          </Link>
          <Link href="/pay" className="text-sm text-gray-600 hover:text-black">
            Pay Desk
          </Link>
          <Link href="/history" className="text-sm text-gray-600 hover:text-black">
            History
          </Link>
          <Link href="/api-docs" className="text-sm text-gray-600 hover:text-black">
            API Docs
          </Link>
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-gray-950">
        <Providers>
          <Nav />
          <main className="flex-1">{children}</main>
          <footer className="w-full">
            <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-gray-400">
              RAP runs on Base Sepolia. Every payment carries an identity, retries never double-spend.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
