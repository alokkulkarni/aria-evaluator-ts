import { LegalPage } from '@/components/marketing/LegalPage'

export default function CookiesPage() {
  return (
    <LegalPage
      label="Legal"
      title="Cookie Policy"
      effectiveDate="1 June 2025"
      lastUpdated="1 June 2025"
      description="This Cookie Policy explains how ARIA Evaluator uses cookies and similar technologies when you visit our website and use our platform. It describes what cookies are, which categories we use, and how you can manage your preferences."
      contactEmail="privacy@ariaeval.io"
      sections={[
        {
          id: 'what-are-cookies',
          title: '1. What Are Cookies',
          content: [
            'Cookies are small text files placed on your device by websites you visit. They are widely used to make websites work efficiently, provide analytics information, and remember your preferences.',
            'We also use similar technologies such as local storage and session storage (collectively referred to as "cookies" in this policy).',
          ],
        },
        {
          id: 'cookie-categories',
          title: '2. Cookie Categories',
          content: 'We classify cookies into the following categories based on their purpose. Strictly necessary cookies cannot be disabled as they are essential for the website to function.',
          subsections: [
            {
              title: '2.1 Strictly Necessary Cookies (Always Active)',
              content: [
                'These cookies are essential for the website and platform to function correctly. They enable core features such as authentication, session management, security protections, and load balancing. Without these cookies, the service cannot operate.',
                '• __session / next-auth.session-token — Maintains your authenticated session across page loads. Duration: session. Provider: ARIA Evaluator.',
                '• __csrf — Protects against cross-site request forgery attacks. Duration: session. Provider: ARIA Evaluator.',
                '• __Host-next-auth.csrf-token — NextAuth CSRF protection token. Duration: session. Provider: NextAuth.',
                '• cookie_consent — Stores your cookie preference selections. Duration: 365 days. Provider: ARIA Evaluator.',
              ],
            },
            {
              title: '2.2 Functional Cookies (Optional)',
              content: [
                'These cookies enable enhanced functionality and personalisation. They remember your preferences such as language, region selection, theme, and dashboard layout configurations.',
                '• aria_preferences — Stores UI preferences (theme, layout, sidebar state). Duration: 365 days. Provider: ARIA Evaluator.',
                '• aria_region — Remembers your selected deployment region. Duration: 365 days. Provider: ARIA Evaluator.',
                'If you disable functional cookies, some personalisation features may not work correctly, but core functionality will remain available.',
              ],
            },
            {
              title: '2.3 Analytics Cookies (Optional)',
              content: [
                'These cookies help us understand how visitors interact with our website by collecting anonymised usage data. This information helps us improve our website and user experience.',
                '• _ga / _ga_* — Google Analytics tracking identifier for measuring website traffic and behaviour patterns. Duration: 2 years. Provider: Google.',
                '• _gid — Google Analytics session identifier for distinguishing unique visitors. Duration: 24 hours. Provider: Google.',
                '• aria_analytics — First-party analytics for feature usage tracking within the platform. Duration: 30 days. Provider: ARIA Evaluator.',
                'Analytics data is aggregated and anonymised. We do not use analytics cookies to identify individual users or build personal profiles.',
              ],
            },
            {
              title: '2.4 Marketing Cookies (Optional)',
              content: [
                'These cookies are used to track visitors across websites and display relevant advertisements. We currently use a minimal set of marketing technologies.',
                '• _gcl_au — Google Ads conversion tracking for measuring advertising effectiveness. Duration: 90 days. Provider: Google.',
                '• li_fat_id — LinkedIn ad attribution for measuring campaign performance. Duration: 30 days. Provider: LinkedIn.',
                'We do not sell your personal information or use invasive tracking. Marketing cookies are only set if you explicitly consent to them.',
              ],
            },
          ],
        },
        {
          id: 'managing-cookies',
          title: '3. Managing Your Cookie Preferences',
          content: [
            'When you first visit our website, a cookie consent banner will appear allowing you to accept or customise your cookie preferences. You can change your preferences at any time by clicking the "Cookie Settings" link in the footer of any page.',
            'You can also manage cookies through your browser settings. Most browsers allow you to block or delete cookies. However, blocking strictly necessary cookies may prevent the website from functioning correctly.',
            'Please note that if you clear your browser cookies, your consent preferences will be reset and you will see the consent banner again on your next visit.',
          ],
        },
        {
          id: 'third-party-cookies',
          title: '4. Third-Party Cookies',
          content: [
            'Some cookies are placed by third-party services that appear on our pages. We do not control these cookies and recommend reviewing the privacy policies of these third parties:',
            '• Google Analytics: https://policies.google.com/privacy',
            '• Google Ads: https://policies.google.com/technologies/ads',
            '• LinkedIn: https://www.linkedin.com/legal/privacy-policy',
            'Third-party cookies are only loaded after you provide explicit consent for the relevant cookie category.',
          ],
        },
        {
          id: 'local-storage',
          title: '5. Local Storage and Session Storage',
          content: [
            'In addition to cookies, we use browser local storage and session storage for certain operational purposes:',
            '• Session storage: Temporary data for the current browser session (e.g., form state, navigation context). This data is automatically cleared when you close the tab.',
            '• Local storage: Persistent preferences such as theme selection and cookie consent state. This data remains until explicitly cleared.',
            'Local storage and session storage are not sent to our servers with each request like cookies. They are used client-side only.',
          ],
        },
        {
          id: 'do-not-track',
          title: '6. Do Not Track Signals',
          content: 'We respect Do Not Track (DNT) browser signals. When we detect a DNT signal, we will not load optional analytics or marketing cookies regardless of your consent preferences. Strictly necessary and functional cookies will still operate as required for the service.',
        },
        {
          id: 'updates',
          title: '7. Updates to This Policy',
          content: 'We may update this Cookie Policy from time to time to reflect changes in technology, regulation, or our business practices. We will update the "Last updated" date at the top of this page and, for material changes, notify you via the cookie consent banner or by email.',
        },
      ]}
    />
  )
}
