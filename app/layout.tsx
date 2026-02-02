import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from './providers'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'CLAWDY, with a chance of meatballs',
  description: 'An agentic 3D sandbox experience on Base L2. Control weather, deploy vehicles, and compete in a decentralized world.',
  keywords: ['web3', 'game', 'sandbox', 'base', 'ethereum', '3d', 'agents', 'defi'],
  authors: [{ name: 'CLAWDY' }],
  openGraph: {
    title: 'CLAWDY, with a chance of meatballs',
    description: 'An agentic 3D sandbox experience on Base L2',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLAWDY, with a chance of meatballs',
    description: 'An agentic 3D sandbox experience on Base L2',
  },
  icons: {
    icon: { url: '/favicon.svg', type: 'image/svg+xml' },
    shortcut: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0ea5e9',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
