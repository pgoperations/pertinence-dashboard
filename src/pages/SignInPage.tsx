import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

type LocationState = { from?: string } | null;

export default function SignInPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'signed-in') {
    const from = (location.state as LocationState)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <main className="min-h-screen grid place-items-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-heading text-xl font-semibold text-brand-900">Pertinence Dashboard</div>
          <p className="mt-1 text-sm text-brand-500">Sign in to continue.</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-2xl shadow-card border border-brand-200 p-6 space-y-5"
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-brand-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2.5 text-base text-brand-900 placeholder-brand-400 focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="you@pertinencegroup.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-brand-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2.5 text-base text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-brand-500 text-center">
            Accounts are admin-provisioned. Contact your admin if you need access.
          </p>
        </form>
      </div>
    </main>
  );
}
