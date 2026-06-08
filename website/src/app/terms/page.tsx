import { LegalPage } from '@/components/marketing/LegalPage'

export default function TermsPage() {
  return (
    <LegalPage
      label="Legal"
      title="Terms of Service"
      effectiveDate="1 June 2025"
      lastUpdated="1 June 2025"
      description="These Terms of Service (&quot;Terms&quot;) govern your access to and use of the ARIA Evaluator platform and related services provided by ARIA Evaluator, Inc. (&quot;ARIA&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By creating an account or using the service, you agree to be bound by these Terms."
      contactEmail="legal@ariaeval.io"
      sections={[
        {
          id: 'definitions',
          title: '1. Definitions',
          content: [
            '"Service" means the ARIA Evaluator platform, including all APIs, dashboards, evaluation engines, reporting tools, and documentation.',
            '"Workspace" means an isolated tenant environment provisioned for your account within a selected AWS region.',
            '"Customer Data" means all data, content, scenarios, evaluation results, transcripts, and reports that you upload, create, or generate through the Service.',
            '"Authorised User" means any individual you authorise to access your Workspace under your subscription.',
          ],
        },
        {
          id: 'account-registration',
          title: '2. Account Registration',
          content: [
            'You must provide accurate, complete, and current information during registration. You are responsible for safeguarding your account credentials and for all activity that occurs under your account.',
            'You must be at least 18 years old and have the legal authority to bind your organisation to these Terms. If you are using the Service on behalf of an organisation, you represent that you have authority to accept these Terms on its behalf.',
            'You must notify us immediately at security@ariaeval.io if you suspect any unauthorised use of your account.',
          ],
        },
        {
          id: 'service-plans',
          title: '3. Service Plans and Billing',
          content: [
            'The Service is offered across multiple pricing tiers: Free, Individual, Enterprise Starter, Enterprise Pro, and Enterprise Unlimited. Each tier includes specific limits on scenarios per run, runs per month, AI models, regions, and support levels.',
            'Paid subscriptions are billed in advance on a monthly or annual basis. Annual plans offer a discounted rate. All fees are non-refundable except as expressly stated in these Terms or required by applicable law.',
            'We reserve the right to modify pricing with 30 days\' prior notice. Price changes will take effect at the start of the next billing period following the notice.',
            'If your usage exceeds your plan limits, we may throttle or suspend your access until the next billing period or until you upgrade your plan.',
          ],
        },
        {
          id: 'acceptable-use',
          title: '4. Acceptable Use',
          content: 'You agree to use the Service only for lawful purposes and in accordance with these Terms. You shall not:',
          subsections: [
            {
              title: '4.1 Prohibited Activities',
              content: [
                '• Use the Service to develop, test, or deploy AI systems intended to cause harm to individuals or groups.',
                '• Attempt to circumvent plan limits, usage quotas, or security controls.',
                '• Reverse-engineer, decompile, or disassemble any part of the Service.',
                '• Use the Service to store or transmit malicious code, viruses, or harmful data beyond the scope of legitimate security evaluation.',
                '• Share account credentials or allow unauthorised users to access your Workspace.',
                '• Use the Service in violation of any applicable law, regulation, or third-party rights.',
                '• Resell, sublicence, or redistribute access to the Service without our written consent.',
              ],
            },
            {
              title: '4.2 Adversarial Testing',
              content: [
                'The Service is designed for adversarial AI evaluation. You may use the Service to test AI models with adversarial scenarios including prompt injection, jailbreak attempts, data exfiltration probes, and other security evaluation techniques — provided these tests are conducted against AI systems you own or have explicit written authorisation to test.',
                'You must not use ARIA to attack, probe, or evaluate third-party systems without their consent.',
              ],
            },
          ],
        },
        {
          id: 'customer-data',
          title: '5. Customer Data and Intellectual Property',
          content: [
            'You retain all rights, title, and interest in your Customer Data. We do not claim ownership of any content you create or upload to the Service.',
            'You grant us a limited, non-exclusive licence to process your Customer Data solely for the purpose of providing, maintaining, and improving the Service.',
            'We will not use your Customer Data to train machine learning models, share it with third parties for their own purposes, or access it except as necessary to provide the Service or as required by law.',
            'All intellectual property in the Service itself — including the evaluation engine, judge models, scoring algorithms, scenario frameworks, and user interface — remains the exclusive property of ARIA Evaluator, Inc.',
          ],
        },
        {
          id: 'data-security',
          title: '6. Data Security and Compliance',
          content: [
            'We implement industry-standard security measures to protect your data, including encryption at rest and in transit, network isolation, access controls, and regular security assessments.',
            'Workspaces are logically isolated. No Customer Data is shared across tenants.',
            'For Enterprise plans, we offer a Data Processing Agreement (DPA) aligned with GDPR, CCPA, and other applicable data protection regulations. Contact legal@ariaeval.io to request a DPA.',
          ],
        },
        {
          id: 'sla',
          title: '7. Service Level Agreement',
          content: [
            'We target 99.9% monthly uptime for Enterprise Pro and Enterprise Unlimited plans. Uptime is measured as the percentage of time the core evaluation engine and API are operational, excluding scheduled maintenance.',
            'Scheduled maintenance windows will be communicated at least 48 hours in advance and, where possible, conducted during off-peak hours.',
            'Service credits for downtime exceeding the SLA target are available to Enterprise Pro and Enterprise Unlimited customers as detailed in the applicable SLA addendum.',
            'Free and Individual plans are provided on a best-effort basis without uptime guarantees.',
          ],
        },
        {
          id: 'limitation-liability',
          title: '8. Limitation of Liability',
          content: [
            'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ARIA EVALUATOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITIES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.',
            'OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.',
            'These limitations apply regardless of the theory of liability (contract, tort, strict liability, or otherwise) and even if we have been advised of the possibility of such damages.',
          ],
        },
        {
          id: 'warranties',
          title: '9. Disclaimers and Warranties',
          content: [
            'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
            'We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. We do not guarantee the accuracy, reliability, or completeness of evaluation results — they are provided as informational tools to assist your AI safety and governance processes.',
            'You are solely responsible for the decisions you make based on evaluation results produced by the Service.',
          ],
        },
        {
          id: 'termination',
          title: '10. Termination',
          content: [
            'You may cancel your subscription at any time through your account dashboard. Cancellation takes effect at the end of the current billing period.',
            'We may suspend or terminate your account immediately if you violate these Terms, engage in prohibited activities, or fail to pay applicable fees after reasonable notice.',
            'Upon termination, your right to access the Service ceases immediately. We will retain your Customer Data for 90 days after termination, during which time you may request an export. After this period, your data will be permanently deleted.',
            'Sections relating to intellectual property, limitation of liability, disclaimers, and governing law survive termination.',
          ],
        },
        {
          id: 'modifications',
          title: '11. Modifications to Terms',
          content: 'We may modify these Terms at any time by posting the updated version on our website. We will provide at least 30 days\' notice for material changes via email or in-app notification. Your continued use of the Service after such changes constitutes acceptance of the modified Terms. If you disagree with the changes, you must stop using the Service and cancel your subscription.',
        },
        {
          id: 'governing-law',
          title: '12. Governing Law and Dispute Resolution',
          content: [
            'These Terms are governed by the laws of England and Wales, without regard to conflict of law principles.',
            'Any dispute arising out of or relating to these Terms shall first be attempted to be resolved through good-faith negotiation. If negotiation fails, disputes shall be submitted to binding arbitration under the rules of the London Court of International Arbitration (LCIA).',
            'Nothing in this section prevents either party from seeking injunctive or other equitable relief in any court of competent jurisdiction.',
          ],
        },
        {
          id: 'general',
          title: '13. General Provisions',
          content: [
            'Entire agreement: These Terms, together with our Privacy Policy and Cookie Policy, constitute the entire agreement between you and ARIA Evaluator regarding the Service.',
            'Severability: If any provision of these Terms is held invalid or unenforceable, the remaining provisions shall continue in full force and effect.',
            'Waiver: Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision.',
            'Assignment: You may not assign these Terms without our prior written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.',
            'Force majeure: Neither party shall be liable for delays or failures caused by events beyond their reasonable control, including natural disasters, pandemics, government actions, or infrastructure failures.',
          ],
        },
      ]}
    />
  )
}
