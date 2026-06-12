'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ProvisioningStatus } from '@/components/provisioning/ProvisioningStatus'
import { ApiError, apiFetch, createSSOToken, reprovisionTenant } from '@/lib/api'

// Show a "Build looks stuck?" hint after this long. 15 min covers the
// upper end of a healthy build (8-12 min); beyond that we let the user
// trigger a manual retry instead of staring at the spinner.
const STUCK_THRESHOLD_SECONDS = 15 * 60

export default function ProvisioningPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [stuck, setStuck] = useState(false)
  // Bumped on successful retry so the ProvisioningStatus component remounts
  // (resets its elapsed timer, step index, completion latch).
  const [retryKey, setRetryKey] = useState(0)
  const accessToken = session?.user?.accessToken

  // Surface the stuck-hint after the threshold.
  useEffect(() => {
    setStuck(false)
    const id = setTimeout(() => setStuck(true), STUCK_THRESHOLD_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [retryKey])

  const handleRetry = useCallback(async () => {
    if (!accessToken) return
    setRetrying(true)
    try {
      await reprovisionTenant(accessToken)
      setErrorMessage(null)
      setRetryKey((k) => k + 1)
    } catch (err) {
      const message = err instanceof ApiError
        ? `Retry failed (${err.status}). ${err.message.slice(0, 240)}`
        : err instanceof Error ? err.message : 'Retry failed.'
      setErrorMessage(message)
    } finally {
      setRetrying(false)
    }
  }, [accessToken])

  const handleComplete = useCallback(async (instanceUrl: string | null) => {
    setRedirecting(true)
    try {
      if (accessToken) {
        const launch = await createSSOToken(accessToken)
        const target = launch.ssoUrl ?? launch.instanceUrl ?? instanceUrl
        if (target) {
          window.location.assign(target)
          return
        }
      }
      if (instanceUrl) {
        window.location.assign(instanceUrl)
        return
      }
      router.push('/dashboard')
    } catch {
      // SSO failed but the workspace itself is ready — fall back to dashboard.
      router.push('/dashboard')
    }
  }, [accessToken, router])

  // If the user lands here without an authenticated session, bounce them.
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/sign-in?redirect=/sign-up/provisioning')
    }
  }, [sessionStatus, router])

  // Optimistic check — if the user already has a running tenant when they
  // arrive (refreshed mid-flight after success), redirect immediately.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    apiFetch<{ status: string; instanceUrl?: string | null }>('/tenant/provision/status', { authToken: accessToken })
      .then((data) => {
        if (cancelled) return
        if (data.status === 'running') handleComplete(data.instanceUrl ?? null)
      })
      .catch(() => { /* ignore — the polling component will handle it */ })
    return () => { cancelled = true }
  }, [accessToken, handleComplete])

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero mb-8">
        <div className="space-y-3">
          <p className="page-hero-label">Workspace provisioning</p>
          <h1 className="page-hero-title">We&apos;re building your workspace</h1>
          <p className="page-hero-sub">
            Sit tight — we&apos;re creating dedicated infrastructure in your region. You&apos;ll be redirected automatically when it&apos;s ready.
          </p>
        </div>
      </section>

      {sessionStatus === 'loading' ? (
        <div className="card text-sm text-slate-500">Loading your session…</div>
      ) : !accessToken ? (
        <div className="card space-y-3">
          <p className="text-sm text-slate-600">
            We need an authenticated session to track provisioning. Redirecting you to sign in…
          </p>
        </div>
      ) : (
        <ProvisioningStatus
          key={retryKey}
          accessToken={accessToken}
          onComplete={handleComplete}
          onError={(message) => setErrorMessage(message)}
        />
      )}

      {stuck && !errorMessage && !redirecting && (
        <div className="card mt-4 border border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">Taking longer than expected?</p>
          <p className="mt-1 text-xs text-amber-700">
            Healthy provisioning usually finishes within 12 minutes. If you suspect the build is stuck, you can restart it. Existing infrastructure will be reused — no data loss.
          </p>
          <button
            type="button"
            className="mt-3 btn-secondary rounded-xl text-sm"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? 'Restarting…' : 'Restart provisioning'}
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="card mt-6 border border-red-200 bg-red-50">
          <h2 className="text-base font-semibold text-red-700">Provisioning failed</h2>
          <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary rounded-xl"
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? 'Restarting provisioning…' : 'Retry provisioning'}
            </button>
            <Link href="/dashboard" className="btn-secondary rounded-xl">
              Go to dashboard
            </Link>
            <a href="mailto:support@ariaeval.io" className="btn-secondary rounded-xl">
              Contact support
            </a>
          </div>
        </div>
      )}

      {redirecting && !errorMessage && (
        <p className="mt-4 text-center text-xs text-slate-400">Redirecting to your workspace…</p>
      )}
    </div>
  )
}
