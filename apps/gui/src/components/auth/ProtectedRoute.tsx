import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthSession } from '../../hooks/useAuthSession';
import { ensureDevSession } from '../../lib/devAuthBootstrap';
import { reportError } from '../../lib/errorReporter';

// Login enforcement is opt-in until Google OAuth credentials are configured
// for every environment; without this flag the app behaves exactly as before.
const REQUIRE_AUTH = import.meta.env.VITE_REQUIRE_AUTH === 'true';
const IS_DEV = import.meta.env.DEV;

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoading, authenticated } = useAuthSession();
  const [devAttempted, setDevAttempted] = useState(false);

  // Every backend RPC now requires a session. Real login isn't practical to
  // complete automatically, so in dev only, establish one via the backend's
  // test-login endpoint the first time we see no active session.
  useEffect(() => {
    if (!IS_DEV || isLoading || authenticated || devAttempted) return;
    ensureDevSession()
      .catch((err) => reportError({ message: 'dev session bootstrap failed', err, severity: 'error' }))
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ['authSession'] });
        setDevAttempted(true);
      });
  }, [isLoading, authenticated, devAttempted, queryClient]);

  if (IS_DEV && !authenticated && !devAttempted) {
    return null;
  }

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
