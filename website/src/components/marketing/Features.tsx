import { BarChart3, Globe, Lock, Shield, Users, Zap } from 'lucide-react'

const featureCards = [
  {
    icon: Shield,
    title: 'Adversarial security testing',
    description: 'Probe agents with prompt-injection, jailbreak, and social-engineering scenarios — and verify guardrails hold under multi-turn pressure.',
  },
  {
    icon: Zap,
    title: '15-dimension LLM judge',
    description: 'Every transcript is scored across 15 dimensions — from correctness and goal success to bias, escalation quality, and injection resistance.',
  },
  {
    icon: Globe,
    title: 'Connects to your agent stack',
    description: 'Evaluate Amazon Connect (voice and chat), Amazon Lex, Azure Bot Service, Microsoft Copilot, and any OpenAPI, HTTP, or WebSocket endpoint.',
  },
  {
    icon: BarChart3,
    title: 'Real-time observability',
    description: 'Watch runs stream live, inspect full transcripts turn by turn, and track scores, latency, and cost for every judge invocation.',
  },
  {
    icon: Users,
    title: 'Team-ready governance',
    description: 'A human review queue, scheduled regression runs, and audit-logged overrides give security and product teams shared sign-off.',
  },
  {
    icon: Lock,
    title: 'Compliance built in',
    description: 'Validate FCA Consumer Duty vulnerability handling, bias and fairness, and escalation policy adherence with regulator-ready reports.',
  },
]

export function Features() {
  return (
    <section id="features" className="max-w-8xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">Why teams choose ARIA</p>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Enterprise-grade AI evaluation</h2>
        <p className="text-base leading-7 text-slate-600">
          Everything you need to launch, observe, and govern AI evaluation workflows in one workspace designed for enterprise delivery.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {featureCards.map(({ icon: Icon, title, description }) => (
          <article key={title} className="card space-y-4">
            <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-cyan-300 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="text-sm leading-6 text-slate-600">{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
