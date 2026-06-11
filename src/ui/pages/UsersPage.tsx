// src/ui/pages/UsersPage.tsx
// Enterprise user management page. Shows only on enterprise plans.

import React, { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api.js';
import { usePlanGate } from '../lib/plan-gate.js';

interface UserEntry {
  id: string;
  username: string;
  email: string | null;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
  authProvider: string;
}

interface UsersResponse {
  users: UserEntry[];
  total: number;
  maxUsers: number;
  upgradeUrl: string | null;
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  member: 'bg-slate-100 text-slate-700',
};

const PROVIDER_LABEL: Record<string, string> = {
  sso: 'SSO',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  password: 'Password',
};

export function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchUsers = () => {
    apiFetch<UsersResponse>('/api/users')
      .then(setData)
      .catch((err) => {
        if (err?.status === 403) {
          setError('enterprise_only');
        } else {
          setError('Failed to load users.');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    try {
      await apiFetch('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail('');
      fetchUsers();
    } catch (err: unknown) {
      setInviteError((err as { message?: string })?.message ?? 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    try {
      await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
      fetchUsers();
    } catch {
      // ignore
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (userId: string, role: 'admin' | 'member') => {
    try {
      await apiFetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      fetchUsers();
    } catch {
      // ignore
    }
  };

  const { plan } = usePlanGate();

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (error === 'enterprise_only') {
    const upgradeUrl = plan?.upgradeUrl ?? null;
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-4xl">🏢</p>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Enterprise plan required</h2>
          <p className="mt-2 text-sm text-slate-600">
            User management is available on Enterprise Starter and above.
            Upgrade your plan to invite team members.
          </p>
          {upgradeUrl && (
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              View plans →
            </a>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const { users = [], maxUsers = -1, upgradeUrl } = data ?? {};
  const atLimit = maxUsers > 0 && users.length >= maxUsers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-500">
            {users.length} user{users.length !== 1 ? 's' : ''}
            {maxUsers > 0 ? ` of ${maxUsers} allowed` : ''}
          </p>
        </div>
        {atLimit && upgradeUrl && (
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Upgrade to add more →
          </a>
        )}
      </div>

      {/* Invite form */}
      {!atLimit && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">Invite a team member</h2>
          <form onSubmit={handleInvite} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex-1" style={{ minWidth: '200px' }}>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
              <select
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </form>
          {inviteError && <p className="mt-2 text-xs text-red-600">{inviteError}</p>}
        </div>
      )}

      {/* Users table */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        {users.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Auth</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{u.username}</p>
                    {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as 'admin' | 'member')}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE[u.role] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {PROVIDER_LABEL[u.authProvider] ?? u.authProvider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.lastLoginAt
                      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(u.lastLoginAt))
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(u.id)}
                      disabled={removingId === u.id}
                      className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      {removingId === u.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
