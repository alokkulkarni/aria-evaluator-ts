import { cn, formatNumber } from '@/lib/utils'
import type { InstanceInfo } from '@/types'

interface UsageBarProps {
  instance: InstanceInfo
}

function getProgress(current: number, max: number) {
  if (max <= 0) return 0
  return Math.min(100, Math.round((current / max) * 100))
}

function progressColor(progress: number) {
  if (progress >= 95) return 'bg-rose-500'
  if (progress >= 80) return 'bg-amber-500'
  return 'bg-[var(--brand)]'
}

export function UsageBar({ instance }: UsageBarProps) {
  const metrics = [
    {
      label: 'Runs this month',
      current: instance.usage.runsThisMonth,
      max: instance.usage.maxRuns,
    },
    {
      label: 'Scenarios configured',
      current: instance.usage.scenariosUsed,
      max: instance.usage.maxScenarios,
    },
  ]

  return (
    <section className="card space-y-6">
      <div>
        <p className="section-label">Usage</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Plan usage and capacity</h2>
      </div>

      <div className="space-y-6">
        {metrics.map((metric) => {
          const progress = getProgress(metric.current, metric.max)
          const unlimited = metric.max < 0
          return (
            <div key={metric.label} className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">{metric.label}</span>
                <span className="text-slate-500">
                  {formatNumber(metric.current)} / {formatNumber(metric.max)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div
                  className={cn('h-2 rounded-full transition-all', unlimited ? 'bg-[var(--brand)]' : progressColor(progress))}
                  style={{ width: `${unlimited ? 100 : progress}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
