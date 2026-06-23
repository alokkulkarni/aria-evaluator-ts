import Script from 'next/script'

import { EEA_UK_REGIONS } from '@/lib/consent'

/**
 * Google Analytics 4 (gtag) loader with region-scoped Consent Mode v2.
 *
 * - Gated on NEXT_PUBLIC_GA4_MEASUREMENT_ID (injected at build time by Terraform's
 *   website build step). Renders nothing when unset, so dev/preview builds stay clean.
 * - **Region-scoped defaults:** inside the EEA/UK (+EFTA/CH) non-essential storage is
 *   denied until opt-in (GDPR/ePrivacy); elsewhere analytics + functional are granted
 *   by default (opt-out). Google matches the region against the visitor's real IP, so
 *   this is the actual compliance gate. The CookieConsentBanner then grants/denies via
 *   `applyConsentToGtag()` and replays stored choices on load. `wait_for_update` gives
 *   the banner a brief window to update consent before the first hit fires.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID

  if (!measurementId) return null

  const eeaRegions = JSON.stringify(EEA_UK_REGIONS)

  return (
    <>
      <Script
        id="ga4-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script
        id="ga4-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            // EEA/UK (+EFTA/CH): opt-in — non-essential storage denied until consent.
            gtag('consent', 'default', {
              region: ${eeaRegions},
              analytics_storage: 'denied',
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              functionality_storage: 'denied',
              personalization_storage: 'denied',
              security_storage: 'granted',
              wait_for_update: 500
            });
            // Rest of world: analytics + functional granted by default (opt-out via cookie settings); ads stay denied.
            gtag('consent', 'default', {
              analytics_storage: 'granted',
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              functionality_storage: 'granted',
              personalization_storage: 'granted',
              security_storage: 'granted'
            });
            gtag('js', new Date());
            gtag('config', '${measurementId}');
          `,
        }}
      />
    </>
  )
}
