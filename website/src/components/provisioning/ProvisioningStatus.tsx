'use client'

import { useEffect, useRef, useState } from 'react'

// Visual stages, mapped from CodeBuild's `currentPhase` field. Anything not
// mapped here (or when the build hasn't started yet) falls back to the time
// based animation, capped to one step before "complete" so we never show
// "ready" until the server confirms it.
const STEPS: Array<{ id: string; label: string; detail: string; phases: string[] }> = [
  { id: 'queued',   label: 'Build queued',           detail: 'CodeBuild job accepted',           phases: ['QUEUED', 'SUBMITTED'] },
  { id: 'fetch',    label: 'Fetching source',        detail: 'Cloning repo and downloading deps', phases: ['DOWNLOAD_SOURCE', 'INSTALL'] },
  { id: 'network',  label: 'Network infrastructure', detail: 'VPC, subnets, security groups',    phases: ['PRE_BUILD'] },
  { id: 'compute',  label: 'Compute & storage',      detail: 'ECS cluster, EFS, S3',             phases: ['BUILD'] },
  { id: 'app',      label: 'Application deployment', detail: 'Container image, load balancer',   phases: ['POST_BUILD', 'UPLOAD_ARTIFACTS', 'FINALIZING'] },
  { id: 'complete', label: 'Workspace ready',        detail: 'Health checks passing',            phases: ['COMPLETED'] },
]

const TIME_PER_STEP_MS = 90_000

// CodeBuild build statuses that mean "this build is no longer running".
const TERMINAL_BUILD_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'])
const FAILURE_BUILD_STATUSES = new Set(['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'])

export interface ProvisioningSnapshot {
  status: 'provisioning' | 'running' | 'error' | string
  phase: string
  instanceUrl: string | null
  build: {
    id: string
    phase: string | null
    status: string | null
    startedAt: string | null
    endTime: string | null
  } | null
  updatedAt?: string
}

interface Props {
  accessToken?: string
  pollIntervalMs?: number
  onComplete: (instanceUrl: string | null) => void
  onError?: (message: string) => void
}

type StageState =
  | { kind: 'pending'; activeIdx: number }
  | { kind: 'failed'; activeIdx: number; reason: string }
  | { kind: 'done' }

function deriveStage(snapshot: ProvisioningSnapshot | null, fallbackIdx: number): StageState {
  if (!snapshot) {
    return { kind: 'pending', activeIdx: fallbackIdx }
  }

  // Tenant-level outcomes win over build details.
  if (snapshot.status === 'running') return { kind: 'done' }
  if (snapshot.status === 'error') {
    return {
      kind: 'failed',
      activeIdx: phaseToStepIdx(snapshot.build?.phase, fallbackIdx),
      reason: 'Provisioning failed. See details below.',
    }
  }

  // Live build status — when CodeBuild itself reports terminal failure we
  // surface it immediately, even if the control-plane hasn't flipped the
  // tenant.status yet.
  const buildStatus = snapshot.build?.status
  if (buildStatus && FAILURE_BUILD_STATUSES.has(buildStatus)) {
    return {
      kind: 'failed',
      activeIdx: phaseToStepIdx(snapshot.build?.phase, fallbackIdx),
      reason: failureReasonFor(buildStatus),
    }
  }
  if (buildStatus === 'SUCCEEDED') {
    return { kind: 'done' }
  }

  // Still running. Prefer the live CodeBuild phase; only use the time-based
  // fallback when the build object hasn't surfaced a phase yet.
  return { kind: 'pending', activeIdx: phaseToStepIdx(snapshot.build?.phase, fallbackIdx) }
}

function phaseToStepIdx(phase: string | null | undefined, fallback: number): number {
  if (!phase) return fallback
  const idx = STEPS.findIndex((step) => step.phases.includes(phase))
  return idx >= 0 ? idx : fallback
}

function failureReasonFor(buildStatus: string): string {
  switch (buildStatus) {
    case 'FAILED':    return 'CodeBuild reported the build failed. Check the build logs for details.'
    case 'FAULT':     return 'CodeBuild encountered an internal fault. Retry — if it persists, contact support.'
    case 'TIMED_OUT': return 'The build exceeded its time limit. This usually means a deployment step hung.'
    case 'STOPPED':   return 'The build was stopped before it finished. Restart to try again.'
    default:          return `Provisioning ended with status ${buildStatus}.`
  }
}

export function ProvisioningStatus({ accessToken, pollIntervalMs = 5_000, onComplete, onError }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const [fallbackIdx, setFallbackIdx] = useState(0)
  const [snapshot, setSnapshot] = useState<ProvisioningSnapshot | null>(null)
  const [terminal, setTerminal] = useState(false)
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Elapsed timer runs only while the build is in flight.
  useEffect(() => {
    if (terminal) return
    elapsedTimer.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => { if (elapsedTimer.current) clearInterval(elapsedTimer.current) }
  }, [terminal])

  // Time-based fallback step advance — only used when the snapshot has no
  // CodeBuild phase to drive the active step. Capped so we never advance to
  // "complete" without server confirmation.
  useEffect(() => {
    if (terminal) return
    fallbackTimer.current = setInterval(() => {
      setFallbackIdx((current) => Math.min(current + 1, STEPS.length - 2))
    }, TIME_PER_STEP_MS)
    return () => { if (fallbackTimer.current) clearInterval(fallbackTimer.current) }
  }, [terminal])

  useEffect(() => {
    if (!accessToken) return

    let cancelled = false
    const tick = async () => {
      if (cancelled || terminal) return
      try {
        const res = await fetch('/api/control-plane/tenant/provision/status', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json() as ProvisioningSnapshot
        if (cancelled) return
        setSnapshot(data)

        const stage = deriveStage(data, fallbackIdx)
        if (stage.kind === 'done') {
          setTerminal(true)
          if (pollTimer.current) clearInterval(pollTimer.current)
          setTimeout(() => onComplete(data.instanceUrl), 1200)
        } else if (stage.kind === 'failed') {
          setTerminal(true)
          if (pollTimer.current) clearInterval(pollTimer.current)
          onError?.(stage.reason)
        }
      } catch {
        // Network blip — keep polling.
      }
    }

    tick()
    pollTimer.current = setInterval(tick, pollIntervalMs)
    return () => {
      cancelled = true
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
    // Intentionally NOT including fallbackIdx — we don't want a re-poll on
    // every timer tick. The next tick will pick up the latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, pollIntervalMs, onComplete, onError, terminal])

  const stage = deriveStage(snapshot, fallbackIdx)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  // For rendering, fix the active step index for the failed case so the
  // CURRENT (failed) step is highlighted in amber, and any earlier steps
  // remain green.
  let activeIdx = STEPS.length - 1
  let failedIdx: number | null = null
  if (stage.kind === 'pending') {
    activeIdx = stage.activeIdx
  } else if (stage.kind === 'failed') {
    activeIdx = stage.activeIdx
    failedIdx = stage.activeIdx
  } else {
    activeIdx = STEPS.length - 1
  }

  const liveBuildLabel = snapshot?.build?.phase ?? null
  const liveBuildStatus = snapshot?.build?.status ?? null

  const isFailed = stage.kind === 'failed'

  return (
    <section className="card space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className={`section-label ${isFailed ? 'text-rose-600' : ''}`}>
            {isFailed ? 'Provisioning failed' : 'Provisioning in progress'}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            {isFailed ? 'Build did not complete' : 'Building your workspace'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isFailed
              ? 'CodeBuild reported a failure. You can restart the build from the panel below.'
              : 'This typically takes 8–12 minutes. You can safely leave this page — we’ll redirect you when it’s ready.'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{terminal ? 'Stopped' : 'Elapsed'}</p>
          <p className="font-mono text-sm font-semibold text-slate-700">{timeStr}</p>
        </div>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, i) => {
          const done = !isFailed && i < activeIdx
          const failedHere = isFailed && failedIdx !== null && i === failedIdx
          const active = !isFailed && i === activeIdx
          const isFinalReady = i === STEPS.length - 1 && stage.kind === 'done'
          const greenDone = done || isFinalReady
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                failedHere
                  ? 'bg-rose-50'
                  : greenDone
                    ? 'bg-green-50'
                    : active
                      ? 'bg-blue-50'
                      : 'bg-slate-50'
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
                  {active && liveBuildLabel ? `${step.detail} — ${liveBuildLabel}` : step.detail}
                </p>
              </div>
              {failedHere && liveBuildStatus ? (
                <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700">
                  {liveBuildStatus}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      {snapshot?.build?.id ? (
        <p className="text-[10px] text-slate-400">
          Build ID: <span className="font-mono">{snapshot.build.id}</span>
        </p>
      ) : null}
    </section>
  )
}
