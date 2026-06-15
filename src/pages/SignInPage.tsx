import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, IDLE_SIGNOUT_FLAG } from '../hooks/useAuth';
import { IconEye, IconEyeOff, IconCheck } from '../components/icons';

type LocationState = { from?: string; resetSuccess?: boolean } | null;

type Mode = 'sign-in' | 'reset-request';

export default function SignInPage() {
  const { status, signIn, requestPasswordReset } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Read-and-clear the inactivity marker once on mount so the banner shows only
  // for the sign-out that triggered it, not on every later visit to this page.
  const [idleSignedOut] = useState(() => {
    try {
      if (sessionStorage.getItem(IDLE_SIGNOUT_FLAG) === '1') {
        sessionStorage.removeItem(IDLE_SIGNOUT_FLAG);
        return true;
      }
    } catch {
      /* storage unavailable */
    }
    return false;
  });

  if (status === 'signed-in') {
    const from = (location.state as LocationState)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const justReset = (location.state as LocationState)?.resetSuccess ?? false;

  async function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  }

  async function onRequestReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await requestPasswordReset(email.trim());
    setSubmitting(false);
    // Don't leak whether the email exists — show the same confirmation either way.
    if (err) setError(err);
    else setResetSent(true);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSent(false);
    setPassword('');
  }

  return (
    <main className="min-h-screen grid place-items-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="Pertinence Group"
            className="h-16 w-16 object-contain"
            width={64}
            height={64}
          />
          <div className="mt-4 font-heading text-xl font-semibold text-brand-900">
            Pertinence Dashboard
          </div>
          <p className="mt-1 text-sm text-brand-500">
            {mode === 'sign-in' ? 'Sign in to continue.' : 'Reset your password.'}
          </p>
        </div>

        {idleSignedOut && mode === 'sign-in' && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
            </svg>
            <span>You were signed out after 15 minutes of inactivity. Please sign in again.</span>
          </div>
        )}

        {justReset && mode === 'sign-in' && (
          <div
            role="status"
            className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-emphasis"
          >
            <IconCheck className="h-4 w-4 shrink-0" />
            <span>Password updated. Sign in with your new password.</span>
          </div>
        )}

        {mode === 'sign-in' ? (
          <form
            onSubmit={onSignIn}
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
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-brand-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => switchMode('reset-request')}
                  className="text-xs font-medium text-accent-emphasis hover:text-accent-hover focus:outline-none focus:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2.5 pr-11 text-base text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-brand-500 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded-r-lg cursor-pointer"
                >
                  {showPassword ? (
                    <IconEyeOff className="h-5 w-5" />
                  ) : (
                    <IconEye className="h-5 w-5" />
                  )}
                </button>
              </div>
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
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-xs text-brand-500 text-center">
              Accounts are admin-provisioned. Contact your admin if you need access.
            </p>
          </form>
        ) : (
          <form
            onSubmit={onRequestReset}
            className="bg-white rounded-2xl shadow-card border border-brand-200 p-6 space-y-5"
          >
            {resetSent ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent-emphasis">
                  <IconCheck className="h-6 w-6" />
                </div>
                <p className="text-sm text-brand-700">
                  If an account exists for <span className="font-medium">{email.trim()}</span>,
                  a password-reset link is on its way. Check your inbox and follow the link to
                  set a new password.
                </p>
                <button
                  type="button"
                  onClick={() => switchMode('sign-in')}
                  className="w-full rounded-lg border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 cursor-pointer"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-brand-600">
                  Enter your account email and we'll send you a link to reset your password.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="block text-sm font-medium text-brand-700">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2.5 text-base text-brand-900 placeholder-brand-400 focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="you@pertinencegroup.com"
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
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('sign-in')}
                  className="w-full text-center text-xs font-medium text-brand-500 hover:text-brand-700 focus:outline-none focus:underline cursor-pointer"
                >
                  Back to sign in
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
