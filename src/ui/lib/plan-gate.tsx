// src/ui/lib/plan-gate.tsx
// Provides plan limit state to the whole app and renders the upgrade modal.
// READ-only pages are never blocked; only WRITE actions are gated.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api.js';

export interface PlanLimits {
  enabled: boolean;
  saasMode: boolean;
  tier: string | null;
  upgradeUrl: string | null;
  limits: {
    maxRunsPerMonth: number;
    maxScenariosPerRun: number;
    maxModels: number;
    maxUsers: number;
  };
  usage: {
    runsThisMonth: number;
    distinctProviderCount: number;
  };
  periodStart: string;
}

interface PlanGateContextValue {
  plan: PlanLimits | null;
  /** Returns true when the given write-action is currently blocked due to limit. */
  isBlocked: (action: 'run' | 'scenario' | 'schedule' | 'user') => boolean;
  /** Returns 0-100; ≥100 = limit reached. */
  usagePct: (action: 'run') => number;
  /** Programmatically trigger the upgrade nudge modal for a given action. */
  showUpgradeNudge: (action: 'run' | 'scenario' | 'schedule') => void;
  refresh: () => void;
}

const PlanGateContext = createContext<PlanGateContextValue>({
  plan: null,
  isBlocked: () => false,
  usagePct: () => 0,
  showUpgradeNudge: () => {},
  refresh: () => {},
});

export function usePlanGate(): PlanGateContextValue {
  return useContext(PlanGateContext);
}

const ACTION_LABELS: Record<string, string> = {
  run: 'start new evaluation runs',
  scenario: 'create new scenarios',
  schedule: 'create new schedules',
};

interface UpgradeNudgeProps {
  action: string;
  upgradeUrl: string | null;
  tier: string | null;
  current: number;
  max: number;
  onClose: () => void;
}

function UpgradeNudge({ action, upgradeUrl, tier, current, max, onClose }: UpgradeNudgeProps) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 100;
  const tierLabel = tier ? tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'current plan';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">🚫</div>
          <h2 className="text-xl font-semibold text-slate-900">Limit reached</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your <strong>{tierLabel}</strong> plan does not allow you to {ACTION_LABELS[action] ?? action}.
          </p>

          {max > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-left">
              <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
                <span>Monthly runs used</span>
                <span className={pct >= 100 ? 'text-red-600' : 'text-amber-600'}>{current} / {max}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div
                  className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-slate-500">
            You can still <strong>read reports, view transcripts, analyse past runs,</strong> and review the queue. Only new write operations are paused until your plan resets or you upgrade.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {upgradeUrl && (
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              View upgrade options →
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Continue in read-only mode
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlanGateProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanLimits | null>(null);
  const [nudge, setNudge] = useState<{ action: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    apiFetch('/api/usage')
      .then((d) => setPlan(d as PlanLimits))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Re-fetch every 5 minutes to keep usage fresh
    intervalRef.current = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const isBlocked = useCallback((action: 'run' | 'scenario' | 'schedule' | 'user'): boolean => {
    if (!plan || !plan.enabled) return false;
    if (action === 'run' || action === 'schedule') {
      const { maxRunsPerMonth } = plan.limits;
      if (maxRunsPerMonth < 0) return false;
      return plan.usage.runsThisMonth >= maxRunsPerMonth;
    }
    return false; // scenario/user limits are async-checked on the API side
  }, [plan]);

  const usagePct = useCallback((action: 'run'): number => {
    if (!plan || !plan.enabled) return 0;
    if (action === 'run') {
      const { maxRunsPerMonth } = plan.limits;
      if (maxRunsPerMonth <= 0) return 0;
      return Math.min(100, Math.round((plan.usage.runsThisMonth / maxRunsPerMonth) * 100));
    }
    return 0;
  }, [plan]);

  const showUpgradeNudge = useCallback((action: 'run' | 'scenario' | 'schedule') => {
    setNudge({ action });
  }, []);

  return (
    <PlanGateContext.Provider value={{ plan, isBlocked, usagePct, showUpgradeNudge, refresh }}>
      {children}
      {nudge && (
        <UpgradeNudge
          action={nudge.action}
          upgradeUrl={plan?.upgradeUrl ?? null}
          tier={plan?.tier ?? null}
          current={plan?.usage.runsThisMonth ?? 0}
          max={plan?.limits.maxRunsPerMonth ?? 0}
          onClose={() => setNudge(null)}
        />
      )}
    </PlanGateContext.Provider>
  );
}
