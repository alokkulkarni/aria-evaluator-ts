type ConsentState = 'granted' | 'denied'

/**
 * Cookie categories users can toggle. `necessary` is always on.
 * Defined here (shared, framework-agnostic lib) rather than in the React banner,
 * so this module stays self-contained — the auth-backend build compiles src/lib
 * too and can't resolve frontend component paths.
 */
export interface CookiePreferences {
  necessary: true
  functional: boolean
  analytics: boolean
  marketing: boolean
}

/**
 * EEA + UK + EFTA (+ Switzerland) ISO country codes where non-essential cookies
 * require prior opt-in. Used for GA4's region-scoped Consent Mode defaults — Google
 * matches these against the visitor's real IP server-side, so this is the actual
 * compliance gate (the banner's timezone heuristic only drives UI).
 */
export const EEA_UK_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', // EU 27
  'IS', 'LI', 'NO', // EEA EFTA
  'GB', 'CH', // UK + Switzerland
]

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

/**
 * Timezone heuristic for the BANNER UI only: is the visitor likely in the EEA/UK?
 * Errs toward "yes" (opt-in) when uncertain. The real compliance gating is GA4's
 * region-scoped Consent Mode defaults, which use the visitor's IP — so a wrong guess
 * here only affects whether the banner auto-shows / its toggle defaults, never whether
 * data is unlawfully collected.
 */
export function isLikelyEEAorUK(): boolean {
  if (typeof Intl === 'undefined') return true
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (tz.startsWith('Europe/')) return true
    // EEA Atlantic territories (Iceland, Canary Is., Madeira, Azores)
    return ['Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores'].includes(tz)
  } catch {
    return true
  }
}

/**
 * Initial banner toggle defaults by region: opt-in inside the EEA/UK (all off),
 * opt-out elsewhere (analytics + functional pre-selected). Marketing/ads stay
 * opt-in everywhere (more sensitive; the site runs no ads).
 */
export function regionalDefaultPreferences(): CookiePreferences {
  const optIn = isLikelyEEAorUK()
  return {
    necessary: true,
    functional: !optIn,
    analytics: !optIn,
    marketing: false,
  }
}
