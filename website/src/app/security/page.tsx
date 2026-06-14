import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Globe, KeyRound, Lock, Server, ShieldCheck } from 'lucide-react'

import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

export const metadata = {
  title: 'Security — ARIA Evaluator',
  description:
    'How ARIA protects evaluation data with dedicated tenancy, regional deployment, encryption, RBAC, audit logs, and compliance controls built for enterprise AI teams.',
}

const trustBadges = [
  { label: 'SOC 2 Type II', sub: 'Pursuing', live: false },
  { label: 'GDPR', sub: 'Pursuing', live: false },
  { label: 'ISO 27001', sub: 'Pursuing', live: false },
  { label: '8 Global Regions', sub: 'Data residency', live: true },
  { label: 'FCA Consumer Duty', sub: 'Controls built in', live: true },
]

const infraItems = [
  {
    icon: Server,
    title: 'Dedicated tenant infrastructure',
    description:
      'Every ARIA workspace runs in its own isolated environment — separate ECS Fargate tasks, separate VPC, separate storage. Your evaluation data and transcripts never share compute or network paths with another customer.',
  },
  {
    icon: Globe,
    title: 'Regional deployment & data residency',
    description:
      'Choose from 8 global AWS regions at signup. Your workspace, transcripts, and judge outputs are created and stored in your selected region and never moved. Supports UK, EU, US, and APAC data residency requirements.',
  },
  {
    icon: Lock,
    title: 'Encryption everywhere',
    description:
      'All data in transit is protected by TLS 1.2+. Data at rest — transcripts, evaluation results, scenario YAML, database records — is encrypted with AES-256. Secrets are stored in AWS Secrets Manager, never in environment variables or code.',
  },
  {
    icon: ShieldCheck,
    title: 'Hardened container runtime',
    description:
      'ARIA runs on AWS ECS Fargate — a serverless compute layer with no persistent host access. Containers are rebuilt from scratch on every deployment. Docker images are scanned on push via ECR. No SSH access to production compute.',
  },
]

const accessItems = [
  { title: 'Role-based access control', description: 'Owner, Admin, and Member roles with granular permissions. Workspace owners control who can create runs, approve reviews, export reports, or modify settings.' },
  { title: 'Single sign-on (SSO)', description: 'Federate access through Google or GitHub OIDC. Enterprise plans support Cognito-brokered SSO for custom identity providers.' },
  { title: 'Audit log', description: 'Every mutation — scenario changes, run launches, review approvals, team changes, setting updates — is recorded with timestamp, actor, IP address, and user-agent. Immutable and exportable.' },
  { title: 'Session security', description: 'Short-lived JWT access tokens (15 minutes) with rotating refresh tokens. Sessions are invalidated on logout. Concurrent session limit enforced. 30-minute idle timeout.' },
  { title: 'Secrets management', description: 'Provider credentials (Bedrock, Connect, Lex, Azure) are stored in AWS Secrets Manager and injected at container start. They are never written to disk, logs, or database.' },
  { title: 'Network isolation', description: 'Each workspace VPC has no inbound internet access except through an Application Load Balancer protected by a CloudFront origin-secret header. ECS tasks have no public IPs.' },
]

const complianceItems = [
  { standard: 'FCA Consumer Duty', badge: 'Built in', tone: 'emerald', detail: 'A dedicated Vulnerability Detection dimension identifies distress signals — financial difficulty, bereavement, mental health, coercion — and scores whether the agent handled them correctly. Escalation Appropriateness dimensions validate complaint and transfer flows against FCA policy.' },
  { standard: 'GDPR', badge: 'Pursuing', tone: 'amber', detail: 'Evaluation data stays in your chosen region. User accounts support suspension (Article 18). Transcripts are pseudonymised when test customer personas are used. Data processing agreements available for enterprise plans.' },
  { standard: 'SOC 2 Type II', badge: 'In progress', tone: 'amber', detail: 'Building toward SOC 2 Type II across Security, Availability, and Confidentiality criteria. CloudTrail is enabled across all regions with 1-year retention, 90-day CloudWatch retention, and CIS alarm controls.' },
  { standard: 'HIPAA', badge: 'Aligned', tone: 'slate', detail: 'Workspaces can be deployed in HIPAA-eligible AWS regions. Encryption at rest and in transit, audit logging, and access controls align with HIPAA Technical Safeguard requirements. BAA available for enterprise plans.' },
  { standard: 'PCI DSS', badge: 'Partial', tone: 'slate', detail: 'ARIA does not store, transmit, or process payment card data. Payment-related dialogue is handled as text-only test content; no live payment systems are connected.' },
  { standard: 'ISO 27001', badge: 'Pursuing', tone: 'amber', detail: 'Information security practices align with ISO 27001 Annex A controls covering access control, cryptography, physical security, operations security, and incident management.' },
]

const dataProtection = [
  { title: 'TLS 1.2+ in transit', detail: 'All API calls, SSE streams, and UI traffic are encrypted in transit. CloudFront enforces HTTPS-only with HSTS headers.' },
  { title: 'AES-256 at rest', detail: 'Database records, transcript files, and report exports are encrypted at rest. Customer-managed keys available on Enterprise plans.' },
  { title: 'Regional storage', detail: 'S3 buckets, RDS, and ECS task storage are created in your chosen region. No cross-region replication is enabled by default.' },
  { title: 'Transcript isolation', detail: 'Each transcript is written to a path namespaced by tenant and run ID. Files are accessible only to your workspace IAM role.' },
  { title: 'Secrets never in logs', detail: 'Production logging strips passwords, tokens, API keys, and private keys. Provider credentials are injected via Secrets Manager at task start.' },
  { title: 'No training use', detail: 'ARIA does not use your transcripts, scenarios, or evaluation results to train or fine-tune any model.' },
]

const penTestItems = [
  'All production deployments are separated from staging by network boundary and IAM policy.',
  'CloudTrail multi-region logging with CloudWatch alerting on CIS benchmark triggers.',
  'WAF rate limiting (2,000 req/5min) on all CloudFront distributions.',
  'ECR image vulnerability scanning on every push.',
  'Secrets rotation supported via Terraform taint + ECS force-deployment pattern.',
  'No secrets in Terraform state for runtime credentials — bootstrap-only pattern.',
]

const badgeTone: Record<string, string> = {
  emerald: 'bg-emerald-400/10 text-emerald-300 ring-emerald-300/30',
  amber: 'bg-amber-400/10 text-amber-300 ring-amber-300/30',
  slate: 'bg-white/10 text-slate-300 ring-white/15',
}

export default function SecurityPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Security"
        title="Security built for enterprise AI teams"
        description="ARIA combines dedicated infrastructure, regional data residency, end-to-end encryption, and granular access controls so you can run adversarial AI evaluations without exposing sensitive model behaviour or conversation data."
        primary={{ href: '/sign-up', label: 'Get started' }}
        secondary={{ href: '/security/disclosure', label: 'Disclosure policy' }}
      />

      {/* Trust badges */}
      <Section className="py-10">
        <Reveal stagger={0.06} className="flex flex-wrap gap-4">
          {trustBadges.map((badge) => (
            <div key={badge.label} className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
              {badge.live ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                  <span className="absolute h-3 w-3 animate-ping rounded-full bg-amber-400 opacity-50" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-amber-400" />
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-white">{badge.label}</p>
                <p className="text-xs text-slate-500">{badge.sub}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </Section>

      {/* Infrastructure */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Infrastructure"
          title="Isolated by design, hardened at every layer"
          subtitle="ARIA is deployed on AWS ECS Fargate with a multi-tenant architecture where each customer workspace runs in complete infrastructure isolation. No shared queues, no shared storage, no shared network paths."
        />
        <Reveal stagger={0.08} className="mt-12 grid gap-5 md:grid-cols-2">
          {infraItems.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </Reveal>
      </Section>

      {/* Data protection */}
      <Section className="py-12">
        <div className="glass-strong relative overflow-hidden rounded-[1.75rem] p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <SectionHeading
            eyebrow="Data protection"
            title="Your evaluation data stays yours"
            subtitle="Transcripts contain full conversational content. We treat them as your most sensitive data — stored in your region, encrypted at rest, and never used for ARIA's own model training or analytics."
          />
          <Reveal stagger={0.06} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dataProtection.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </Section>

      {/* Access control */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Access & identity"
          title="Least-privilege access, end to end"
          subtitle="ARIA enforces the principle of least privilege at every layer — from individual user permissions within a workspace to the IAM roles that govern what each ECS task can touch in AWS."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accessItems.map((item) => (
            <article key={item.title} className="glass space-y-2 rounded-2xl p-5">
              <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.description}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Compliance */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Compliance"
          title="Controls aligned to the frameworks that matter"
          subtitle="ARIA is used by regulated-industry teams evaluating AI agents that handle financial advice, health information, and customer service. The compliance controls and evaluation dimensions are built with those requirements in mind."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-5 md:grid-cols-2">
          {complianceItems.map((item) => (
            <article key={item.standard} className="glass space-y-3 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold text-white">{item.standard}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badgeTone[item.tone]}`}>
                  {item.badge}
                </span>
              </div>
              <p className="text-sm leading-6 text-slate-400">{item.detail}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Operational security */}
      <Section className="py-12">
        <div className="glass rounded-[1.75rem] p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <div className="inline-flex rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 p-3 text-cyan-300">
                <KeyRound className="h-5 w-5" />
              </div>
              <SectionHeading eyebrow="Operational security" title="Continuous monitoring, not just controls on paper" />
              <Reveal delay={0.1}>
                <p className="text-sm leading-7 text-slate-400">
                  ARIA deploys CloudTrail across all regions with 1-year S3 retention and 90-day CloudWatch log
                  groups. CIS benchmark alarms alert on credential misuse, network policy changes, and
                  unauthorised API calls. WAF rate limits protect every CloudFront distribution.
                </p>
              </Reveal>
              <Reveal delay={0.15}>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                >
                  Request security documentation
                </Link>
              </Reveal>
            </div>

            <Reveal stagger={0.06} className="space-y-3 self-center">
              {penTestItems.map((item) => (
                <li key={item} className="flex list-none items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-sm leading-6 text-slate-300">{item}</span>
                </li>
              ))}
            </Reveal>
          </div>
        </div>
      </Section>

      {/* Disclosure */}
      <Section className="py-12">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal className="glass space-y-4 rounded-2xl p-6">
            <div className="inline-flex rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 p-3 text-cyan-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="font-display text-xl font-semibold text-white">Vulnerability disclosure</h2>
            <p className="text-sm leading-6 text-slate-400">
              We welcome responsible disclosure of security vulnerabilities. If you discover an issue, please
              report it privately before public disclosure. We aim to acknowledge reports within 2 business days
              and resolve critical issues within 90 days.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/security/disclosure" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                Read our policy
              </Link>
              <a href="mailto:security@ariaeval.io" className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10">
                security@ariaeval.io
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="glass space-y-4 rounded-2xl p-6">
            <div className="inline-flex rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 p-3 text-cyan-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="font-display text-xl font-semibold text-white">Security documentation</h2>
            <p className="text-sm leading-6 text-slate-400">
              Enterprise and Enterprise Pro plans include access to ARIA&apos;s full security documentation
              package — architecture diagrams, data flow maps, control evidence, and vendor questionnaire (VSQ)
              responses. Available under NDA on request.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/contact" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                Request documentation
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10">
                View enterprise plans
              </Link>
            </div>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        eyebrow="Ready to evaluate securely"
        title="Security that scales with your AI ambitions"
        description="Start with the Free plan and evaluate up to 5 runs — no infrastructure to manage. Scale into dedicated tenancy when your compliance requirements demand it."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/contact', label: 'Talk to security team' }}
      />
    </div>
  )
}
