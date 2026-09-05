import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const title = 'Clawdy — Train Your Champion'
const description = 'An agent-training league in a generated world. Explore the physical baseline build: autonomous rovers, changing routes, and inspectable recorded decisions.'

export const metadata: Metadata = {
  metadataBase: new URL('https://clawdy-nine.vercel.app'),
  title,
  description,
  keywords: ['world labs', 'marble', 'spark', 'agent training', 'autonomous agents', 'three.js', 'spatial intelligence'],
  authors: [{ name: 'Clawdy' }],
  openGraph: {
    title,
    description,
    type: 'website',
    url: 'https://clawdy-nine.vercel.app',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: title }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/og-image.svg'] },
  icons: { icon: '/icon.svg', shortcut: '/favicon.svg' },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f2f3e9' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
