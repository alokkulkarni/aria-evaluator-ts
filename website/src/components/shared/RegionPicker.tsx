'use client'

import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Region } from '@/types'

interface RegionPickerProps {
  selectedRegion?: string
  onSelect: (regionId: string) => void
  availableRegions: Region[]
  disabledRegions?: string[]
}

export function RegionPicker({ selectedRegion, onSelect, availableRegions, disabledRegions = [] }: RegionPickerProps) {
  const disabled = new Set(disabledRegions)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {availableRegions.map((region) => {
        const isDisabled = disabled.has(region.id)
        const isSelected = selectedRegion === region.id

        return (
          <button
            key={region.id}
            type="button"
            onClick={() => !isDisabled && onSelect(region.id)}
            disabled={isDisabled}
            className={cn(
              'rounded-2xl border p-4 text-left transition',
              isDisabled
                ? 'cursor-not-allowed border-slate-200 bg-slate-100/70 text-slate-400'
                : 'border-slate-200 bg-white/90 hover:border-blue-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)]',
              isSelected && !isDisabled && 'border-blue-500 bg-blue-50 ring-4 ring-blue-500/10',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">{region.flag}</div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{region.name}</p>
                <p className="text-sm text-slate-500">{region.continent}</p>
              </div>
              {isDisabled ? <Lock className="h-4 w-4 text-slate-400" /> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
