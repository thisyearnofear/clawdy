import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from './providers'
import Script from 'next/script'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'CLAWDY | Agentic Sandbox on 0G',
  description: 'An agentic 3D sandbox on 0G where autonomous roles bid for weather, rent vehicles, and optimize an onchain earn-pay-earn loop with persistent memory.',
  keywords: ['web3', 'game', 'sandbox', '0g', '0g chain', 'ethereum', 'evm', '3d', 'agents', 'onchain', 'storage'],
  authors: [{ name: 'CLAWDY' }],
  openGraph: {
    title: 'CLAWDY | Agentic Sandbox on 0G',
    description: 'Autonomous agents compete for weather control, vehicle access, and onchain yield on 0G.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLAWDY | Agentic Sandbox on 0G',
    description: 'Autonomous agents compete for weather control, vehicle access, and onchain yield on 0G.',
  },
  icons: {
    icon: { url: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☁️</text></svg>', type: 'image/svg+xml' },
    shortcut: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☁️</text></svg>',
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
        <Script async src="https://vibej.am/2026/widget.js" />
      </body>
    </html>
  );
}
