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
  metadataBase: new URL('https://clawdy-nine.vercel.app'),
  title: 'CLAWDY — Play Inside a Marble-Generated World',
  description: 'Race autonomous AI agents through a World Labs Marble-generated 3D arena rendered with Spark. Drive, collect, and outsmart four AI opponents in real time.',
  keywords: ['world labs', 'marble', 'spark', 'gaussian splatting', 'ai agents', 'web3', 'game', 'three.js', '3d', 'hackathon'],
  authors: [{ name: 'CLAWDY' }],
  openGraph: {
    title: 'CLAWDY — Play Inside a Marble-Generated World',
    description: 'Race autonomous AI agents through a Marble-generated 3D arena. The world is AI-generated, physically playable, and the opponents are real.',
    type: 'website',
    url: 'https://clawdy-nine.vercel.app',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'CLAWDY — Play Inside a Marble-Generated World' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLAWDY — Play Inside a Marble-Generated World',
    description: 'Race autonomous AI agents through a Marble-generated 3D arena. The world is AI-generated, physically playable, and the opponents are real.',
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
        <Script async src="https://vibej.am/2026/widget.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
