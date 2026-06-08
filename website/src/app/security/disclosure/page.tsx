import { LegalPage } from '@/components/marketing/LegalPage'

export default function VulnerabilityDisclosurePage() {
  return (
    <LegalPage
      label="Security"
      title="Vulnerability Disclosure Policy"
      effectiveDate="1 June 2026"
      lastUpdated="1 June 2026"
      description="ARIA Evaluator is committed to the security of our platform and our users' data. We welcome responsible disclosure of security vulnerabilities."
      contactEmail="security@ariaeval.io"
      sections={[
        {
          id: 'scope',
          title: '1. Scope',
          content: 'This policy applies to security vulnerabilities found in:',
          subsections: [
            {
              title: 'In-Scope Systems',
              content: [
                '• ariaeval.io — Marketing website and authentication',
                '• app.ariaeval.io — ARIA Evaluator application',
                '• api.ariaeval.io — ARIA Evaluator API and control plane',
                '• Our open-source repositories on GitHub',
              ],
            },
            {
              title: 'Out of Scope',
              content: [
                '• Third-party services we use (AWS, Stripe, etc.) — report to them directly',
                '• Social engineering attacks against our employees',
                '• Denial of service attacks',
                '• Automated scanning without prior coordination',
              ],
            },
          ],
        },
        {
          id: 'reporting',
          title: '2. How to Report',
          content: 'Send vulnerability reports to security@ariaeval.io. Include:',
          subsections: [
            {
              title: 'Required Information',
              content: [
                '• Description of the vulnerability and its potential impact',
                '• Steps to reproduce the issue',
                '• Affected URLs, parameters, or endpoints',
                '• Your assessment of severity (Critical / High / Medium / Low)',
                '• Any proof-of-concept code or screenshots',
              ],
            },
            {
              title: 'Encryption',
              content: 'For sensitive reports, you may request our PGP key by emailing security@ariaeval.io with the subject line "PGP Key Request".',
            },
          ],
        },
        {
          id: 'guidelines',
          title: '3. Responsible Disclosure Guidelines',
          content: 'We ask that you follow these guidelines when researching and reporting vulnerabilities:',
          subsections: [
            {
              title: 'Do',
              content: [
                '• Report vulnerabilities promptly after discovery',
                '• Provide sufficient detail for us to reproduce and fix the issue',
                '• Allow reasonable time for us to address the issue before public disclosure (90 days)',
                '• Make a good-faith effort to avoid privacy violations, data destruction, and service disruption',
                '• Only interact with accounts you own or with explicit permission',
              ],
            },
            {
              title: 'Do Not',
              content: [
                '• Access, modify, or delete data belonging to other users',
                '• Perform actions that could degrade service for other users',
                '• Use automated tools to scan our systems without prior coordination',
                '• Publicly disclose the vulnerability before we have addressed it',
                '• Demand financial compensation as a condition for reporting',
              ],
            },
          ],
        },
        {
          id: 'response',
          title: '4. Our Response',
          content: 'When you report a vulnerability, here is what to expect:',
          subsections: [
            {
              title: 'Timeline',
              content: [
                '• Acknowledgment: Within 2 business days',
                '• Initial assessment: Within 5 business days',
                '• Status update: Within 10 business days',
                '• Resolution target: Within 90 days (critical issues prioritised)',
              ],
            },
            {
              title: 'Recognition',
              content: 'We maintain a Security Acknowledgments page to recognise individuals who have responsibly reported valid vulnerabilities. If you would like to be acknowledged, please let us know in your report.',
            },
          ],
        },
        {
          id: 'safe-harbour',
          title: '5. Safe Harbour',
          content: 'We consider security research conducted in accordance with this policy to be authorised and will not pursue legal action against researchers who follow these guidelines. We will not pursue civil or criminal action, or send notices to Internet Service Providers, against researchers who act in good faith and in compliance with this policy.',
        },
        {
          id: 'exclusions',
          title: '6. Qualifying Vulnerabilities',
          content: 'Examples of qualifying vulnerabilities include:',
          subsections: [
            {
              title: 'Examples',
              content: [
                '• Cross-site scripting (XSS)',
                '• Cross-site request forgery (CSRF)',
                '• Server-side request forgery (SSRF)',
                '• SQL injection or NoSQL injection',
                '• Authentication or authorisation bypass',
                '• Remote code execution',
                '• Privilege escalation',
                '• Sensitive data exposure',
                '• Insecure direct object references (IDOR)',
              ],
            },
            {
              title: 'Non-Qualifying Issues',
              content: [
                '• Missing security headers on non-sensitive pages (we already implement comprehensive headers)',
                '• Rate limiting on non-authentication endpoints',
                '• Missing DKIM/DMARC/SPF records',
                '• Clickjacking on pages with no sensitive actions',
                '• Content spoofing / text injection without demonstrable impact',
              ],
            },
          ],
        },
      ]}
    />
  )
}
