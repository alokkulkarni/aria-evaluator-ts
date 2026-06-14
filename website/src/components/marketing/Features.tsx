import { BarChart3, Globe, Lock, Shield, Users, Zap } from 'lucide-react'

import { FeatureCard } from '@/components/marketing/FeatureCard'
import { Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

const featureCards = [
  {
    icon: Shield,
    title: 'Adversarial security testing',
    description:
      'Probe agents with prompt-injection, jailbreak, and social-engineering scenarios — and verify guardrails hold under multi-turn pressure.',
  },
  {
    icon: Zap,
    title: '15-dimension LLM judge',
    description:
      'Every transcript is scored across 15 dimensions — from correctness and goal success to bias, escalation quality, and injection resistance.',
  },
  {
    icon: Globe,
    title: 'Connects to your agent stack',
    description:
      'Evaluate Amazon Connect (voice and chat), Amazon Lex, Azure Bot Service, Microsoft Copilot, and any OpenAPI, HTTP, or WebSocket endpoint.',
  },
  {
    icon: BarChart3,
    title: 'Real-time observability',
    description:
      'Watch runs stream live, inspect full transcripts turn by turn, and track scores, latency, and cost for every judge invocation.',
  },
  {
    icon: Users,
    title: 'Team-ready governance',
    description:
      'A human review queue, scheduled regression runs, and audit-logged overrides give security and product teams shared sign-off.',
  },
  {
    icon: Lock,
    title: 'Compliance built in',
    description:
      'Validate FCA Consumer Duty vulnerability handling, bias and fairness, and escalation policy adherence with regulator-ready reports.',
  },
]

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Why teams choose ARIA"
        title="Enterprise-grade AI evaluation"
        subtitle="Everything you need to launch, observe, and govern AI evaluation workflows in one workspace designed for enterprise delivery."
      />

      <Reveal stagger={0.08} className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {featureCards.map(({ icon, title, description }) => (
          <FeatureCard key={title} icon={icon} title={title} description={description} />
        ))}
      </Reveal>
    </Section>
  )
}
