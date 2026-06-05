import { ContentPage } from '@/components/marketing/ContentPage'

export default function CookiesPage() {
  return (
    <ContentPage
      label="Legal"
      title="Cookie policy"
      description="ARIA uses a focused set of browser technologies to support authentication, performance, and secure session management across the application."
      highlights={[
        { title: 'Essential authentication', description: 'Session handling keeps workspace access secure and consistent across product experiences.' },
        { title: 'Performance optimization', description: 'Limited analytics and performance signals help us improve onboarding and operational reliability.' },
        { title: 'Control and transparency', description: 'Customers can review implementation details and align browser policies with internal requirements.' },
      ]}
    />
  )
}
