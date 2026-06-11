// src/ui/components/UsageBanner.tsx
// Shows a dismissible warning when the tenant is approaching plan limits.
// Visible only in SaaS mode (TENANT_ID set). Hidden in local/standalone.

import React, { useState } from 'react';
import { usePlanGate } from '../lib/plan-gate.js';

function usePct(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

export function UsageBanner() {
  const { plan } = usePlanGate();
  const [dismissed, setDismissed] = useState(false);

  if (!plan || !plan.saasMode || !plan.enabled || dismissed) return null;

  const runPct = usePct(plan.usage.runsThisMonth, plan.limits.maxRunsPerMonth);
  const isWarning = runPct >= 80 && runPct < 100;
  const isCritical = runPct >= 100;

  if (!isWarning && !isCritical) return null;

  return (
    <div className={`mx-6 mt-4 flex items-start justify-between gap-4 rounded-xl px-4 py-3 text-sm ${
      isCritical
        ? 'bg-red-50 border border-red-200 text-red-800'
        : 'bg-amber-50 border border-amber-200 text-amber-800'
    }`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">{isCritical ? '🚫' : '⚠️'}</span>
        <div>
          <p className="font-semibold">
            {isCritical
              ? `Monthly run limit reached (${plan.usage.runsThisMonth}/${plan.limits.maxRunsPerMonth})`
              : `Approaching run limit — ${plan.usage.runsThisMonth}/${plan.limits.maxRunsPerMonth} runs used (${runPct}%)`}
          </p>
          <p className="mt-0.5 opacity-80">
            {isCritical
              ? 'No new runs can be started until the next billing period or you upgrade your plan.'
              : 'Upgrade your plan to avoid interruption.'}
            {plan.upgradeUrl && (
              <>{' '}<a href={plan.upgradeUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
                View plans →
              </a></>
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 rounded p-1 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
