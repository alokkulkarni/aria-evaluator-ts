import { auth } from '@/auth'
import Link from 'next/link'

import { InstanceStatusCard } from '@/components/dashboard/InstanceStatusCard'
import { UsageBar } from '@/components/dashboard/UsageBar'
import { MOCK_INSTANCE, MOCK_NEXT_BILLING, MOCK_TEAM } from '@/lib/mock-data'
import { serverApiFetch } from '@/lib/api'
import { getPlanById } from '@/lib/plans'
import { getRegionById } from '@/lib/regions'
import type { InstanceInfo } from '@/types'

const statusLabel: Record<typeof MOCK_INSTANCE.status, string> = {
  not_provisioned: 'Not provisioned',
  provisioning: 'Provisioning',
  running: 'Active',
  suspending: 'Suspending',
  suspended: 'Suspended',
  error: 'Error',
}

const statusBadge: Record<typeof MOCK_INSTANCE.status, string> = {
  not_provisioned: 'badge-info',
  provisioning: 'badge-pending',
  running: 'badge-active',
  suspending: 'badge-suspended',
  suspended: 'badge-suspended',
  error: 'badge-error',
}

async function getInstanceInfo(authToken?: string): Promise<InstanceInfo> {
  if (!authToken) {
    return {
      status: 'not_provisioned',
      plan: 'individual',
      region: 'eu-west-2',
      usage: {
        runsThisMonth: 0,
        maxRuns: 0,
        scenariosUsed: 0,
        maxScenarios: 0,
      },
    }
  }

  const tenant = await serverApiFetch<{
    tenantId: string | null
    status: InstanceInfo['status']
    plan: InstanceInfo['plan'] | null
    region: string | null
    billingPeriod: 'monthly' | 'annual' | null
    instanceUrl: string | null
    usage: InstanceInfo['usage']
    provisionedAt?: string
  }>('/tenant/me', { authToken })

  if (!tenant.tenantId || !tenant.plan || !tenant.region) {
    return {
      status: 'not_provisioned',
      plan: 'individual',
      region: 'eu-west-2',
      usage: tenant.usage,
    }
  }

  return {
    status: tenant.status,
    plan: tenant.plan,
    region: tenant.region,
    provisionedAt: tenant.provisionedAt,
    instanceUrl: tenant.instanceUrl ?? undefined,
    usage: tenant.usage,
  }
}

export default async function DashboardPage() {
  const session = await auth()
  const instance = await getInstanceInfo(session?.user?.accessToken)
  const plan = getPlanById(instance.plan)
  const region = getRegionById(instance.region)
  const nextBilling = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(MOCK_NEXT_BILLING))

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
        <section className="card">
          <p className="section-label">Provisioning</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">Your workspace is being prepared.</p>
          <p className="mt-2 text-sm text-slate-600">We&apos;ll finish networking, compute, and configuration in just a few minutes.</p>
        </section>
      ) : null}

      {instance.status === 'suspended' ? (
        <section className="card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Workspace suspended</h2>
            <p className="mt-2 text-sm text-slate-600">Resume your instance to continue running evaluations and observing workloads.</p>
          </div>
          <button type="button" className="btn-primary rounded-xl">
            Resume workspace
          </button>
        </section>
      ) : null}

      <InstanceStatusCard instance={instance} launchHref="/api/launch-instance" />
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
          {MOCK_TEAM.map((member) => (
            <div key={member.email} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{member.name}</p>
                <p className="text-sm text-slate-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="badge-info">{member.role}</span>
                <span className={member.status === 'Active' ? 'badge-active' : 'badge-pending'}>{member.status}</span>
              </div>
            </div>
          ))}
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
