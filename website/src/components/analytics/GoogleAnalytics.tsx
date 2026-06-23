import Script from 'next/script'

/**
 * Google Analytics 4 (gtag) loader.
 *
 * - Gated on NEXT_PUBLIC_GA4_MEASUREMENT_ID (injected at build time by Terraform's
 *   website build step). Renders nothing when unset, so dev/preview builds stay clean.
 * - Consent Mode v2 defaults to **denied** before `config`, so nothing is stored
 *   until the user opts in (GDPR/ePrivacy — analytics is non-essential, opt-in only).
 *   The CookieConsentBanner grants/denies via `applyConsentToGtag()` (see lib/consent.ts);
 *   returning users' stored choices are replayed on load. `wait_for_update` gives the
 *   banner a brief window to update consent before the first hit fires.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID

  if (!measurementId) return null

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
            gtag('consent', 'default', {
              analytics_storage: 'denied',
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              functionality_storage: 'denied',
              personalization_storage: 'denied',
              security_storage: 'granted',
              wait_for_update: 500
            });
            gtag('js', new Date());
            gtag('config', '${measurementId}');
          `,
        }}
      />
    </>
  )
}
