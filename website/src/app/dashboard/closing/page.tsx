'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { apiFetch } from '@/lib/api'

// Visual stages for the destroy build, mapped from CodeBuild's currentPhase.
const STEPS: Array<{ id: string; label: string; detail: string; phases: string[] }> = [
  { id: 'queued',     label: 'Teardown queued',             detail: 'CodeBuild job accepted',                phases: ['SUBMITTED', 'QUEUED'] },
  { id: 'init',       label: 'Loading state',                detail: 'terraform init',                        phases: ['DOWNLOAD_SOURCE', 'INSTALL', 'PRE_BUILD'] },
  { id: 'destroying', label: 'Destroying infrastructure',    detail: 'terraform destroy',                     phases: ['BUILD'] },
  { id: 'cleanup',    label: 'Cleaning up state',            detail: 'Removing user, sessions, tenant data',  phases: ['POST_BUILD', 'UPLOAD_ARTIFACTS', 'FINALIZING'] },
  { id: 'done',       label: 'Account closed',               detail: 'Confirmation email sent',               phases: ['COMPLETED', 'completed'] },
]

interface ClosingSnapshot {
  status: string
  phase: string
  buildPhase: string | null
  buildStatus?: string | null
  failedPhase?: string | null
  failedPhaseMessage?: string | null
  buildId?: string | null
  startedAt?: string | null
  message?: string
}

function phaseToStepIdx(phase: string | null | undefined, fallback: number): number {
  if (!phase) return fallback
  const idx = STEPS.findIndex((step) => step.phases.includes(phase))
  return idx >= 0 ? idx : fallback
}

export default function ClosingAccountPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const accessToken = session?.user?.accessToken
  const [snapshot, setSnapshot] = useState<ClosingSnapshot | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [fallbackIdx, setFallbackIdx] = useState(0)
  const [finalised, setFinalised] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const tearDown = useCallback(() => {
    if (elapsedTimer.current) clearInterval(elapsedTimer.current)
    if (fallbackTimer.current) clearInterval(fallbackTimer.current)
    if (pollTimer.current) clearInterval(pollTimer.current)
  }, [])

  // Elapsed clock + fallback step advancement (every 60s).
  useEffect(() => {
    if (finalised || errorMessage) return
    elapsedTimer.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    fallbackTimer.current = setInterval(() => {
      setFallbackIdx((c) => Math.min(c + 1, STEPS.length - 2))
    }, 60_000)
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current)
      if (fallbackTimer.current) clearInterval(fallbackTimer.current)
    }
  }, [finalised, errorMessage])

  // Polling loop.
  useEffect(() => {
    if (!accessToken || finalised || errorMessage) return
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      try {
        const data = await apiFetch<ClosingSnapshot>('/account/delete/status', { authToken: accessToken })
        if (cancelled) return
        setSnapshot(data)

        if (data.status === 'completed') {
          setFinalised(true)
          tearDown()
          // Sign the user out and bounce home after a brief pause so they
          // can see the "Account closed" screen.
          setTimeout(() => { signOut({ callbackUrl: '/' }) }, 2000)
          return
        }
        if (data.status === 'error') {
          tearDown()
          setErrorMessage(
            data.failedPhaseMessage ??
            'Workspace teardown failed. Please contact support to complete the deletion.',
          )
          return
        }
      } catch {
        // Network blip — ignore and retry next tick.
      }
    }

    tick()
    pollTimer.current = setInterval(tick, 5_000)
    return () => {
      cancelled = true
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [accessToken, finalised, errorMessage, tearDown])

  // Bounce unauthenticated visitors to sign-in.
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.replace('/sign-in')
  }, [sessionStatus, router])

  const liveBuildPhase = snapshot?.buildPhase ?? null
  const activeIdx = finalised
    ? STEPS.length - 1
    : phaseToStepIdx(liveBuildPhase, fallbackIdx)

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero mb-8">
        <div className="space-y-3">
          <p className="page-hero-label">
            {finalised ? 'Account closed' : errorMessage ? 'Teardown interrupted' : 'Closing account'}
          </p>
          <h1 className="page-hero-title">
            {finalised
              ? 'Your account has been closed'
              : errorMessage
                ? 'We couldn’t finish closing your account'
                : 'Closing your account'}
          </h1>
          <p className="page-hero-sub">
            {finalised
              ? 'Your workspace has been destroyed and a confirmation email has been sent. We’re signing you out now.'
              : errorMessage
                ? 'Some workspace resources couldn’t be deleted automatically. Our team has been notified — contact support if you need this resolved manually.'
                : 'We’re destroying your workspace infrastructure and removing your data. You can safely leave this page — your account will be fully closed when the teardown completes.'}
          </p>
        </div>
      </section>

      <section className="card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className={`section-label ${errorMessage ? 'text-rose-600' : ''}`}>
              {finalised ? 'Completed' : errorMessage ? 'Failed' : 'Teardown in progress'}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              {finalised ? 'All resources removed' : errorMessage ? 'Manual cleanup required' : 'Destroying workspace'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {finalised
                ? 'You will be signed out automatically.'
                : errorMessage
                  ? 'Email support@ariaeval.io with the build ID below — we will finish the cleanup for you.'
                  : 'This typically takes 4–8 minutes depending on what’s deployed.'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{finalised ? 'Done' : errorMessage ? 'Stopped' : 'Elapsed'}</p>
            <p className="font-mono text-sm font-semibold text-slate-700">{timeStr}</p>
          </div>
        </div>

        <div className="space-y-2">
          {STEPS.map((step, i) => {
            const done = !errorMessage && i < activeIdx
            const active = !finalised && !errorMessage && i === activeIdx
            const failedHere = !!errorMessage && i === activeIdx
            const finalDone = i === STEPS.length - 1 && finalised
            const greenDone = done || finalDone
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                  failedHere ? 'bg-rose-50' : greenDone ? 'bg-green-50' : active ? 'bg-blue-50' : 'bg-slate-50'
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    failedHere
                      ? 'bg-rose-500 text-white'
                      : greenDone
                        ? 'bg-green-500 text-white'
                        : active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {failedHere ? '!' : greenDone ? '✓' : active ? (
                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : String(i + 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${
                      failedHere
                        ? 'text-rose-700'
                        : greenDone
                          ? 'text-green-700'
                          : active
                            ? 'text-blue-700'
                            : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p
                    className={`text-xs ${
                      failedHere
                        ? 'text-rose-600'
                        : greenDone
                          ? 'text-green-600'
                          : active
                            ? 'text-blue-500'
                            : 'text-slate-400'
                    }`}
                  >
                    {active && liveBuildPhase ? `${step.detail} — ${liveBuildPhase}` : step.detail}
                  </p>
                </div>
                {failedHere && snapshot?.buildStatus ? (
                  <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700">
                    {snapshot.buildStatus}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        {snapshot?.buildId ? (
          <p className="text-[10px] text-slate-400">
            Build ID: <span className="font-mono">{snapshot.buildId}</span>
          </p>
        ) : null}
      </section>

      {errorMessage ? (
        <div className="card mt-6 border border-red-200 bg-red-50">
          <h2 className="text-base font-semibold text-red-700">Manual cleanup required</h2>
          <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-secondary rounded-xl">
              Back to dashboard
            </Link>
            <a href="mailto:support@ariaeval.io" className="btn-primary rounded-xl">
              Contact support
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
