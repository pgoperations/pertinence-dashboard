import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { IconEye, IconEyeOff } from '../components/icons';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const { status, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: err } = await updatePassword(password);
    if (err) {
      setSubmitting(false);
      setError(err);
      return;
    }
    // Sign the recovery session out so the user re-authenticates with the new
    // password — confirms it works and avoids leaving a recovery session live.
    await signOut();
    navigate('/sign-in', { replace: true, state: { resetSuccess: true } });
  }

  return (
    <main className="min-h-screen grid place-items-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Pertinence Group"
            className="h-16 w-16 object-contain"
            width={64}
            height={64}
          />
          <div className="mt-4 font-heading text-xl font-semibold text-brand-900">
            Set a new password
          </div>
        </div>

        {status === 'loading' ? (
          <div className="rounded-2xl border border-brand-200 bg-white p-6 text-center text-sm text-brand-500">
            Verifying your reset link…
          </div>
        ) : status === 'signed-out' ? (
          <div className="rounded-2xl border border-brand-200 bg-white p-6 text-center space-y-4">
            <p className="text-sm text-brand-700">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <button
              type="button"
              onClick={() => navigate('/sign-in', { replace: true })}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover cursor-pointer"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="bg-white rounded-2xl shadow-card border border-brand-200 p-6 space-y-5"
          >
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-sm font-medium text-brand-700">
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2.5 pr-11 text-base text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-brand-500 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded-r-lg cursor-pointer"
                >
                  {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-brand-700">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
