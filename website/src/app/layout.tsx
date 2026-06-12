import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'

import { SessionProvider } from '@/components/auth/SessionProvider'
import { AppShell } from '@/components/shared/AppShell'

import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'ARIA Evaluator',
  description: 'Enterprise AI safety evaluation, observability, and global deployment workflows for modern teams.',
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
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  )
}
