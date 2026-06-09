import type { Plan } from '@/types'

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Explore the full platform — limited usage',
    price: { monthly: 0, annual: 0 },
    maxScenarios: 10,
    maxRuns: 5,
    maxModels: 1,
    suspendHours: 1,
    regions: 'limited',
    features: ['10 scenarios per run', '5 runs / month', '1 AI model', 'All features included', 'Observability & cost tracking', 'Advanced reporting', 'Community access', '1-hour auto-suspend'],
  },
  {
    id: 'individual',
    name: 'Individual',
    tagline: 'For solo developers and researchers',
    price: { monthly: 49, annual: 39 },
    maxScenarios: 30,
    maxRuns: 200,
    maxModels: 2,
    suspendHours: 3,
    regions: 'limited',
    features: ['30 scenarios per run', '200 runs / month', '2 AI models', 'Advanced reporting', 'Email support', '3-hour auto-suspend', '2 regions'],
  },
  {
    id: 'enterprise_starter',
    name: 'Enterprise Starter',
    tagline: 'For growing teams building safe AI',
    price: { monthly: 299, annual: 249 },
    maxScenarios: 120,
    maxRuns: 900,
    maxModels: 8,
    suspendHours: 3,
    regions: 'all',
    features: ['120 scenarios per run', '900 runs / month', '8 AI models', 'All 8 regions', 'Team management', 'Priority support', 'Observability dashboard'],
  },
  {
    id: 'enterprise_pro',
    name: 'Enterprise Pro',
    tagline: 'Full-scale AI safety evaluation',
    price: { monthly: 799, annual: 699 },
    maxScenarios: 300,
    maxRuns: 3000,
    maxModels: 20,
    suspendHours: 3,
    regions: 'all',
    popular: true,
    features: ['300 scenarios per run', '3,000 runs / month', '20 AI models', 'All 8 regions', 'X-Ray tracing', 'Custom evaluations', 'SLA support', 'Dedicated CloudWatch'],
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
