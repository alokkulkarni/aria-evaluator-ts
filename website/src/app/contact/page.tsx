import { ContentPage } from '@/components/marketing/ContentPage'

export default function ContactPage() {
  return (
    <ContentPage
      label="Contact"
      title="Talk with the ARIA team"
      description="Reach out for product walkthroughs, enterprise pricing discussions, or help planning an evaluation program for your AI roadmap."
      highlights={[
        { title: 'Sales conversations', description: 'Explore pricing, dedicated infrastructure, and enterprise onboarding with our team.' },
        { title: 'Product walkthroughs', description: 'See how ARIA fits into your current model evaluation, review, and observability workflows.' },
        { title: 'Support requests', description: 'Email support@ariaeval.io for current customers needing help with onboarding or account setup.' },
      ]}
      primaryCta={{ href: 'mailto:support@ariaeval.io', label: 'Email support' }}
      secondaryCta={{ href: '/pricing', label: 'Explore plans' }}
    />
  )
}
