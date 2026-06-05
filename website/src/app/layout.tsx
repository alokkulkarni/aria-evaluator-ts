import type { Metadata } from 'next'
import { Geist, Inter } from 'next/font/google'

import { SessionProvider } from '@/components/auth/SessionProvider'
import { AppShell } from '@/components/shared/AppShell'

import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'ARIA Evaluator',
  description: 'Enterprise AI safety evaluation, observability, and global deployment workflows for modern teams.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${inter.variable} font-geist text-slate-800`}>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  )
}
