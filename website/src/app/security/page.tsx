import { ContentPage } from '@/components/marketing/ContentPage'

export default function SecurityPage() {
  return (
    <ContentPage
      label="Security"
      title="Security controls built for enterprise AI teams"
      description="ARIA combines dedicated tenancy, regional deployment, auditability, and controlled workspace access to protect sensitive evaluation data."
      highlights={[
        { title: 'Dedicated tenancy', description: 'Keep your evaluation workloads isolated with dedicated infrastructure and private regional deployments.' },
        { title: 'Governed access', description: 'Support secure collaboration with role-based access, approval workflows, and audit-friendly workspace patterns.' },
        { title: 'Compliance readiness', description: 'Operate with data residency awareness and controls aligned to modern enterprise requirements.' },
      ]}
    />
  )
}
