import React, { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api.js';

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
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const session = await apiFetch('/api/auth/session') as {
          authenticated: boolean;
          user?: AuthenticatedUser;
        };
        if (session.authenticated && session.user) {
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

  const submitLabel = bootstrapRequired ? 'Create Admin Account' : 'Sign In';

  async function submit(): Promise<void> {
    setError(null);
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
      const endpoint = bootstrapRequired ? '/api/auth/bootstrap' : '/api/auth/login';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          ...(bootstrapRequired ? { bootstrapToken } : {}),
        }),
      }) as { user: AuthenticatedUser };
      onAuthenticated(response.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500 text-sm animate-pulse">Checking session…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {bootstrapRequired ? 'Bootstrap Admin Account' : 'Sign In'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {bootstrapRequired
            ? 'Create the first admin user to unlock the evaluator.'
            : 'Use your admin credentials to access ARIA Evaluator.'}
        </p>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Username</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={bootstrapRequired ? 'new-password' : 'current-password'}
            />
          </label>

          {bootstrapRequired && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Confirm Password</span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          className="mt-5 w-full rounded-md bg-[#0D2A66] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => { void submit(); }}
          disabled={submitting}
        >
          {submitting ? 'Please wait…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
