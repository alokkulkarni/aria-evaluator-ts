import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Building2, Clock3, Globe2, Layers3 } from 'lucide-react';

import { ApiError, apiFetch } from '../lib/api.js';

type WorkspaceStatus = 'not_provisioned' | 'provisioning' | 'running' | 'suspended' | 'error';
type PricingTier = 'free' | 'individual' | 'enterprise_starter' | 'enterprise_pro' | 'enterprise_unlimited';
type BillingPeriod = 'monthly' | 'annual';

interface WorkspaceInfo {
  tenantId: string | null;
  status: WorkspaceStatus;
  plan: PricingTier | null;
  region: string | null;
  billingPeriod: BillingPeriod | null;
  instanceUrl: string | null;
  usage: {
    runsThisMonth: number;
    maxRuns: number;
    scenariosUsed: number;
    maxScenarios: number;
  };
  provisionedAt?: string;
}

interface WorkspaceResponse {
  workspaceEligible: boolean;
  websiteUrl: string;
  workspace: WorkspaceInfo | null;
}

interface WorkspacePageProps {
  onOpenDashboard: () => void;
}

const PLAN_NAMES: Record<PricingTier, string> = {
  free: 'Free',
  individual: 'Individual',
  enterprise_starter: 'Enterprise Starter',
  enterprise_pro: 'Enterprise Pro',
  enterprise_unlimited: 'Enterprise Unlimited',
};

const REGION_NAMES: Record<string, string> = {
  'eu-west-2': 'UK (London)',
  'eu-central-1': 'EU (Frankfurt)',
  'eu-west-1': 'EU (Ireland)',
  'us-east-1': 'US East (N. Virginia)',
  'us-west-2': 'US West (Oregon)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
};

const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  not_provisioned: 'Not provisioned',
  provisioning: 'Provisioning',
  running: 'Active',
  suspended: 'Suspended',
  error: 'Error',
};

const STATUS_STYLES: Record<WorkspaceStatus, string> = {
  not_provisioned: 'bg-blue-50 text-blue-700 ring-blue-200',
  provisioning: 'bg-amber-50 text-amber-700 ring-amber-200',
  running: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  suspended: 'bg-slate-100 text-slate-700 ring-slate-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function formatRegion(region: string | null): string {
  if (!region) return 'Not configured';
  return REGION_NAMES[region] ?? region;
}

function formatPlan(plan: PricingTier | null): string {
  if (!plan) return 'Not configured';
  return PLAN_NAMES[plan] ?? plan;
}

function formatBillingPeriod(period: BillingPeriod | null): string {
  if (!period) return 'Not configured';
  return period === 'annual' ? 'Annual' : 'Monthly';
}

function formatDate(value?: string): string {
  if (!value) return 'Pending';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatLimit(value: number): string {
  if (value < 0) return 'Unlimited';
  return value.toLocaleString('en-US');
}

function getProgress(current: number, max: number): number {
  if (max < 0) return 100;
  if (max === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

export function WorkspacePage({ onOpenDashboard }: WorkspacePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WorkspaceResponse | null>(null);

  useEffect(() => {
    let active = true;

    apiFetch('/api/workspace')
      .then((payload) => {
        if (!active) return;
        setResponse(payload as WorkspaceResponse);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof ApiError ? (err.error ?? err.responseText) : (err as Error).message;
        setError(message || 'Could not load workspace details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const workspace = response?.workspace ?? null;
  const websiteUrl = response?.websiteUrl ?? 'http://localhost:3000';
  const hasProvisionedWorkspace = !!workspace?.tenantId;
  const usageCards = useMemo(() => {
    if (!workspace) return [];
    return [
      {
        label: 'Runs this month',
        current: workspace.usage.runsThisMonth,
        max: workspace.usage.maxRuns,
      },
      {
        label: 'Scenarios configured',
        current: workspace.usage.scenariosUsed,
        max: workspace.usage.maxScenarios,
      },
    ];
  }, [workspace]);

  if (loading) {
    return <div className="card py-10 text-center text-sm text-slate-400">Loading workspace…</div>;
  }

  if (error) {
    return (
      <div className="card space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Workspace unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={onOpenDashboard}>
            Open evaluation dashboard
          </button>
          <a href={websiteUrl} className="btn-secondary">
            Go to main website
          </a>
        </div>
      </div>
    );
  }

  if (!response?.workspaceEligible) {
    return (
      <div className="card space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Workspace overview is not available for this session</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This login was created directly inside ARIA Evaluator, so there is no linked website workspace to show here.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={onOpenDashboard}>
            Open evaluation dashboard
          </button>
          <a href={websiteUrl} className="btn-secondary">
            Go to main website
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Workspace overview</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your Workspace</h2>
            <p className="text-sm leading-6 text-slate-200/80">
              Monitor tenant status, plan usage, and account posture from inside ARIA Evaluator without hopping back to the website.
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${workspace ? STATUS_STYLES[workspace.status] : STATUS_STYLES.not_provisioned}`}>
            {workspace ? STATUS_LABELS[workspace.status] : STATUS_LABELS.not_provisioned}
          </span>
        </div>
      </section>

      <section className="card space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${workspace ? STATUS_STYLES[workspace.status] : STATUS_STYLES.not_provisioned}`}>
                {workspace ? STATUS_LABELS[workspace.status] : STATUS_LABELS.not_provisioned}
              </span>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                Single-tenant workspace
              </span>
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">ARIA Evaluator workspace</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {hasProvisionedWorkspace
                  ? 'Your deployment is ready for secure multi-model evaluations with observability, governance, and dedicated regional hosting.'
                  : 'This account does not have a provisioned workspace yet. Complete provisioning on the website to unlock your evaluator instance.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={onOpenDashboard}>
              Open evaluation dashboard
            </button>
            <a href={websiteUrl} className="btn-secondary">
              Manage on website
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard icon={<Globe2 className="h-4 w-4" />} label="Region" value={formatRegion(workspace?.region ?? null)} />
          <InfoCard icon={<Layers3 className="h-4 w-4" />} label="Plan" value={formatPlan(workspace?.plan ?? null)} />
          <InfoCard icon={<Clock3 className="h-4 w-4" />} label="Provisioned" value={formatDate(workspace?.provisionedAt)} />
          <InfoCard icon={<Building2 className="h-4 w-4" />} label="Billing cadence" value={formatBillingPeriod(workspace?.billingPeriod ?? null)} />
        </div>
      </section>

      <section className="card space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Usage</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Plan usage and capacity</h3>
        </div>

        <div className="space-y-6">
          {usageCards.map((metric) => (
            <div key={metric.label} className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">{metric.label}</span>
                <span className="text-slate-500">
                  {formatLimit(metric.current)} / {formatLimit(metric.max)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-[var(--brand)] transition-all"
                  style={{ width: `${getProgress(metric.current, metric.max)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Workspace settings</p>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Control-plane settings</h3>
        <p className="text-sm leading-6 text-slate-600">
          Billing, regional policy controls, and team administration remain available on the main website while the evaluator stays focused on operational workflows.
        </p>
      </section>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
