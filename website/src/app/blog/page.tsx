import { ContentPage } from '@/components/marketing/ContentPage'

export default function BlogPage() {
  return (
    <ContentPage
      label="Blog"
      title="Insights on AI safety, evaluation, and platform delivery"
      description="Read how enterprise teams are approaching red-teaming, evaluation observability, and multi-model operations in fast-moving AI environments."
      highlights={[
        { title: 'Platform engineering', description: 'Patterns for bringing repeatable governance and deployment controls into AI delivery workflows.' },
        { title: 'Red-team programs', description: 'Approaches for structuring adversarial scenarios and measuring model resilience over time.' },
        { title: 'Observability practices', description: 'Lessons from teams instrumenting AI evaluations with actionable metrics and trace data.' },
      ]}
    />
  )
}
