import type { Plan } from '@/types'

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try ARIA with no commitment',
    price: { monthly: 0, annual: 0 },
    maxScenarios: 10,
    maxRuns: 100,
    maxModels: 1,
    suspendHours: 1,
    regions: 'limited',
    features: ['10 scenarios per run', '100 runs / month', '1 AI model', 'Basic reporting', 'Community support', '1-hour auto-suspend'],
  },
  {
    id: 'individual',
    name: 'Individual',
    tagline: 'For solo developers and researchers',
    price: { monthly: 49, annual: 39 },
    maxScenarios: 50,
    maxRuns: 500,
    maxModels: 3,
    suspendHours: 3,
    regions: 'limited',
    features: ['50 scenarios per run', '500 runs / month', '3 AI models', 'Advanced reporting', 'Email support', '3-hour auto-suspend', '2 regions'],
  },
  {
    id: 'enterprise_starter',
    name: 'Enterprise Starter',
    tagline: 'For growing teams building safe AI',
    price: { monthly: 299, annual: 249 },
    maxScenarios: 200,
    maxRuns: 2000,
    maxModels: 10,
    suspendHours: 3,
    regions: 'all',
    features: ['200 scenarios per run', '2,000 runs / month', '10 AI models', 'All 8 regions', 'Team management', 'Priority support', 'Observability dashboard'],
  },
  {
    id: 'enterprise_pro',
    name: 'Enterprise Pro',
    tagline: 'Full-scale AI safety evaluation',
    price: { monthly: 799, annual: 699 },
    maxScenarios: -1,
    maxRuns: -1,
    maxModels: -1,
    suspendHours: 3,
    regions: 'all',
    popular: true,
    features: ['Unlimited scenarios', 'Unlimited runs', 'All AI models', 'All 8 regions', 'X-Ray tracing', 'Custom evaluations', 'SLA support', 'Dedicated CloudWatch'],
  },
  {
    id: 'enterprise_unlimited',
    name: 'Enterprise Unlimited',
    tagline: 'Dedicated infrastructure for enterprises',
    price: { monthly: -1, annual: -1 },
    maxScenarios: -1,
    maxRuns: -1,
    maxModels: -1,
    suspendHours: -1,
    regions: 'all',
    enterprise: true,
    features: ['Everything in Pro', 'Dedicated AWS account', 'Custom domain', 'Configurable suspend (1–24h)', 'White-glove onboarding', 'Enterprise SLA', 'Custom integrations'],
  },
]

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id)
}

export function formatPlanPrice(plan: Plan, period: 'monthly' | 'annual'): string {
  const price = plan.price[period]
  if (price === -1) return 'Contact sales'
  if (price === 0) return 'Free'
  return `$${price}/mo`
}
