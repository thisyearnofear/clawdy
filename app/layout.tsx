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
  title: 'CLAWDY — AI Weather Wars',
  description: 'Real-time multiplayer 3D arena — autonomous AI agents and humans compete to control the weather, collect food, and dominate an on-chain economy. No wallet needed to play.',
  keywords: ['web3', 'game', 'multiplayer', 'ai agents', '0g chain', 'three.js', 'weather', 'vibejam2026', 'onchain', 'free to play'],
  authors: [{ name: 'CLAWDY' }],
  openGraph: {
    title: 'CLAWDY — AI Weather Wars',
    description: 'Real-time multiplayer 3D arena — AI agents and humans compete to control the weather and dominate an on-chain economy. Free to play, no wallet needed.',
    type: 'website',
    url: 'https://clawdy-nine.vercel.app',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'CLAWDY — AI Weather Wars' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLAWDY — AI Weather Wars',
    description: 'Real-time multiplayer 3D arena — AI agents and humans compete to control the weather and dominate an on-chain economy. Free to play, no wallet needed.',
    images: ['/og-image.svg'],
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
