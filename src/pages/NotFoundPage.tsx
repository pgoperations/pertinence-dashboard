import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-brand-50 px-4">
      <div className="text-center">
        <div className="font-heading text-3xl font-semibold text-brand-900">404</div>
        <p className="mt-2 text-sm text-brand-500">That page doesn't exist.</p>
        <Link
          to="/"
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
