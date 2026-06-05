import { ContentPage } from '@/components/marketing/ContentPage'

export default function PrivacyPage() {
  return (
    <ContentPage
      label="Legal"
      title="Privacy at ARIA Evaluator"
      description="We design ARIA to support regional deployment, workspace isolation, and the operational safeguards enterprise teams expect from modern AI tooling."
      highlights={[
        { title: 'Data minimization', description: 'Only the data required to provision and operate your workspace is processed through the platform.' },
        { title: 'Regional awareness', description: 'Choose where your workspace is hosted to align with internal and regulatory expectations.' },
        { title: 'Customer controls', description: 'Workspace-level governance helps teams manage access, retention, and operational review processes.' },
      ]}
    />
  )
}
