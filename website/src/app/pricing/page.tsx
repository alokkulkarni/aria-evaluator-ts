import { PricingTable } from '@/components/marketing/PricingTable'
import { CtaBand, PageHeader, Section } from '@/components/marketing/ui'

export default function PricingPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Pricing"
        title="Transparent pricing for every stage of AI evaluation"
        description="Start with a lightweight sandbox, expand into regional team workspaces, or move to dedicated enterprise infrastructure with tailored controls."
        pills={['Free tier available', 'Annual savings', 'Dedicated enterprise options']}
      />

      <Section className="pt-10">
        <PricingTable />
      </Section>

      <CtaBand
        eyebrow="Still deciding?"
        title="Talk to us about the right fit"
        description="We'll help you map plan limits, regions, and compliance needs to your evaluation programme."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/contact', label: 'Contact sales' }}
      />
    </div>
  )
}
