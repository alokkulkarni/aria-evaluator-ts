export type PricingTier = 'free' | 'individual' | 'enterprise_starter' | 'enterprise_pro' | 'enterprise_unlimited'
export type BillingPeriod = 'monthly' | 'annual'
export type InstanceStatus = 'not_provisioned' | 'provisioning' | 'running' | 'suspending' | 'suspended' | 'error'
export type ProvisioningStep = 'queued' | 'creating_network' | 'creating_compute' | 'configuring' | 'complete' | 'failed'

export interface Region {
  id: string
  name: string
  flag: string
  continent: string
  availableForTiers: PricingTier[]
}

export interface Plan {
  id: PricingTier
  name: string
  tagline: string
  price: { monthly: number; annual: number }
  maxScenarios: number
  maxRuns: number
  maxModels: number
  suspendHours: number
  regions: 'limited' | 'all'
  features: string[]
  popular?: boolean
  enterprise?: boolean
}

export interface SignUpState {
  step: 1 | 2 | 3 | 4
  name: string
  email: string
  password: string
  company?: string
  authProvider?: 'google' | 'github' | 'email'
  selectedPlan?: PricingTier
  billingPeriod: BillingPeriod
  selectedRegion?: string
  confirmed: boolean
}

export interface User {
  id: string
  name: string | null
  email: string
  image?: string | null
  role: 'owner' | 'admin' | 'member'
  tenantId?: string
  instanceStatus?: InstanceStatus
  plan?: PricingTier
  region?: string
  isNewUser?: boolean
}

export interface InstanceInfo {
  status: InstanceStatus
  plan: PricingTier
  region: string
  provisionedAt?: string
  instanceUrl?: string
  usage: {
    runsThisMonth: number
    maxRuns: number
    scenariosUsed: number
    maxScenarios: number
  }
  provisioningStep?: ProvisioningStep
  provisioningProgress?: number
}
