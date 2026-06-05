import { ContentPage } from '@/components/marketing/ContentPage'

export default function CareersPage() {
  return (
    <ContentPage
      label="Careers"
      title="Build the control plane for safe AI delivery"
      description="Join a team focused on making enterprise AI evaluation more secure, observable, and operationally effective for builders everywhere."
      highlights={[
        { title: 'Product and platform', description: 'Work across UX, platform engineering, and infrastructure to simplify complex enterprise AI workflows.' },
        { title: 'Security and governance', description: 'Shape the guardrails, policies, and review systems that help teams move fast without losing trust.' },
        { title: 'Remote-friendly collaboration', description: 'Partner closely across functions with a product mindset and ownership over the full customer experience.' },
      ]}
    />
  )
}
