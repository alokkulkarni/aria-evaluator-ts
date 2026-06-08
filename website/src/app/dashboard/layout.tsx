'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    router.replace('/api/launch-instance')
  }, [router])

  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-slate-400">Redirecting to your workspace…</p>
    </div>
  )
}
