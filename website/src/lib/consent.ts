import type { CookiePreferences } from '@/components/shared/CookieConsentBanner'

type ConsentState = 'granted' | 'denied'

/**
 * Map our cookie categories to Google Consent Mode v2 signals.
 * `security_storage` is always granted (strictly necessary).
 */
export function consentModeSignals(prefs: CookiePreferences): Record<string, ConsentState> {
  return {
    analytics_storage: prefs.analytics ? 'granted' : 'denied',
    ad_storage: prefs.marketing ? 'granted' : 'denied',
    ad_user_data: prefs.marketing ? 'granted' : 'denied',
    ad_personalization: prefs.marketing ? 'granted' : 'denied',
    functionality_storage: prefs.functional ? 'granted' : 'denied',
    personalization_storage: prefs.functional ? 'granted' : 'denied',
    security_storage: 'granted',
  }
}

/**
 * Push a Consent Mode v2 update to the GA dataLayer from stored preferences.
 * Safe to call before gtag.js loads — the dataLayer queue is processed on load.
 * No-op on the server.
 */
export function applyConsentToGtag(prefs: CookiePreferences): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  w.dataLayer = w.dataLayer || []
  // Reuse the gtag defined by GoogleAnalytics, or define the same shim if absent.
  const gtag =
    w.gtag ||
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments)
    }
  w.gtag = gtag
  gtag('consent', 'update', consentModeSignals(prefs))
}
