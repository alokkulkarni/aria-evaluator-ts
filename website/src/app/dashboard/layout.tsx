import { auth } from '@/auth'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    redirect('/sign-in')
  }

  return (
    <div className="max-w-8xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <DashboardNav user={session.user ?? {}} />
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  )
}
