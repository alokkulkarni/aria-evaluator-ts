import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'

import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics'
import { AppShell } from '@/components/shared/AppShell'
import { JsonLd } from '@/components/shared/JsonLd'
import { siteSchemaGraph } from '@/lib/schema'

import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const SITE_DESCRIPTION =
  'Enterprise AI safety evaluation, observability, and global deployment workflows for modern teams.'

export const metadata: Metadata = {
  metadataBase: new URL('https://ariaeval.io'),
  title: 'ARIA Evaluator',
  description: SITE_DESCRIPTION,
  applicationName: 'ARIA Evaluator',
  // Note: no global `alternates.canonical` here — that would canonicalize every
  // route to the homepage. Set canonical per-page (see /blog/[slug] for the pattern).
  openGraph: {
    type: 'website',
    siteName: 'ARIA Evaluator',
    title: 'ARIA Evaluator',
    description: SITE_DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARIA Evaluator',
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${inter.variable} font-sans text-slate-800`}>
        <JsonLd data={siteSchemaGraph} />
        <GoogleAnalytics />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
