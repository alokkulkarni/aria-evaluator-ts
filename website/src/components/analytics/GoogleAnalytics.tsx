import Script from 'next/script'

/**
 * Google Analytics 4 (gtag) loader.
 *
 * - Gated on NEXT_PUBLIC_GA4_MEASUREMENT_ID (injected at build time by Terraform's
 *   website build step). Renders nothing when unset, so dev/preview builds stay clean.
 * - Consent Mode v2 defaults to **denied** before `config`, so on a GDPR-aligned,
 *   UK/EU audience nothing is stored until consent is granted. To enable collection,
 *   call `gtag('consent', 'update', { analytics_storage: 'granted' })` from the
 *   cookie banner once the user opts in (follow-up — no banner/CMP wired yet).
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
            gtag('consent', 'default', {
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              analytics_storage: 'denied'
            });
            gtag('js', new Date());
            gtag('config', '${measurementId}');
          `,
        }}
      />
    </>
  )
}
