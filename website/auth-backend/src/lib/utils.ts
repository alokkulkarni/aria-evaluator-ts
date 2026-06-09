import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number): string {
  if (cents < 0) return 'Contact sales'
  if (cents === 0) return 'Free'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents)
}

export function formatNumber(n: number): string {
  if (n < 0) return 'Unlimited'
  return new Intl.NumberFormat('en-US').format(n)
}
