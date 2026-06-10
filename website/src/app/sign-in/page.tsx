import { Suspense } from 'react'
import { SignInForm } from '@/components/auth/SignInForm'

export default function SignInPage() {
  return (
    <div className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="space-y-3 text-center">
          <p className="section-label">Secure access</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Access your ARIA workspace</h1>
          <p className="text-sm text-slate-600">Sign in with Google, Apple, or your email and password.</p>
        </div>
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Loading…</div>}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
