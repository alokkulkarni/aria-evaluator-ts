'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { InstanceStatusCard } from '@/components/dashboard/InstanceStatusCard'
import { UsageBar } from '@/components/dashboard/UsageBar'
import { MOCK_NEXT_BILLING } from '@/lib/mock-data'
import { apiFetch } from '@/lib/api'
import { getPlanById } from '@/lib/plans'
import { getRegionById } from '@/lib/regions'
import type { InstanceInfo } from '@/types'

// ── Provisioning progress component ──────────────────────────────────────────
const PROVISION_STEPS = [
  { id: 'queued',    label: 'Build queued',              detail: 'CodeBuild job accepted' },
  { id: 'network',   label: 'Network infrastructure',    detail: 'VPC, subnets, security groups' },
  { id: 'compute',   label: 'Compute & storage',         detail: 'ECS cluster, EFS, S3' },
  { id: 'app',       label: 'Application deployment',    detail: 'Container image, load balancer' },
  { id: 'complete',  label: 'Workspace ready',           detail: 'Health checks passing' },
]

function ProvisioningProgress({
  accessToken,
  onComplete,
}: {
  accessToken?: string
  onComplete: (instanceUrl: string | null) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Elapsed clock
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)

    // Advance visual steps every ~90 s (5 steps over ~7.5 min)
    const stepMs = 90_000
    let idx = 0
    const stepTimer = setInterval(() => {
      idx = Math.min(idx + 1, PROVISION_STEPS.length - 2)
      setStepIdx(idx)
    }, stepMs)

    // Poll status every 15 s
    if (accessToken) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/control-plane/tenant/provision/status', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!res.ok) return
          const data = await res.json() as { status: string; instanceUrl?: string | null }
          if (data.status === 'running') {
            setStepIdx(PROVISION_STEPS.length - 1)
            clearInterval(pollRef.current!)
            clearInterval(timerRef.current!)
            clearInterval(stepTimer)
            setTimeout(() => onComplete(data.instanceUrl ?? null), 1200)
          } else if (data.status === 'error') {
            clearInterval(pollRef.current!)
            clearInterval(timerRef.current!)
            clearInterval(stepTimer)
          }
        } catch { /* keep polling */ }
      }, 15_000)
    }

    return () => {
      clearInterval(timerRef.current!)
      clearInterval(pollRef.current!)
      clearInterval(stepTimer)
    }
  }, [accessToken, onComplete])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  return (
    <section className="card space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">Provisioning in progress</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Building your workspace</h2>
          <p className="mt-1 text-sm text-slate-500">This typically takes 8–12 minutes. You can safely leave this page.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Elapsed</p>
          <p className="font-mono text-sm font-semibold text-slate-700">{timeStr}</p>
        </div>
      </div>

      <div className="space-y-2">
        {PROVISION_STEPS.map((step, i) => {
          const done = i < stepIdx
          const active = i === stepIdx
          return (
            <div key={step.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
              done ? 'bg-green-50' : active ? 'bg-blue-50' : 'bg-slate-50'
            }`}>
              <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {done ? '✓' : active ? (
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : String(i + 1)}
              </span>
              <div className="min-w-0">
                <p className={`font-medium ${done ? 'text-green-700' : active ? 'text-blue-700' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                <p className={`text-xs ${done ? 'text-green-600' : active ? 'text-blue-500' : 'text-slate-400'}`}>
                  {step.detail}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const statusLabel: Record<InstanceInfo['status'], string> = {
  not_provisioned: 'Not provisioned',
  provisioning: 'Provisioning',
  running: 'Active',
  suspending: 'Suspending',
  suspended: 'Suspended',
  error: 'Error',
}

const statusBadge: Record<InstanceInfo['status'], string> = {
  not_provisioned: 'badge-info',
  provisioning: 'badge-pending',
  running: 'badge-active',
  suspending: 'badge-suspended',
  suspended: 'badge-suspended',
  error: 'badge-error',
}

const DEFAULT_INSTANCE: InstanceInfo = {
  status: 'not_provisioned',
  plan: 'individual',
  region: 'eu-west-2',
  usage: { runsThisMonth: 0, maxRuns: 0, scenariosUsed: 0, maxScenarios: 0 },
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [instance, setInstance] = useState<InstanceInfo>(DEFAULT_INSTANCE)
  const [loading, setLoading] = useState(true)
  const [resuming, setResuming] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string | null; email: string; role: string; status: string }>>([])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !session?.user?.accessToken) {
      setLoading(false)
      return
    }

    apiFetch<{
      tenantId: string | null
      status: InstanceInfo['status']
      plan: InstanceInfo['plan'] | null
      region: string | null
      usage: InstanceInfo['usage']
      provisionedAt?: string
      instanceUrl?: string | null
    }>('/tenant/me', { authToken: session.user.accessToken })
      .then((tenant) => {
        if (!tenant.tenantId || !tenant.plan || !tenant.region) {
          setInstance({ ...DEFAULT_INSTANCE, usage: tenant.usage })
        } else {
          setInstance({
            status: tenant.status,
            plan: tenant.plan,
            region: tenant.region,
            provisionedAt: tenant.provisionedAt,
            instanceUrl: tenant.instanceUrl ?? undefined,
            usage: tenant.usage,
          })
        }
      })
      .catch(() => setInstance(DEFAULT_INSTANCE))
      .finally(() => setLoading(false))

    if (session?.user?.accessToken) {
      apiFetch<Array<{ id: string; name: string | null; email: string; role: string; status: string }>>(
        '/tenant/users',
        { authToken: session.user.accessToken }
      ).then(setTeamMembers).catch(() => {})
    }
  }, [session, sessionStatus])

  const handleResume = async () => {
    if (!session?.user?.accessToken) return
    setResuming(true)
    try {
      await apiFetch('/tenant/resume', {
        method: 'POST',
        authToken: session.user.accessToken,
      })
      // Poll until status is 'running' (max 2 minutes)
      const maxAttempts = 24
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        try {
          const tenant = await apiFetch<{ status: string; instanceUrl?: string | null }>(
            '/tenant/me',
            { authToken: session.user.accessToken },
          )
          if (tenant.status === 'running') {
            setInstance((prev) => ({ ...prev, status: 'running', instanceUrl: (tenant.instanceUrl ?? undefined) }))
            break
          }
          setInstance((prev) => ({ ...prev, status: tenant.status as InstanceInfo['status'] }))
        } catch {
          // keep polling
        }
      }
    } catch {
      // resume failed — refresh status
    } finally {
      setResuming(false)
    }
  }

  const handleSuspend = async () => {
    if (!session?.user?.accessToken) return
    setSuspending(true)
    try {
      await apiFetch('/tenant/suspend', {
        method: 'POST',
        authToken: session.user.accessToken,
      })
      setInstance((prev) => ({ ...prev, status: 'suspended' }))
    } catch {
      // ignore
    } finally {
      setSuspending(false)
    }
  }
  const plan = getPlanById(instance.plan)
  const region = getRegionById(instance.region)
  const nextBilling = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(MOCK_NEXT_BILLING))

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-400">Loading workspace…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="page-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="page-hero-label">Workspace overview</p>
            <h1 className="page-hero-title">Your Workspace</h1>
            <p className="page-hero-sub max-w-2xl">
              Monitor your instance, keep tabs on usage, and open ARIA Evaluator with the same polished control plane experience across every region.
            </p>
          </div>
          <span className={statusBadge[instance.status]}>{statusLabel[instance.status]}</span>
        </div>
      </section>

      {instance.status === 'not_provisioned' ? (
        <section className="card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Set up your workspace</h2>
            <p className="mt-2 text-sm text-slate-600">Choose a plan and region to provision your first ARIA instance.</p>
          </div>
          <Link href="/sign-up" className="btn-primary rounded-xl">
            Set up your workspace
          </Link>
        </section>
      ) : null}

      {instance.status === 'provisioning' ? (
        <ProvisioningProgress accessToken={session?.user?.accessToken} onComplete={(url) =>
          setInstance((prev) => ({ ...prev, status: 'running', instanceUrl: url ?? undefined }))
        } />
      ) : null}

      {instance.status === 'suspended' ? (
        <section className="card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Workspace suspended</h2>
            <p className="mt-2 text-sm text-slate-600">Resume your instance to continue running evaluations and observing workloads.</p>
          </div>
          <button
            type="button"
            className="btn-primary rounded-xl"
            onClick={handleResume}
            disabled={resuming}
          >
            {resuming ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Waking up… this takes ~60s
              </span>
            ) : 'Resume workspace'}
          </button>
        </section>
      ) : null}

      <InstanceStatusCard instance={instance} launchHref="/api/launch-instance" />

      {instance.status === 'running' && (
        <section className="card flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900">Suspend workspace</p>
            <p className="mt-1 text-sm text-slate-500">Pause your instance to save costs. All data is preserved. Resume in ~60 seconds.</p>
          </div>
          <button
            type="button"
            className="btn-secondary rounded-xl"
            onClick={handleSuspend}
            disabled={suspending}
          >
            {suspending ? 'Suspending…' : 'Suspend'}
          </button>
        </section>
      )}

      <UsageBar instance={instance} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <p className="metric-card-label">Region</p>
          <p className="metric-card-value">{region ? `${region.flag} ${region.name}` : instance.region}</p>
        </div>
        <div className="metric-card">
          <p className="metric-card-label">Plan</p>
          <p className="metric-card-value">{plan?.name ?? instance.plan}</p>
        </div>
        <div className="metric-card">
          <p className="metric-card-label">Status</p>
          <p className="metric-card-value">{statusLabel[instance.status]}</p>
        </div>
        <div className="metric-card">
          <p className="metric-card-label">Next billing</p>
          <p className="metric-card-value">{nextBilling}</p>
        </div>
      </section>

      <section id="team" className="card space-y-5">
        <div>
          <p className="section-label">Team</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Team members</h2>
        </div>
        <div className="space-y-3">
          {teamMembers.map((member) => (
            <div key={member.email} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{member.name ?? member.email}</p>
                <p className="text-sm text-slate-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="badge-info">{member.role}</span>
                <span className={member.status === 'active' ? 'badge-active' : 'badge-pending'}>{member.status}</span>
              </div>
            </div>
          ))}
          {teamMembers.length === 0 && (
            <p className="text-sm text-slate-400">No team members yet.</p>
          )}
        </div>
      </section>

      <section id="settings" className="card space-y-3">
        <p className="section-label">Settings</p>
        <h2 className="text-2xl font-semibold text-slate-900">Workspace settings</h2>
        <p className="text-sm leading-6 text-slate-600">
          SSO, audit logging, and region-level policy controls will appear here as the control plane rollout continues.
        </p>
      </section>
    </div>
  )
}
