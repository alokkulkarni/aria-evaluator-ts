import { ContentPage } from '@/components/marketing/ContentPage'

export default function TermsPage() {
  return (
    <ContentPage
      label="Legal"
      title="Terms for using ARIA Evaluator"
      description="Our terms outline the shared responsibilities, acceptable usage, and service expectations for teams operating ARIA in production settings."
      highlights={[
        { title: 'Service usage', description: 'Teams are expected to use ARIA for lawful evaluation, governance, and security workflows.' },
        { title: 'Operational responsibilities', description: 'Customers remain responsible for the prompts, models, and business decisions connected to their workspaces.' },
        { title: 'Support commitments', description: 'Support levels vary by plan, with enterprise tiers unlocking advanced onboarding and service expectations.' },
      ]}
    />
  )
}
