import { redirect } from 'next/navigation'

export default function DashboardLayout() {
  redirect('/api/launch-instance')
}
