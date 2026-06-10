'use client'

import { Github } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { FormEvent, useState } from 'react'

import { AriaLogo } from '@/components/shared/AriaLogo'
import { hashPasswordForTransit } from '@/lib/crypto'

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return') ?? '/api/launch-instance'
  const authError = searchParams.get('error')
  const authProvider = searchParams.get('provider')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const providerLabel = authProvider === 'google'
    ? 'Google'
    : authProvider === 'github'
      ? 'GitHub'
      : authProvider === 'email'
        ? 'email and password'
        : 'your original provider'

  const queryErrorMessage = authError === 'email_provider_mismatch'
    ? `An account with this email already exists. Sign in with ${providerLabel}.`
    : authError === 'missing_social_email'
      ? `Your ${providerLabel} account did not provide an email address. Use email/password or another ${providerLabel} account.`
      : authError === 'social_signin_failed'
        ? `We couldn't complete ${providerLabel} sign-in. Please try again.`
        : null

  const handleSocialSignIn = async (provider: 'google' | 'github') => {
    setError(null)
    setLoadingProvider(provider)
    await signIn(provider, { callbackUrl: returnTo })
    setLoadingProvider(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const hashedPassword = await hashPasswordForTransit(password)
    const result = await signIn('credentials', {
      email,
      password: hashedPassword,
      redirect: false,
      callbackUrl: returnTo,
    })

    setSubmitting(false)

    if (result?.error) {
      setError('Sign-in failed. Check your email and password, or use Google or GitHub.')
      return
    }

    if (result?.url) {
      router.push(result.url)
    }
  }

  return (
    <div className="card mx-auto mt-16 max-w-md space-y-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex w-fit items-center gap-3">
          <AriaLogo />
          <span className="text-sm font-bold text-slate-900">ARIA Evaluator</span>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in to ARIA</h1>
          <p className="text-sm text-slate-500">Access your secure AI evaluation workspace.</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => handleSocialSignIn('google')}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          disabled={loadingProvider !== null}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9l3 2.3c1.7-1.6 2.8-3.9 2.8-6.8 0-.6-.1-1.3-.2-1.8H12Z" />
            <path fill="#34A853" d="M12 21c2.6 0 4.8-.9 6.4-2.4l-3-2.3c-.8.6-2 1-3.4 1-2.6 0-4.7-1.8-5.5-4.1l-3.1 2.4C5 18.9 8.2 21 12 21Z" />
            <path fill="#4A90E2" d="M6.5 13.2c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8l-3.1-2.4C2.5 8.7 2 10.3 2 12s.5 3.3 1.4 4.8l3.1-2.4Z" />
            <path fill="#FBBC05" d="M12 6.7c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.8 3.8 14.6 3 12 3 8.2 3 5 5.1 3.4 8.2l3.1 2.4C7.3 8.4 9.4 6.7 12 6.7Z" />
          </svg>
          {loadingProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <button
          type="button"
          onClick={() => handleSocialSignIn('github')}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          disabled={loadingProvider !== null}
        >
          <Github className="h-5 w-5" />
          {loadingProvider === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
        </button>

        <button
          type="button"
          disabled
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white opacity-80"
        >
          <span className="text-base"></span>
          <span>Continue with Apple</span>
          <span className="badge-info">Coming soon</span>
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-[0.2em] text-slate-400">
          <span className="bg-white px-3">or continue with email</span>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Link href="mailto:support@ariaeval.io?subject=Password%20reset%20help" className="text-xs font-medium text-blue-700 hover:text-blue-800">
              Forgot password?
            </Link>
          </div>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
        </div>

        {(error || queryErrorMessage) ? <p className="badge-fail w-full justify-center py-2 text-center">{error ?? queryErrorMessage}</p> : null}

        <button type="submit" className="btn-primary w-full justify-center rounded-xl py-3" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="font-semibold text-blue-700 hover:text-blue-800">
          Get started →
        </Link>
      </p>
    </div>
  )
}
