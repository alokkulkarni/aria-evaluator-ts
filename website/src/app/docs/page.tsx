import { ContentPage } from '@/components/marketing/ContentPage'

export default function DocsPage() {
  return (
    <ContentPage
      label="Docs"
      title="Guides for secure, observable AI evaluation"
      description="Explore setup guides, deployment playbooks, and governance patterns for building enterprise AI evaluation workflows with ARIA."
      highlights={[
        { title: 'Deployment guides', description: 'Follow production-ready steps for regional workspace setup, access control, and onboarding.' },
        { title: 'Evaluation playbooks', description: 'Learn how to structure adversarial tests, baseline checks, and policy validation for every release.' },
        { title: 'Observability reference', description: 'Track runs, usage, traces, and incidents with a workflow tailored to AI safety teams.' },
      ]}
    />
  )
}
