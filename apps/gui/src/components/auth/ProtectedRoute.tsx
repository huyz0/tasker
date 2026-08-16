import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthSession } from '../../hooks/useAuthSession';
import { ensureDevSession } from '../../lib/devAuthBootstrap';
import { reportError } from '../../lib/errorReporter';

// M13-T12. Where mustChangePassword routes to — account settings, since
// that's the screen that can actually clear the flag (AuthService.setPassword).
const MUST_CHANGE_PASSWORD_TARGET = '/settings';

// Login enforcement is opt-in until Google OAuth credentials are configured
// for every environment; without this flag the app behaves exactly as before.
const REQUIRE_AUTH = import.meta.env.VITE_REQUIRE_AUTH === 'true';
const IS_DEV = import.meta.env.DEV;

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoading, authenticated, mustChangePassword } = useAuthSession();
  const location = useLocation();
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

  // M13-T10/T12. An admin-issued temporary password must actually be
  // changed, not merely accepted once to log in — redirect everywhere else
  // in the app to the one screen that can clear the flag. Checked against
  // the current path, not just rendered unconditionally, so the target
  // screen itself doesn't redirect to itself in a loop.
  if (mustChangePassword && location.pathname !== MUST_CHANGE_PASSWORD_TARGET) {
    return <Navigate to={MUST_CHANGE_PASSWORD_TARGET} replace />;
  }

  return <>{children}</>;
}
