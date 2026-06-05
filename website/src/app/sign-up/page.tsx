import { Suspense } from 'react'
import { SignUpWizard } from '@/components/auth/SignUpWizard'

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Loading…</div>}>
      <SignUpWizard />
    </Suspense>
  )
}
