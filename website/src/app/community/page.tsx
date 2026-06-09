import Link from 'next/link'
import {
  Shield,
  Scale,
  Eye,
  AlertTriangle,
  FileCheck,
  Users,
  MessageSquare,
  Lightbulb,
} from 'lucide-react'

const communities = [
  {
    id: 'ai-evaluation',
    name: 'AI Evaluation & Testing',
    description:
      'Discuss best practices for evaluating AI models — red-teaming strategies, adversarial testing, scenario design, and automated judge calibration.',
    icon: Eye,
    colour: 'cyan',
    topics: ['Red-teaming', 'Scenario authoring', 'Judge calibration', 'Benchmark design'],
    members: 'Open to all',
  },
  {
    id: 'ai-risk',
    name: 'AI Risk Management',
    description:
      'Share frameworks and tooling for identifying, measuring, and mitigating risks in production AI systems — from hallucination to model drift.',
    icon: AlertTriangle,
    colour: 'amber',
    topics: ['Risk taxonomies', 'Incident response', 'Model monitoring', 'Failure analysis'],
    members: 'Open to all',
  },
  {
    id: 'ai-security',
    name: 'AI Security & Safety',
    description:
      'Explore prompt injection defences, guardrail engineering, jailbreak resistance, and security hardening for LLM-powered products.',
    icon: Shield,
    colour: 'rose',
    topics: ['Prompt injection', 'Guardrails', 'Data leakage', 'Supply-chain attacks'],
    members: 'Open to all',
  },
  {
    id: 'bias-fairness',
    name: 'Bias & Fairness',
    description:
      'Dedicated to detecting and mitigating bias in AI models — demographic fairness, proxy discrimination, stereotyping, and equitable outcomes.',
    icon: Scale,
    colour: 'violet',
    topics: ['Fairness metrics', 'Bias auditing', 'Protected attributes', 'Intersectionality'],
    members: 'Open to all',
  },
  {
    id: 'compliance',
    name: 'Compliance & Regulatory',
    description:
      'Navigate the evolving regulatory landscape — EU AI Act, NIST AI RMF, FCA Consumer Duty, GDPR Art. 22, SOC 2, and industry-specific mandates.',
    icon: FileCheck,
    colour: 'emerald',
    topics: ['EU AI Act', 'NIST AI RMF', 'SOC 2 for AI', 'FCA / PRA guidance'],
    members: 'Open to all',
  },
  {
    id: 'practitioners',
    name: 'Practitioners & Builders',
    description:
      'A space for ML engineers, platform teams, and product managers building AI-powered features — share patterns, war stories, and tooling tips.',
    icon: Lightbulb,
    colour: 'sky',
    topics: ['Architecture patterns', 'Tooling reviews', 'War stories', 'Career growth'],
    members: 'Open to all',
  },
]

const colourMap: Record<string, { card: string; icon: string; badge: string }> = {
  cyan: {
    card: 'hover:border-cyan-400/30',
    icon: 'bg-cyan-400/10 text-cyan-400',
    badge: 'bg-cyan-400/10 text-cyan-400',
  },
  amber: {
    card: 'hover:border-amber-400/30',
    icon: 'bg-amber-400/10 text-amber-400',
    badge: 'bg-amber-400/10 text-amber-400',
  },
  rose: {
    card: 'hover:border-rose-400/30',
    icon: 'bg-rose-400/10 text-rose-400',
    badge: 'bg-rose-400/10 text-rose-400',
  },
  violet: {
    card: 'hover:border-violet-400/30',
    icon: 'bg-violet-400/10 text-violet-400',
    badge: 'bg-violet-400/10 text-violet-400',
  },
  emerald: {
    card: 'hover:border-emerald-400/30',
    icon: 'bg-emerald-400/10 text-emerald-400',
    badge: 'bg-emerald-400/10 text-emerald-400',
  },
  sky: {
    card: 'hover:border-sky-400/30',
    icon: 'bg-sky-400/10 text-sky-400',
    badge: 'bg-sky-400/10 text-sky-400',
  },
}

export default function CommunityPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Community</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">
              Join the AI safety conversation
            </h1>
            <p className="page-hero-sub max-w-2xl">
              Connect with practitioners, researchers, and teams building
              trustworthy AI. Share knowledge, discuss emerging standards, and
              help shape how the industry evaluates and governs AI systems.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/sign-up"
              className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Join the community
            </Link>
            <Link
              href="/blog"
              className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
            >
              Read the blog
            </Link>
          </div>
        </div>
      </section>

      {/* Community Cards */}
      <section className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {communities.map((c) => {
          const Icon = c.icon
          const colours = colourMap[c.colour]
          return (
            <article
              key={c.id}
              className={`group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition ${colours.card}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colours.icon}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="text-lg font-semibold text-white">
                    {c.name}
                  </h2>
                  <p className="text-sm leading-6 text-slate-400">
                    {c.description}
                  </p>
                </div>
              </div>

              {/* Topic badges */}
              <div className="mt-4 flex flex-wrap gap-2">
                {c.topics.map((topic) => (
                  <span
                    key={topic}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colours.badge}`}
                  >
                    {topic}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {c.members}
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 opacity-0 transition group-hover:opacity-100">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Coming soon
                </span>
              </div>
            </article>
          )
        })}
      </section>

      {/* Why join */}
      <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.02] p-8 sm:p-10">
        <h2 className="text-2xl font-bold text-white">
          Why join ARIA communities?
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Learn from practitioners',
              body: 'Hear directly from teams running AI evaluations in production — what works, what breaks, and how they fixed it.',
            },
            {
              title: 'Stay ahead of regulation',
              body: 'Get early insights on EU AI Act compliance, NIST AI RMF adoption, and upcoming FCA/PRA requirements before they become mandates.',
            },
            {
              title: 'Shape the platform',
              body: 'Community feedback directly influences ARIA Evaluator roadmap priorities — scenario libraries, judge dimensions, and reporting features.',
            },
            {
              title: 'Share scenario libraries',
              body: 'Contribute and discover community-authored evaluation scenarios for bias testing, red-teaming, and domain-specific safety checks.',
            },
            {
              title: 'Early access',
              body: 'Community members get early access to new features, beta programmes, and research previews before general availability.',
            },
            {
              title: 'Network with peers',
              body: 'Connect with AI safety engineers, compliance officers, risk managers, and product leaders building responsible AI systems.',
            },
          ].map((item) => (
            <div key={item.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-12 text-center">
        <p className="text-sm text-slate-500">
          Communities are launching with the ARIA Evaluator platform.{' '}
          <Link
            href="/sign-up"
            className="font-medium text-cyan-400 hover:text-cyan-300"
          >
            Sign up for free
          </Link>{' '}
          to be first in when they open.
        </p>
      </section>
    </div>
  )
}
