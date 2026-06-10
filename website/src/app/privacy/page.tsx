import { LegalPage } from '@/components/marketing/LegalPage'

export default function PrivacyPage() {
  return (
    <LegalPage
      label="Legal"
      title="Privacy Policy"
      effectiveDate="1 June 2025"
      lastUpdated="1 June 2025"
      description="This Privacy Policy describes how ARIA Evaluator (&quot;ARIA&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, discloses, and protects your personal information when you use our AI evaluation platform and related services."
      contactEmail="privacy@ariaeval.io"
      sections={[
        {
          id: 'information-we-collect',
          title: '1. Information We Collect',
          content: 'We collect information that you provide directly to us, information we obtain automatically when you use our services, and information from third-party sources.',
          subsections: [
            {
              title: '1.1 Information You Provide',
              content: [
                'Account information: When you create an account, we collect your name, email address, company name, and payment information.',
                'Workspace data: Configuration settings, scenario definitions, evaluation results, and reports generated through the platform.',
                'Communications: When you contact us for support, we collect the content of your messages and any attachments.',
                'Feedback: Survey responses, product feedback, and feature requests you submit.',
              ],
            },
            {
              title: '1.2 Information Collected Automatically',
              content: [
                'Usage data: Pages visited, features used, run frequency, scenario types, and interaction patterns within the platform.',
                'Device information: Browser type, operating system, device identifiers, and screen resolution.',
                'Log data: IP addresses, access timestamps, API call metadata, and error reports.',
                'Cookies and similar technologies: See our Cookie Policy for detailed information about how we use cookies.',
              ],
            },
            {
              title: '1.3 Information from Third Parties',
              content: [
                'Authentication providers: When you sign in via Google or Apple, we receive your profile information as authorised by your account settings.',
                'Payment processors: Transaction confirmations and billing information from our payment service providers.',
              ],
            },
          ],
        },
        {
          id: 'how-we-use',
          title: '2. How We Use Your Information',
          content: [
            'We use the information we collect for the following purposes:',
            '• Service delivery: To provision your workspace, execute evaluation runs, generate reports, and provide customer support.',
            '• Security and fraud prevention: To detect, investigate, and prevent security incidents, abuse, and unauthorised access.',
            '• Product improvement: To analyse usage patterns, diagnose technical issues, and develop new features.',
            '• Communications: To send service notifications, billing information, security alerts, and product updates.',
            '• Compliance: To meet our legal obligations, enforce our terms of service, and respond to lawful data requests.',
            'We process your data on the legal bases of contractual necessity (to deliver the service you subscribed to), legitimate interest (to improve and secure our platform), consent (for optional analytics and marketing), and legal obligation (to comply with applicable laws).',
          ],
        },
        {
          id: 'data-sharing',
          title: '3. Data Sharing and Disclosure',
          content: [
            'We do not sell your personal information. We share data only in the following circumstances:',
            '• Service providers: With trusted third-party vendors who process data on our behalf (cloud hosting, payment processing, email delivery) under strict data processing agreements.',
            '• Legal requirements: When required by law, regulation, legal process, or governmental request.',
            '• Business transfers: In connection with a merger, acquisition, or sale of assets, with appropriate notice to affected users.',
            '• With your consent: When you explicitly authorise us to share your information with a third party.',
            '• Aggregated data: We may share anonymised, aggregated statistics that cannot identify individual users.',
          ],
        },
        {
          id: 'data-storage',
          title: '4. Data Storage and Security',
          content: [
            'Your data is stored in the AWS region you selected during workspace provisioning. We support regions across Europe, North America, and Asia Pacific to help you meet data residency requirements.',
            'We implement industry-standard security measures including encryption at rest (AES-256) and in transit (TLS 1.2+), network isolation, role-based access controls, audit logging, and regular penetration testing.',
            'Workspace data is logically isolated per tenant. No customer data is shared across workspaces.',
          ],
        },
        {
          id: 'data-retention',
          title: '5. Data Retention',
          content: [
            'We retain your data for the following periods:',
            '• Account information: For the duration of your subscription plus 90 days after account closure.',
            '• Evaluation data (runs, transcripts, reports): Retained according to your plan tier — 30 days for Individual plans, 90 days for Enterprise plans, or as specified in your service agreement.',
            '• Audit logs: Retained for 12 months for compliance and security purposes.',
            '• Payment records: Retained for 7 years as required by financial regulations.',
            'You may request earlier deletion of your data subject to our legal and contractual obligations.',
          ],
        },
        {
          id: 'your-rights',
          title: '6. Your Rights',
          content: [
            'Depending on your jurisdiction, you may have the following rights regarding your personal information:',
            '• Access: Request a copy of the personal data we hold about you.',
            '• Rectification: Request correction of inaccurate or incomplete data.',
            '• Erasure: Request deletion of your personal data ("right to be forgotten").',
            '• Portability: Request your data in a structured, machine-readable format.',
            '• Restriction: Request that we limit processing of your data in certain circumstances.',
            '• Objection: Object to processing based on legitimate interest or for direct marketing purposes.',
            '• Withdraw consent: Where processing is based on consent, withdraw it at any time without affecting prior lawful processing.',
            'To exercise these rights, contact us at privacy@ariaeval.io. We will respond within 30 days (or as required by applicable law).',
          ],
        },
        {
          id: 'international-transfers',
          title: '7. International Data Transfers',
          content: [
            'When we transfer personal data outside the European Economic Area (EEA) or the United Kingdom, we rely on approved transfer mechanisms including Standard Contractual Clauses (SCCs), adequacy decisions, or other lawful bases as required by applicable data protection legislation.',
            'Our cloud infrastructure is deployed within the region you select. Cross-region data transfers are limited to operational necessities such as billing and account management.',
          ],
        },
        {
          id: 'childrens-privacy',
          title: '8. Children\'s Privacy',
          content: 'ARIA Evaluator is designed for business and professional use. We do not knowingly collect personal information from children under 16. If you believe a child has provided us with personal data, please contact us so we can promptly delete it.',
        },
        {
          id: 'changes',
          title: '9. Changes to This Policy',
          content: 'We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on our website and, where appropriate, by sending you an email notification. Your continued use of the service after such changes constitutes acceptance of the updated policy.',
        },
        {
          id: 'jurisdiction',
          title: '10. Jurisdiction-Specific Provisions',
          content: [
            'GDPR (EU/EEA/UK): We act as the data controller for personal data processed through the platform. Our Data Protection Officer can be reached at dpo@ariaeval.io.',
            'CCPA (California): California residents have the right to know, delete, and opt out of the sale of personal information. We do not sell personal information. You may submit a verifiable consumer request via privacy@ariaeval.io.',
            'LGPD (Brazil): Brazilian users may exercise their rights under the LGPD by contacting privacy@ariaeval.io.',
          ],
        },
      ]}
    />
  )
}
