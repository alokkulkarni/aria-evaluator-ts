'use client'

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'

export default function SignOutPage() {
  useEffect(() => {
    void signOut({ callbackUrl: '/' })
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-24 sm:px-6 lg:px-8">
      <div className="card space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Signing out</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Ending your session</h1>
        <p className="text-sm leading-6 text-slate-600">
          We&apos;re returning you to the main website now.
        </p>
      </div>
    </div>
  )
}
