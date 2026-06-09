import {
  Shield,
  Scale,
  Eye,
  AlertTriangle,
  FileCheck,
  Lightbulb,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface CommunityDiscussion {
  title: string
  author: string
  replies: number
  date: string
  pinned?: boolean
}

export interface CommunityResource {
  title: string
  description: string
  href: string
  type: 'guide' | 'standard' | 'tool' | 'article'
}

export interface CommunityChannel {
  platform: 'slack' | 'discord' | 'github'
  label: string
  href: string
}

export interface Community {
  id: string
  name: string
  tagline: string
  description: string
  icon: LucideIcon
  colour: string
  topics: string[]
  members: string
  longDescription: string
  channels: CommunityChannel[]
  discussions: CommunityDiscussion[]
  resources: CommunityResource[]
}

export const COMMUNITIES: Community[] = [
  {
    id: 'ai-evaluation',
    name: 'AI Evaluation & Testing',
    tagline: 'Better evaluations, safer models',
    description:
      'Discuss best practices for evaluating AI models — red-teaming strategies, adversarial testing, scenario design, and automated judge calibration.',
    icon: Eye,
    colour: 'cyan',
    topics: ['Red-teaming', 'Scenario authoring', 'Judge calibration', 'Benchmark design'],
    members: 'Open to all',
    channels: [
      { platform: 'slack', label: '#ai-evaluation', href: 'https://ariaeval.slack.com/channels/ai-evaluation' },
      { platform: 'discord', label: 'AI Evaluation', href: 'https://discord.gg/ariaeval' },
      { platform: 'github', label: 'Discussions', href: 'https://github.com/ariaeval/community/discussions/categories/ai-evaluation' },
    ],
    longDescription:
      'The AI Evaluation & Testing community is where practitioners share what actually works when evaluating AI systems. ' +
      'From designing adversarial scenarios that expose real vulnerabilities to calibrating automated judges that score consistently, ' +
      'this community covers the full evaluation lifecycle. Whether you\'re building your first red-teaming programme or ' +
      'scaling evaluation across hundreds of models, you\'ll find peers who\'ve solved similar challenges.',
    discussions: [
      { title: 'How do you handle judge disagreement across evaluation dimensions?', author: 'eval_engineer', replies: 24, date: '2 hours ago', pinned: true },
      { title: 'Sharing our adversarial scenario library for financial services AI', author: 'risk_lead', replies: 18, date: '5 hours ago', pinned: true },
      { title: 'Red-teaming GPT-4o vs Claude 3.5 — methodology and results', author: 'ai_safety_researcher', replies: 31, date: '1 day ago' },
      { title: 'Automating scenario generation from production incident logs', author: 'platform_eng', replies: 12, date: '1 day ago' },
      { title: 'Best practices for multi-turn conversation evaluation', author: 'chatbot_dev', replies: 9, date: '2 days ago' },
      { title: 'Benchmarking tool-use accuracy in agent systems', author: 'agent_builder', replies: 15, date: '3 days ago' },
    ],
    resources: [
      { title: 'OWASP LLM Top 10', description: 'Industry standard vulnerability categories for LLM applications', href: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/', type: 'standard' },
      { title: 'Getting Started with Red-Teaming', description: 'A practical guide to building your first adversarial evaluation suite', href: '/blog', type: 'guide' },
      { title: 'ARIA Scenario Authoring Guide', description: 'How to write effective evaluation scenarios in YAML', href: '/docs', type: 'guide' },
      { title: 'MITRE ATLAS Framework', description: 'Adversarial threat landscape for AI systems', href: 'https://atlas.mitre.org/', type: 'standard' },
    ],
  },
  {
    id: 'ai-risk',
    name: 'AI Risk Management',
    tagline: 'Identify, measure, and mitigate AI risks',
    description:
      'Share frameworks and tooling for identifying, measuring, and mitigating risks in production AI systems — from hallucination to model drift.',
    icon: AlertTriangle,
    colour: 'amber',
    topics: ['Risk taxonomies', 'Incident response', 'Model monitoring', 'Failure analysis'],
    members: 'Open to all',
    channels: [
      { platform: 'slack', label: '#ai-risk', href: 'https://ariaeval.slack.com/channels/ai-risk' },
      { platform: 'discord', label: 'AI Risk', href: 'https://discord.gg/ariaeval' },
      { platform: 'github', label: 'Discussions', href: 'https://github.com/ariaeval/community/discussions/categories/ai-risk' },
    ],
    longDescription:
      'AI Risk Management is where risk professionals, ML engineers, and product leaders discuss how to systematically identify and manage ' +
      'the risks that come with deploying AI in production. From building risk registers to designing monitoring systems that catch model drift ' +
      'before customers notice, this community shares practical frameworks that work beyond the whiteboard.',
    discussions: [
      { title: 'Building a risk register for LLM-powered customer service', author: 'risk_officer', replies: 19, date: '3 hours ago', pinned: true },
      { title: 'How we detected model drift in our recommendation system', author: 'ml_ops_lead', replies: 27, date: '6 hours ago', pinned: true },
      { title: 'Hallucination rate tracking — metrics that actually matter', author: 'data_scientist', replies: 14, date: '1 day ago' },
      { title: 'Post-mortem: when our AI agent gave incorrect medical advice', author: 'healthtech_eng', replies: 42, date: '1 day ago' },
      { title: 'Quantifying financial risk exposure from AI decision-making', author: 'quant_risk', replies: 11, date: '2 days ago' },
      { title: 'Real-time alerting for AI quality degradation', author: 'sre_team', replies: 8, date: '3 days ago' },
    ],
    resources: [
      { title: 'NIST AI Risk Management Framework', description: 'Comprehensive US federal guidance on AI risk management', href: 'https://www.nist.gov/artificial-intelligence/executive-order-safe-secure-and-trustworthy-artificial-intelligence', type: 'standard' },
      { title: 'AI Incident Database', description: 'Catalogue of real-world AI failures and incidents', href: 'https://incidentdatabase.ai/', type: 'tool' },
      { title: 'Building AI Risk Registers', description: 'Step-by-step guide to cataloguing and scoring AI risks', href: '/blog', type: 'guide' },
      { title: 'Model Monitoring Best Practices', description: 'Practical patterns for detecting drift, degradation, and anomalies', href: '/docs', type: 'guide' },
    ],
  },
  {
    id: 'ai-security',
    name: 'AI Security & Safety',
    tagline: 'Harden your AI against real-world attacks',
    description:
      'Explore prompt injection defences, guardrail engineering, jailbreak resistance, and security hardening for LLM-powered products.',
    icon: Shield,
    colour: 'rose',
    topics: ['Prompt injection', 'Guardrails', 'Data leakage', 'Supply-chain attacks'],
    members: 'Open to all',
    channels: [
      { platform: 'slack', label: '#ai-security', href: 'https://ariaeval.slack.com/channels/ai-security' },
      { platform: 'discord', label: 'AI Security', href: 'https://discord.gg/ariaeval' },
      { platform: 'github', label: 'Discussions', href: 'https://github.com/ariaeval/community/discussions/categories/ai-security' },
    ],
    longDescription:
      'The AI Security & Safety community brings together security engineers, red-teamers, and platform teams focused on hardening AI systems ' +
      'against real-world attacks. From novel prompt injection techniques to guardrail architectures that actually hold up under adversarial pressure, ' +
      'this is where the security community shares attack research, defence patterns, and incident learnings.',
    discussions: [
      { title: 'Novel prompt injection via Unicode control characters', author: 'security_researcher', replies: 35, date: '1 hour ago', pinned: true },
      { title: 'Guardrail architecture patterns that scale', author: 'platform_security', replies: 22, date: '4 hours ago', pinned: true },
      { title: 'How we prevented data exfiltration through tool-calling agents', author: 'appsec_lead', replies: 28, date: '1 day ago' },
      { title: 'Testing jailbreak resistance across model providers', author: 'red_teamer', replies: 19, date: '1 day ago' },
      { title: 'Supply-chain risks in RAG pipelines — poisoned embeddings', author: 'ml_security', replies: 16, date: '2 days ago' },
      { title: 'Implementing content filtering without destroying UX', author: 'product_eng', replies: 13, date: '3 days ago' },
    ],
    resources: [
      { title: 'OWASP LLM Security Guide', description: 'Comprehensive security guidance for LLM applications', href: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/', type: 'standard' },
      { title: 'Prompt Injection Defence Patterns', description: 'Practical architectures for defending against injection attacks', href: '/blog', type: 'guide' },
      { title: 'MITRE ATLAS', description: 'Adversarial threat landscape for AI systems', href: 'https://atlas.mitre.org/', type: 'standard' },
      { title: 'Guardrail Engineering Handbook', description: 'How to design, test, and deploy input/output guardrails', href: '/docs', type: 'guide' },
    ],
  },
  {
    id: 'bias-fairness',
    name: 'Bias & Fairness',
    tagline: 'Build AI that treats everyone equitably',
    description:
      'Dedicated to detecting and mitigating bias in AI models — demographic fairness, proxy discrimination, stereotyping, and equitable outcomes.',
    icon: Scale,
    colour: 'violet',
    topics: ['Fairness metrics', 'Bias auditing', 'Protected attributes', 'Intersectionality'],
    members: 'Open to all',
    channels: [
      { platform: 'slack', label: '#bias-fairness', href: 'https://ariaeval.slack.com/channels/bias-fairness' },
      { platform: 'discord', label: 'Bias & Fairness', href: 'https://discord.gg/ariaeval' },
      { platform: 'github', label: 'Discussions', href: 'https://github.com/ariaeval/community/discussions/categories/bias-fairness' },
    ],
    longDescription:
      'The Bias & Fairness community tackles one of the hardest challenges in AI — ensuring models treat all users equitably. ' +
      'From designing bias audits that catch subtle proxy discrimination to defining fairness metrics that are meaningful in practice, ' +
      'this community brings together researchers, ethicists, engineers, and compliance professionals working to eliminate harmful bias from AI systems.',
    discussions: [
      { title: 'Detecting proxy discrimination in lending models — name and zip code bias', author: 'fairness_researcher', replies: 29, date: '2 hours ago', pinned: true },
      { title: 'Fairness metrics comparison: demographic parity vs equalised odds', author: 'ml_ethics', replies: 21, date: '5 hours ago', pinned: true },
      { title: 'How we audit our customer service AI for gender bias monthly', author: 'trust_safety', replies: 17, date: '1 day ago' },
      { title: 'Intersectional bias testing — compounding effects across demographics', author: 'dei_lead', replies: 24, date: '1 day ago' },
      { title: 'Building inclusive evaluation datasets that represent diverse populations', author: 'data_curator', replies: 11, date: '2 days ago' },
      { title: 'Regulatory requirements for bias testing — EU AI Act Article 10', author: 'compliance_eng', replies: 15, date: '3 days ago' },
    ],
    resources: [
      { title: 'EU AI Act — Bias & Discrimination', description: 'Article 10 requirements for bias testing in high-risk AI systems', href: 'https://artificialintelligenceact.eu/', type: 'standard' },
      { title: 'Fairness Metrics Explained', description: 'A practical comparison of demographic parity, equalised odds, and calibration', href: '/blog', type: 'guide' },
      { title: 'ARIA Bias Testing Scenarios', description: 'Pre-built adversarial scenarios for testing demographic bias', href: '/docs', type: 'tool' },
      { title: 'Equality Act 2010 — AI Implications', description: 'UK equality law applied to automated decision-making', href: 'https://www.legislation.gov.uk/ukpga/2010/15/contents', type: 'standard' },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance & Regulatory',
    tagline: 'Navigate the evolving AI regulatory landscape',
    description:
      'Navigate the evolving regulatory landscape — EU AI Act, NIST AI RMF, FCA Consumer Duty, GDPR Art. 22, SOC 2, and industry-specific mandates.',
    icon: FileCheck,
    colour: 'emerald',
    topics: ['EU AI Act', 'NIST AI RMF', 'SOC 2 for AI', 'FCA / PRA guidance'],
    members: 'Open to all',
    channels: [
      { platform: 'slack', label: '#compliance', href: 'https://ariaeval.slack.com/channels/compliance' },
      { platform: 'discord', label: 'Compliance', href: 'https://discord.gg/ariaeval' },
      { platform: 'github', label: 'Discussions', href: 'https://github.com/ariaeval/community/discussions/categories/compliance' },
    ],
    longDescription:
      'The Compliance & Regulatory community is the go-to space for understanding how emerging AI regulation affects your products and operations. ' +
      'From the EU AI Act\'s risk classification system to FCA Consumer Duty obligations for AI in financial services, ' +
      'this community shares practical compliance strategies, audit frameworks, and regulatory intelligence from practitioners who\'ve been through the process.',
    discussions: [
      { title: 'EU AI Act compliance checklist — what high-risk systems need by August 2026', author: 'eu_compliance', replies: 38, date: '1 hour ago', pinned: true },
      { title: 'SOC 2 controls for AI systems — what auditors actually look for', author: 'infosec_lead', replies: 25, date: '3 hours ago', pinned: true },
      { title: 'FCA Consumer Duty and AI-driven financial advice — practical guidance', author: 'fca_specialist', replies: 20, date: '1 day ago' },
      { title: 'GDPR Article 22: automated decision-making and the right to explanation', author: 'dpo_network', replies: 16, date: '1 day ago' },
      { title: 'NIST AI RMF adoption — lessons from early implementers', author: 'standards_body', replies: 12, date: '2 days ago' },
      { title: 'Documentation requirements for AI model cards and system descriptions', author: 'tech_writer', replies: 9, date: '3 days ago' },
    ],
    resources: [
      { title: 'EU AI Act Full Text', description: 'The complete regulation with risk classification and obligations', href: 'https://artificialintelligenceact.eu/', type: 'standard' },
      { title: 'NIST AI Risk Management Framework', description: 'US federal framework for trustworthy AI development', href: 'https://airc.nist.gov/AI_RMF_Interactivity', type: 'standard' },
      { title: 'FCA Consumer Duty AI Guidance', description: 'UK financial regulation for AI in consumer-facing services', href: 'https://www.fca.org.uk/firms/consumer-duty', type: 'standard' },
      { title: 'AI Compliance Readiness Guide', description: 'Step-by-step preparation for EU AI Act high-risk classification', href: '/blog', type: 'guide' },
    ],
  },
  {
    id: 'practitioners',
    name: 'Practitioners & Builders',
    tagline: 'Build better AI products, together',
    description:
      'A space for ML engineers, platform teams, and product managers building AI-powered features — share patterns, war stories, and tooling tips.',
    icon: Lightbulb,
    colour: 'sky',
    topics: ['Architecture patterns', 'Tooling reviews', 'War stories', 'Career growth'],
    members: 'Open to all',
    channels: [
      { platform: 'slack', label: '#practitioners', href: 'https://ariaeval.slack.com/channels/practitioners' },
      { platform: 'discord', label: 'Practitioners', href: 'https://discord.gg/ariaeval' },
      { platform: 'github', label: 'Discussions', href: 'https://github.com/ariaeval/community/discussions/categories/practitioners' },
    ],
    longDescription:
      'Practitioners & Builders is the community for the people actually shipping AI products. No academic abstractions — just real-world patterns, ' +
      'honest war stories, and practical tooling comparisons from engineers, product managers, and team leads who build AI features every day. ' +
      'Whether you\'re choosing an LLM provider, designing an agent architecture, or figuring out how to explain AI failures to stakeholders, you\'ll find help here.',
    discussions: [
      { title: 'Our agent architecture: tool-calling with fallback chains and circuit breakers', author: 'senior_eng', replies: 33, date: '2 hours ago', pinned: true },
      { title: 'Comparing LLM providers for production workloads — cost, latency, reliability', author: 'platform_architect', replies: 41, date: '4 hours ago', pinned: true },
      { title: 'How we reduced LLM latency from 3s to 800ms with streaming + caching', author: 'performance_eng', replies: 22, date: '1 day ago' },
      { title: 'RAG pipeline lessons learned — what we\'d do differently', author: 'ml_lead', replies: 28, date: '1 day ago' },
      { title: 'Explaining AI failures to non-technical stakeholders', author: 'product_manager', replies: 15, date: '2 days ago' },
      { title: 'Transitioning from software engineering to AI/ML — career advice', author: 'career_switcher', replies: 19, date: '3 days ago' },
    ],
    resources: [
      { title: 'LLM Architecture Patterns', description: 'Common patterns for building production LLM applications', href: '/blog', type: 'guide' },
      { title: 'Agent Design Cookbook', description: 'Recipes for tool-calling, multi-step reasoning, and error recovery', href: '/docs', type: 'guide' },
      { title: 'LLM Provider Comparison', description: 'Practical comparison of OpenAI, Anthropic, Google, and open-source models', href: '/blog', type: 'article' },
      { title: 'Production AI Checklist', description: 'Pre-launch checklist for AI-powered features', href: '/docs', type: 'tool' },
    ],
  },
]

export const COLOUR_MAP: Record<string, { card: string; icon: string; badge: string; accent: string; border: string }> = {
  cyan: {
    card: 'hover:border-cyan-500/40 hover:shadow-cyan-500/5',
    icon: 'bg-cyan-50 text-cyan-600',
    badge: 'bg-cyan-50 text-cyan-700',
    accent: 'text-cyan-600',
    border: 'border-cyan-200',
  },
  amber: {
    card: 'hover:border-amber-500/40 hover:shadow-amber-500/5',
    icon: 'bg-amber-50 text-amber-600',
    badge: 'bg-amber-50 text-amber-700',
    accent: 'text-amber-600',
    border: 'border-amber-200',
  },
  rose: {
    card: 'hover:border-rose-500/40 hover:shadow-rose-500/5',
    icon: 'bg-rose-50 text-rose-600',
    badge: 'bg-rose-50 text-rose-700',
    accent: 'text-rose-600',
    border: 'border-rose-200',
  },
  violet: {
    card: 'hover:border-violet-500/40 hover:shadow-violet-500/5',
    icon: 'bg-violet-50 text-violet-600',
    badge: 'bg-violet-50 text-violet-700',
    accent: 'text-violet-600',
    border: 'border-violet-200',
  },
  emerald: {
    card: 'hover:border-emerald-500/40 hover:shadow-emerald-500/5',
    icon: 'bg-emerald-50 text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700',
    accent: 'text-emerald-600',
    border: 'border-emerald-200',
  },
  sky: {
    card: 'hover:border-sky-500/40 hover:shadow-sky-500/5',
    icon: 'bg-sky-50 text-sky-600',
    badge: 'bg-sky-50 text-sky-700',
    accent: 'text-sky-600',
    border: 'border-sky-200',
  },
}

export function getCommunityById(id: string): Community | undefined {
  return COMMUNITIES.find((c) => c.id === id)
}
