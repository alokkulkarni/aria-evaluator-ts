import { ContentPage } from '@/components/marketing/ContentPage'

export default function AboutPage() {
  return (
    <ContentPage
      label="Company"
      title="We help teams ship safer AI"
      description="ARIA Evaluator exists to give modern engineering, security, and product teams a faster path from experimentation to enterprise-grade AI delivery."
      highlights={[
        { title: 'Operator-first design', description: 'Our workflows are built for the people responsible for reliability, compliance, and incident response.' },
        { title: 'Evaluation at scale', description: 'We focus on turning complex AI safety checks into repeatable, team-ready operating systems.' },
        { title: 'Built for global teams', description: 'Regional deployment and observability are core product features, not afterthoughts.' },
      ]}
    />
  )
}
