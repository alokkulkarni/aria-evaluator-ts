'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

import { DashboardNav } from '@/components/dashboard/DashboardNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status === 'unauthenticated') {
    router.replace('/sign-in')
    return null
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-400">Loading workspace…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <DashboardNav user={session?.user ?? undefined} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
