import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50 text-brand-500">
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (status === 'signed-out') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
