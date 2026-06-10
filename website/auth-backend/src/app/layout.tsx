import { Inter } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-geist text-slate-800`}>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
