import Link from 'next/link'
import { ArrowUpRight, Clock3, Globe2, Layers3 } from 'lucide-react'

import { getPlanById } from '@/lib/plans'
import { getRegionById } from '@/lib/regions'
import { cn } from '@/lib/utils'
import type { InstanceInfo } from '@/types'

const statusStyles: Record<InstanceInfo['status'], string> = {
  not_provisioned: 'badge-info',
  provisioning: 'badge-pending',
  running: 'badge-active',
  suspending: 'badge-suspended',
  suspended: 'badge-suspended',
  error: 'badge-error',
}

const statusLabels: Record<InstanceInfo['status'], string> = {
  not_provisioned: 'Not provisioned',
  provisioning: 'Provisioning',
  running: 'Active',
  suspending: 'Suspending',
  suspended: 'Suspended',
  error: 'Error',
}

interface InstanceStatusCardProps {
  instance: InstanceInfo
}

export function InstanceStatusCard({ instance }: InstanceStatusCardProps) {
  const plan = getPlanById(instance.plan)
  const region = getRegionById(instance.region)
  const provisionedAt = instance.provisionedAt
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(instance.provisionedAt))
    : 'Pending'

  return (
    <section id="instance" className="card space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={cn('badge', statusStyles[instance.status])}>{statusLabels[instance.status]}</span>
            <span className="badge-info">Single-tenant workspace</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">ARIA Evaluator instance</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Your deployment is ready for secure multi-model evaluations with observability, governance, and dedicated regional hosting.
            </p>
          </div>
        </div>

        <Link
          href={instance.instanceUrl ?? '#'}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition',
            instance.status === 'running'
              ? 'bg-[var(--brand)] text-white hover:bg-[var(--brand-light)]'
              : 'cursor-not-allowed bg-slate-200 text-slate-500',
          )}
          aria-disabled={instance.status !== 'running'}
        >
          Open ARIA Evaluator
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Globe2 className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Region</span>
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">{region ? `${region.flag} ${region.name}` : instance.region}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Layers3 className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Plan</span>
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">{plan?.name ?? instance.plan}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Clock3 className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Provisioned</span>
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">{provisionedAt}</p>
        </div>
      </div>

      {instance.status === 'provisioning' ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between text-sm font-medium text-blue-700">
            <span>{instance.provisioningStep?.replaceAll('_', ' ') ?? 'Preparing workspace'}</span>
            <span>{instance.provisioningProgress ?? 0}%</span>
          </div>
          <div className="h-2 rounded-full bg-blue-100">
            <div className="h-2 rounded-full bg-blue-600" style={{ width: `${instance.provisioningProgress ?? 0}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
