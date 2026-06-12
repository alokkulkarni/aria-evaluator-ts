import Link from 'next/link'
import {
  CheckCircle2,
  Globe,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

// ── Data ─────────────────────────────────────────────────────────────────────

const trustBadges = [
  { label: 'SOC 2 Type II',     sub: 'Pursuing',          live: false },
  { label: 'GDPR',              sub: 'Pursuing',          live: false },
  { label: 'ISO 27001',         sub: 'Pursuing',          live: false },
  { label: '8 Global Regions',  sub: 'Data residency',    live: true  },
  { label: 'FCA Consumer Duty', sub: 'Controls built in', live: true  },
]

const infraItems = [
  {
    icon: Server,
    title: 'Dedicated tenant infrastructure',
    body: 'Every ARIA workspace runs in its own isolated environment — separate ECS Fargate tasks, separate VPC, separate storage. Your evaluation data and transcripts never share compute or network paths with another customer.',
  },
  {
    icon: Globe,
    title: 'Regional deployment & data residency',
    body: 'Choose from 8 global AWS regions at signup. Your workspace, transcripts, and judge outputs are created and stored in your selected region and never moved. Supports UK, EU, US, and APAC data residency requirements.',
  },
  {
    icon: Lock,
    title: 'Encryption everywhere',
    body: 'All data in transit is protected by TLS 1.2+. Data at rest — transcripts, evaluation results, scenario YAML, database records — is encrypted with AES-256 using AWS-managed keys. Secrets are stored in AWS Secrets Manager, never in environment variables or code.',
  },
  {
    icon: ShieldCheck,
    title: 'Hardened container runtime',
    body: 'ARIA runs on AWS ECS Fargate — a serverless compute layer with no persistent host access. Containers are rebuilt from scratch on every deployment. Docker images are scanned on push via ECR image scanning. No SSH access to production compute.',
  },
]

const accessItems = [
  {
    title: 'Role-based access control',
    description: 'Owner, Admin, and Member roles with granular permissions. Workspace owners control who can create runs, approve reviews, export reports, or modify settings.',
  },
  {
    title: 'Single sign-on (SSO)',
    description: 'Federate access through Google or GitHub OIDC. Enterprise plans support Cognito-brokered SSO for custom identity providers.',
  },
  {
    title: 'Audit log',
    description: 'Every mutation — scenario changes, run launches, review approvals, team changes, setting updates — is recorded with timestamp, actor, IP address, and user-agent. Immutable and exportable.',
  },
  {
    title: 'Session security',
    description: 'Short-lived JWT access tokens (15 minutes) with rotating refresh tokens. Sessions are invalidated on logout. Concurrent session limit enforced. 30-minute idle timeout.',
  },
  {
    title: 'Secrets management',
    description: 'Provider credentials (Bedrock, Connect, Lex, Azure) are stored in AWS Secrets Manager and injected at container start. They are never written to disk, logs, or database. The bootstrap script populates them out-of-band from Terraform.',
  },
  {
    title: 'Network isolation',
    description: 'Each workspace VPC has no inbound internet access except through an Application Load Balancer protected by a CloudFront origin-secret header. ECS tasks have no public IPs.',
  },
]

const complianceItems = [
  {
    standard: 'FCA Consumer Duty',
    badge: 'Built in',
    badgeTone: 'emerald',
    detail: 'ARIA\'s evaluation engine includes a dedicated Vulnerability Detection dimension that identifies distress signals — financial difficulty, bereavement, mental health, coercion — and scores whether the agent handled them correctly. Escalation Appropriateness dimensions validate complaint and transfer flows against FCA policy requirements.',
  },
  {
    standard: 'GDPR',
    badge: 'Pursuing',
    badgeTone: 'amber',
    detail: 'Evaluation data stays in your chosen region. User accounts support suspension (Article 18 restriction of processing). Transcripts are pseudonymised when test customer personas are used. Data processing agreements available on request for enterprise plans.',
  },
  {
    standard: 'SOC 2 Type II',
    badge: 'In progress',
    badgeTone: 'amber',
    detail: 'ARIA is building toward SOC 2 Type II certification across the Security, Availability, and Confidentiality trust service criteria. CloudTrail is enabled across all regions with 1-year retention, CloudWatch log retention of 90 days, and CIS alarm controls.',
  },
  {
    standard: 'HIPAA',
    badge: 'Aligned',
    badgeTone: 'slate',
    detail: 'Workspaces can be deployed in HIPAA-eligible AWS regions. Encryption at rest and in transit, audit logging, and access controls align with HIPAA Technical Safeguard requirements. BAA available for enterprise plans.',
  },
  {
    standard: 'PCI DSS',
    badge: 'Partial',
    badgeTone: 'slate',
    detail: 'ARIA does not store, transmit, or process payment card data. Evaluation scenarios that involve payment-related dialogue are handled as text-only test content; no live payment systems are connected.',
  },
  {
    standard: 'ISO 27001',
    badge: 'Pursuing',
    badgeTone: 'amber',
    detail: 'ARIA\'s information security practices align with ISO 27001 Annex A controls covering access control, cryptography, physical security, operations security, and incident management.',
  },
]

const penTestItems = [
  'All production deployments are separated from staging by network boundary and IAM policy.',
  'CloudTrail multi-region logging with CloudWatch alerting on CIS benchmark triggers.',
  'WAF rate limiting (2,000 req/5min) on all CloudFront distributions.',
  'ECR image vulnerability scanning on every push.',
  'Secrets rotation supported via Terraform taint + ECS force-deployment pattern.',
  'No secrets in Terraform state for runtime credentials — bootstrap-only pattern.',
]

// ── Page ─────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Security — ARIA Evaluator',
  description: 'How ARIA protects evaluation data with dedicated tenancy, regional deployment, encryption, RBAC, audit logs, and compliance controls built for enterprise AI teams.',
}

export default function SecurityPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Security</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">Security built for enterprise AI teams</h1>
            <p className="page-hero-sub max-w-2xl">
              ARIA combines dedicated infrastructure, regional data residency, end-to-end encryption,
              and granular access controls so you can run adversarial AI evaluations without exposing
              sensitive model behaviour or conversation data.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/sign-up" className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Get started
            </Link>
            <Link href="/security/disclosure" className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              Disclosure policy
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust badges ─────────────────────────────────────────────────── */}
      <section className="mt-10 flex flex-wrap gap-4">
        {trustBadges.map((badge) => (
          <div key={badge.label} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
            {badge.live ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <span className="absolute h-3 w-3 animate-ping rounded-full bg-amber-400 opacity-50" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-amber-400" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900">{badge.label}</p>
              <p className="text-xs text-slate-500">{badge.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Infrastructure ───────────────────────────────────────────────── */}
      <section className="mt-16 space-y-8">
        <div className="max-w-3xl space-y-3">
          <p className="section-label">Infrastructure</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Isolated by design, hardened at every layer
          </h2>
          <p className="text-base leading-7 text-slate-600">
            ARIA is deployed on AWS ECS Fargate with a multi-tenant architecture where each customer
            workspace runs in complete infrastructure isolation. No shared queues, no shared storage,
            no shared network paths.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {infraItems.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card space-y-4">
              <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-cyan-300 shadow-[0_8px_20px_rgba(15,23,42,0.18)]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <p className="text-sm leading-6 text-slate-600">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Data protection ──────────────────────────────────────────────── */}
      <section className="mt-16 rounded-3xl border border-slate-200/80 bg-slate-950 p-8 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">Data protection</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your evaluation data stays yours
          </h2>
          <p className="text-sm leading-7 text-slate-300/90">
            Transcripts contain full conversational content between AI personas and the agents under test.
            We treat them as your most sensitive data — they are stored in your region, encrypted at rest,
            and never used for ARIA&apos;s own model training or analytics.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'TLS 1.2+ in transit', detail: 'All API calls, SSE streams, and UI traffic are encrypted in transit. CloudFront enforces HTTPS-only with HSTS headers (max-age 63072000).' },
            { title: 'AES-256 at rest', detail: 'Database records, transcript files, and report exports are encrypted at rest using AWS-managed AES-256 keys by default. Customer-managed keys available on Enterprise plans.' },
            { title: 'Regional storage', detail: 'S3 buckets, RDS, and ECS task storage are created in your chosen region on workspace provisioning. No cross-region replication is enabled by default.' },
            { title: 'Transcript isolation', detail: 'Each transcript is written to a path namespaced by tenant and run ID. There is no shared object store. Files are accessible only to your workspace IAM role.' },
            { title: 'Secrets never in logs', detail: 'Production logging strips passwords, tokens, API keys, and private keys from all log output. Bedrock, Connect, and Lex credentials are injected via Secrets Manager at task start.' },
            { title: 'No training use', detail: 'ARIA does not use your transcripts, scenarios, or evaluation results to train or fine-tune any model. Judge invocations use AWS Bedrock with standard data handling agreements.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-300/90">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Access control ───────────────────────────────────────────────── */}
      <section className="mt-16 space-y-8">
        <div className="max-w-3xl space-y-3">
          <p className="section-label">Access & identity</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Least-privilege access, end to end
          </h2>
          <p className="text-base leading-7 text-slate-600">
            ARIA enforces the principle of least privilege at every layer — from individual user permissions
            within a workspace to the IAM roles that govern what each ECS task can touch in AWS.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accessItems.map((item) => (
            <article key={item.title} className="card space-y-2">
              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Compliance ───────────────────────────────────────────────────── */}
      <section className="mt-16 space-y-8">
        <div className="max-w-3xl space-y-3">
          <p className="section-label">Compliance</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Controls aligned to the frameworks that matter
          </h2>
          <p className="text-base leading-7 text-slate-600">
            ARIA is used by regulated-industry teams evaluating AI agents that handle financial advice,
            health information, and customer service. The compliance controls and evaluation dimensions
            are built with those requirements in mind.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {complianceItems.map((item) => {
            const badgeClasses: Record<string, string> = {
              emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
              blue: 'bg-blue-50 text-blue-700 ring-blue-200',
              amber: 'bg-amber-50 text-amber-700 ring-amber-200',
              slate: 'bg-slate-100 text-slate-600 ring-slate-200',
            }
            return (
              <article key={item.standard} className="card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">{item.standard}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badgeClasses[item.badgeTone]}`}>
                    {item.badge}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-600">{item.detail}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* ── Operational security ─────────────────────────────────────────── */}
      <section className="mt-16 rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-cyan-300 shadow-[0_8px_20px_rgba(15,23,42,0.18)]">
              <KeyRound className="h-5 w-5" />
            </div>
            <p className="section-label">Operational security</p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Continuous monitoring, not just controls on paper
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              ARIA deploys CloudTrail across all regions with 1-year S3 retention and
              90-day CloudWatch log groups. CIS benchmark alarms alert on credential misuse,
              network policy changes, and unauthorised API calls. WAF rate limits protect
              every CloudFront distribution.
            </p>
            <Link href="/contact" className="btn-primary inline-flex rounded-xl">
              Request security documentation
            </Link>
          </div>

          <ul className="space-y-3 self-center">
            {penTestItems.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm leading-6 text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Responsible disclosure ────────────────────────────────────────── */}
      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <article className="card space-y-4">
          <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-cyan-300 shadow-[0_8px_20px_rgba(15,23,42,0.18)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Vulnerability disclosure</h2>
            <p className="text-sm leading-6 text-slate-600">
              We welcome responsible disclosure of security vulnerabilities. If you discover an issue
              in ARIA Evaluator, please report it privately before public disclosure. We aim to acknowledge
              reports within 2 business days and resolve critical issues within 90 days.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/security/disclosure" className="btn-primary rounded-xl">
              Read our policy
            </Link>
            <a href="mailto:security@ariaeval.io" className="btn-secondary rounded-xl">
              security@ariaeval.io
            </a>
          </div>
        </article>

        <article className="card space-y-4">
          <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-cyan-300 shadow-[0_8px_20px_rgba(15,23,42,0.18)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Security documentation</h2>
            <p className="text-sm leading-6 text-slate-600">
              Enterprise and Enterprise Pro plans include access to ARIA&apos;s full security documentation
              package — architecture diagrams, data flow maps, control evidence, and vendor questionnaire
              (VSQ) responses. Available under NDA on request.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/contact" className="btn-primary rounded-xl">
              Request documentation
            </Link>
            <Link href="/pricing" className="btn-secondary rounded-xl">
              View enterprise plans
            </Link>
          </div>
        </article>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-10 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Ready to evaluate securely</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Security that scales with your AI ambitions
              </h2>
              <p className="text-sm leading-6 text-slate-200/80">
                Start with the Free plan and evaluate up to 5 runs — no infrastructure to manage.
                Scale into dedicated tenancy when your compliance requirements demand it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-cyan-300">
                Start for free
              </Link>
              <Link href="/contact" className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
                Talk to security team
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
