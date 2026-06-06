import React, { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api.js';
import { AppLogoIcon } from '../components/icons.js';

interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
}

interface AuthPageProps {
  onAuthenticated: (user: AuthenticatedUser) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [loading, setLoading] = useState(true);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [bootstrapTokenRequired, setBootstrapTokenRequired] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const session = await apiFetch('/api/auth/session') as {
          authenticated: boolean;
          requirePasswordChange?: boolean;
          user?: AuthenticatedUser;
        };
        if (session.authenticated && session.user) {
          if (session.requirePasswordChange) {
            setPasswordChangeRequired(true);
            setUsername(session.user.username);
            setBootstrapRequired(false);
            setBootstrapTokenRequired(false);
            setLoading(false);
            return;
          }
          onAuthenticated(session.user);
          return;
        }
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) {
          setError((err as Error).message);
          setLoading(false);
          return;
        }
      }

      try {
        const bootstrap = await apiFetch('/api/auth/bootstrap-status') as {
          bootstrapRequired: boolean;
          tokenRequired?: boolean;
        };
        setBootstrapRequired(bootstrap.bootstrapRequired);
        setBootstrapTokenRequired(!!bootstrap.tokenRequired);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [onAuthenticated]);

  const submitLabel = passwordChangeRequired ? 'Change Password' : (bootstrapRequired ? 'Create Admin Account' : 'Sign In');

  async function submit(): Promise<void> {
    setError(null);

    if (passwordChangeRequired) {
      if (!password) {
        setError('Current password is required.');
        return;
      }
      if (!newPassword) {
        setError('New password is required.');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setError('New passwords do not match.');
        return;
      }
    }

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (bootstrapRequired && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (bootstrapRequired && bootstrapTokenRequired && !bootstrapToken.trim()) {
      setError('Bootstrap token is required.');
      return;
    }

    setSubmitting(true);
    try {
      const response = passwordChangeRequired
        ? await apiFetch('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: password,
            newPassword,
          }),
        }) as { user: AuthenticatedUser }
        : await apiFetch(bootstrapRequired ? '/api/auth/bootstrap' : '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            ...(bootstrapRequired ? { bootstrapToken } : {}),
          }),
        }) as { user: AuthenticatedUser; requirePasswordChange?: boolean };

      if (!passwordChangeRequired && response.requirePasswordChange) {
        setPasswordChangeRequired(true);
        setBootstrapRequired(false);
        setBootstrapTokenRequired(false);
        setNewPassword('');
        setConfirmNewPassword('');
        setError(null);
        return;
      }

      onAuthenticated(response.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_28%),linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="text-sm text-slate-500 animate-pulse">Checking session…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_28%),linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur lg:grid-cols-2">
        <div className="flex flex-col justify-between bg-[linear-gradient(160deg,#0b1f4d_0%,#102b66_55%,#0f172a_100%)] p-8 text-white sm:p-10">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <AppLogoIcon className="h-12 w-12" />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">ARIA Evaluator</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Enterprise-grade evaluation workspace</h1>
              </div>
            </div>

            <p className="max-w-md text-sm leading-6 text-slate-200/80">
              Monitor runs, review agent quality, and share reports with a polished dashboard built for teams that need confidence at a glance.
            </p>
          </div>

          <div className="grid gap-3 pt-10 sm:grid-cols-3">
            {[
              ['Secure access', 'Session-aware authentication and admin bootstrap flow.'],
              ['Operational clarity', 'Runs, transcripts, reports, and observability in one place.'],
              ['Executive-ready', 'A cleaner interface for stakeholder demos and day-to-day use.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-200/75">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center p-6 sm:p-8 lg:p-10">
          <div className="w-full">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                {passwordChangeRequired ? 'Rotate Admin Password' : (bootstrapRequired ? 'Bootstrap Admin Account' : 'Sign In')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {passwordChangeRequired
                  ? 'Use the temporary password once, then set a new permanent admin password.'
                  : bootstrapRequired
                  ? 'Create the first admin user to unlock the evaluator.'
                  : 'Use your admin credentials to access ARIA Evaluator.'}
              </p>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Username</span>
                <input
                  className="mt-1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={passwordChangeRequired}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">{passwordChangeRequired ? 'Current Password' : 'Password'}</span>
                <input
                  type="password"
                  className="mt-1"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={passwordChangeRequired ? 'current-password' : (bootstrapRequired ? 'new-password' : 'current-password')}
                />
              </label>

              {passwordChangeRequired ? (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">New Password</span>
                    <input
                      type="password"
                      className="mt-1"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Confirm New Password</span>
                    <input
                      type="password"
                      className="mt-1"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                </>
              ) : bootstrapRequired && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Confirm Password</span>
                    <input
                      type="password"
                      className="mt-1"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                  {bootstrapTokenRequired && (
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Bootstrap Token</span>
                      <input
                        type="password"
                        className="mt-1"
                        value={bootstrapToken}
                        onChange={(e) => setBootstrapToken(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  )}
                </>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <button
              className="btn-primary mt-6 w-full justify-center rounded-xl px-4 py-3 text-sm font-semibold"
              onClick={() => { void submit(); }}
              disabled={submitting}
            >
              {submitting ? 'Please wait…' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
