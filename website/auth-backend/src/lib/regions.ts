import type { PricingTier, Region } from '@/types'

export const REGIONS: Region[] = [
  { id: 'eu-west-2', name: '🇬🇧 UK (London)', flag: '🇬🇧', continent: 'Europe', availableForTiers: ['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'eu-central-1', name: '🇩🇪 EU (Frankfurt)', flag: '🇩🇪', continent: 'Europe', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'eu-west-1', name: '🇮🇪 EU (Ireland)', flag: '🇮🇪', continent: 'Europe', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'us-east-1', name: '🇺🇸 US East (N. Virginia)', flag: '🇺🇸', continent: 'North America', availableForTiers: ['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'us-west-2', name: '🇺🇸 US West (Oregon)', flag: '🇺🇸', continent: 'North America', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'ap-southeast-2', name: '🇦🇺 Asia Pacific (Sydney)', flag: '🇦🇺', continent: 'Asia Pacific', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'ap-southeast-1', name: '🇸🇬 Asia Pacific (Singapore)', flag: '🇸🇬', continent: 'Asia Pacific', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'ap-northeast-1', name: '🇯🇵 Asia Pacific (Tokyo)', flag: '🇯🇵', continent: 'Asia Pacific', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
]

export function getRegionsForTier(tier: PricingTier): Region[] {
  return REGIONS.filter((region) => region.availableForTiers.includes(tier))
}

export function getRegionById(id: string): Region | undefined {
  return REGIONS.find((region) => region.id === id)
}
