import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthSession } from '../../hooks/useAuthSession';

// Login enforcement is opt-in until Google OAuth credentials are configured
// for every environment; without this flag the app behaves exactly as before.
const REQUIRE_AUTH = import.meta.env.VITE_REQUIRE_AUTH === 'true';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, authenticated } = useAuthSession();

  if (!REQUIRE_AUTH) {
    return <>{children}</>;
  }

  if (isLoading) {
    return null;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
