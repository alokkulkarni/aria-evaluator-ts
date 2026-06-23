'use client'

import { openCookiePreferences } from '@/components/shared/CookieConsentBanner'

/**
 * Footer link that reopens the cookie consent banner so users can review or
 * withdraw consent at any time (GDPR: withdrawal must be as easy as giving it).
 */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className="group inline-flex items-center gap-1 text-slate-400 transition hover:text-white"
    >
      Cookie settings
    </button>
  )
}
