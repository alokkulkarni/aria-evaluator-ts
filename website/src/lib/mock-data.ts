import type { InstanceInfo } from '@/types'

export const MOCK_INSTANCE: InstanceInfo = {
  status: 'running',
  plan: 'enterprise_starter',
  region: 'eu-west-2',
  provisionedAt: '2026-01-14T10:30:00.000Z',
  instanceUrl: '#',
  usage: {
    runsThisMonth: 742,
    maxRuns: 2000,
    scenariosUsed: 84,
    maxScenarios: 200,
  },
  provisioningStep: 'complete',
  provisioningProgress: 100,
}

export const MOCK_NEXT_BILLING = '2026-07-01T00:00:00.000Z'

export const MOCK_TEAM = [
  { name: 'Alok Kulkarni', email: 'alok@ariaeval.io', role: 'Owner', status: 'Active' },
  { name: 'Maya Chen', email: 'maya@ariaeval.io', role: 'Admin', status: 'Invited' },
  { name: 'Jordan Patel', email: 'jordan@ariaeval.io', role: 'Member', status: 'Active' },
]
