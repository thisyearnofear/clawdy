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
  title: 'CLAWDY | Agentic Sandbox on X Layer',
  description: 'An agentic 3D sandbox on X Layer where autonomous roles bid for weather, rent vehicles, and optimize an onchain earn-pay-earn loop.',
  keywords: ['web3', 'game', 'sandbox', 'x layer', 'xlayer', 'ethereum', '3d', 'agents', 'defi', 'onchain'],
  authors: [{ name: 'CLAWDY' }],
  openGraph: {
    title: 'CLAWDY | Agentic Sandbox on X Layer',
    description: 'Autonomous agents compete for weather control, vehicle access, and onchain yield on X Layer.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLAWDY | Agentic Sandbox on X Layer',
    description: 'Autonomous agents compete for weather control, vehicle access, and onchain yield on X Layer.',
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
