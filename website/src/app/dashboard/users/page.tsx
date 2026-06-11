'use client'

import { Trash2, UserPlus } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useEffect, useState, type FormEvent } from 'react'

import { apiFetch } from '@/lib/api'

interface TeamMember {
  id: string
  name: string | null
  email: string
  role: 'owner' | 'admin' | 'member'
  status: string
  invitedAt?: string
}

const ENTERPRISE_PLANS = ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited']

export default function UsersPage() {
  const { data: session, status: sessionStatus } = useSession()
  const authToken = session?.user?.accessToken
  const userPlan = session?.user?.plan as string | undefined
  const isEnterprise = userPlan ? ENTERPRISE_PLANS.includes(userPlan) : false

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const canManage = session?.user?.role === 'owner' || session?.user?.role === 'admin'

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !authToken) {
      setLoading(false)
      return
    }
    apiFetch<TeamMember[]>('/tenant/users', { authToken })
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [authToken, sessionStatus])

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!authToken || !inviteEmail) return
    setInviting(true)
    setInviteError(null)
    try {
      await apiFetch('/tenant/users/invite', {
        method: 'POST',
        authToken,
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const updated = await apiFetch<TeamMember[]>('/tenant/users', { authToken })
      setMembers(updated)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (userId: string) => {
    if (!authToken) return
    setRemovingId(userId)
    try {
      await apiFetch(`/tenant/users/${userId}`, { method: 'DELETE', authToken })
      setMembers((prev) => prev.filter((m) => m.id !== userId))
    } catch {
      // ignore
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><p className="text-sm text-slate-400">Loading…</p></div>
  }

  return (
    <div className="space-y-6">
      <section className="page-hero">
        <div className="space-y-3">
          <p className="page-hero-label">Workspace</p>
          <h1 className="page-hero-title">Team members</h1>
          <p className="page-hero-sub max-w-2xl">Manage who has access to your ARIA workspace.</p>
        </div>
      </section>

      {!isEnterprise && (
        <section className="card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upgrade to add team members</h2>
            <p className="mt-1 text-sm text-slate-600">Team collaboration is available on Enterprise plans. Upgrade to invite colleagues.</p>
          </div>
          <a href="/pricing" className="btn-primary rounded-xl">View plans →</a>
        </section>
      )}

      {isEnterprise && canManage && (
        <section className="card space-y-4">
          <div>
            <p className="section-label">Invite</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Invite a team member</h2>
          </div>
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label htmlFor="invite-email" className="text-sm font-medium text-slate-700">Email address</label>
              <input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="invite-role" className="text-sm font-medium text-slate-700">Role</label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn-primary rounded-xl" disabled={inviting}>
              <UserPlus className="h-4 w-4" />
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </form>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
        </section>
      )}

      <section className="card space-y-4">
        <div>
          <p className="section-label">Members</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Current team ({members.length})</h2>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                    {(member.name ?? member.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{member.name ?? member.email}</p>
                    {member.name && <p className="truncate text-xs text-slate-500">{member.email}</p>}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="badge-info text-xs">{member.role}</span>
                  <span className={`text-xs ${member.status === 'active' ? 'badge-active' : 'badge-pending'}`}>{member.status}</span>
                  {canManage && member.role !== 'owner' && member.id !== session?.user?.id && (
                    <button
                      type="button"
                      onClick={() => handleRemove(member.id)}
                      disabled={removingId === member.id}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
