'use client'

import { useEffect, useRef, useState } from 'react'

// One coarse stage per phase of the CodeBuild buildspec. The control-plane
// returns CodeBuild's `phase` field — we map it onto a step index. If the
// phase isn't recognised we fall back to a time-based animation (~90s/step).
const STEPS: Array<{ id: string; label: string; detail: string; phases: string[] }> = [
  { id: 'queued',   label: 'Build queued',           detail: 'CodeBuild job accepted',           phases: ['QUEUED', 'SUBMITTED'] },
  { id: 'fetch',    label: 'Fetching source',        detail: 'Cloning repo and downloading deps', phases: ['DOWNLOAD_SOURCE', 'INSTALL'] },
  { id: 'network',  label: 'Network infrastructure', detail: 'VPC, subnets, security groups',    phases: ['PRE_BUILD'] },
  { id: 'compute',  label: 'Compute & storage',      detail: 'ECS cluster, EFS, S3',             phases: ['BUILD'] },
  { id: 'app',      label: 'Application deployment', detail: 'Container image, load balancer',   phases: ['POST_BUILD', 'UPLOAD_ARTIFACTS', 'FINALIZING'] },
  { id: 'complete', label: 'Workspace ready',        detail: 'Health checks passing',            phases: ['COMPLETED'] },
]

const TIME_PER_STEP_MS = 90_000

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

export function ProvisioningStatus({ accessToken, pollIntervalMs = 5_000, onComplete, onError }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)
  const [snapshot, setSnapshot] = useState<ProvisioningSnapshot | null>(null)
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    elapsedTimer.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    fallbackTimer.current = setInterval(() => {
      setStepIdx((current) => Math.min(current + 1, STEPS.length - 2))
    }, TIME_PER_STEP_MS)

    const tick = async () => {
      if (completedRef.current) return
      try {
        const headers: Record<string, string> = {}
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`
        const res = await fetch('/api/control-plane/tenant/provision/status', { headers, cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as ProvisioningSnapshot
        setSnapshot(data)

        const phaseStepIdx = STEPS.findIndex((step) => step.phases.includes(data.build?.phase ?? ''))
        if (phaseStepIdx >= 0) setStepIdx(phaseStepIdx)

        if (data.status === 'running') {
          completedRef.current = true
          setStepIdx(STEPS.length - 1)
          if (pollTimer.current) clearInterval(pollTimer.current)
          if (elapsedTimer.current) clearInterval(elapsedTimer.current)
          if (fallbackTimer.current) clearInterval(fallbackTimer.current)
          setTimeout(() => onComplete(data.instanceUrl), 1200)
        } else if (data.status === 'error') {
          completedRef.current = true
          if (pollTimer.current) clearInterval(pollTimer.current)
          if (elapsedTimer.current) clearInterval(elapsedTimer.current)
          if (fallbackTimer.current) clearInterval(fallbackTimer.current)
          onError?.('Provisioning failed. Please contact support or try again.')
        }
      } catch {
        // Network blip — keep polling.
      }
    }

    if (accessToken) {
      tick()
      pollTimer.current = setInterval(tick, pollIntervalMs)
    }

    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current)
      if (pollTimer.current) clearInterval(pollTimer.current)
      if (fallbackTimer.current) clearInterval(fallbackTimer.current)
    }
  }, [accessToken, pollIntervalMs, onComplete, onError])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  return (
    <section className="card space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">Provisioning in progress</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Building your workspace</h2>
          <p className="mt-1 text-sm text-slate-500">
            This typically takes 8–12 minutes. You can safely leave this page — we&apos;ll redirect you when it&apos;s ready.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Elapsed</p>
          <p className="font-mono text-sm font-semibold text-slate-700">{timeStr}</p>
        </div>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, i) => {
          const done = i < stepIdx
          const active = i === stepIdx
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                done ? 'bg-green-50' : active ? 'bg-blue-50' : 'bg-slate-50'
              }`}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : active ? (
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : String(i + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${done ? 'text-green-700' : active ? 'text-blue-700' : 'text-slate-400'}`}>{step.label}</p>
                <p className={`text-xs ${done ? 'text-green-600' : active ? 'text-blue-500' : 'text-slate-400'}`}>
                  {active && snapshot?.build?.phase ? `${step.detail} — ${snapshot.build.phase}` : step.detail}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
