import { useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../src/components/layout/AppShell';
import { useSummaryDrafts } from '../src/features/Tasks/summaryDrafts';
import { WorkbenchPreview } from './WorkbenchPreview';

/** Scope the single HTTP failure to this preview; never call a real logout. */
export function LogoutPreview({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const original = globalThis.fetch;
    const fixture: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      return url.pathname === '/api/auth/logout'
        ? Promise.resolve(new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }))
        : original(input, init);
    };
    globalThis.fetch = fixture;
    useSummaryDrafts.getState().setAccount('logout-story-user');
    setReady(true);
    return () => { if (globalThis.fetch === fixture) globalThis.fetch = original; useSummaryDrafts.getState().endSession(); };
  }, []);
  return ready ? <WorkbenchPreview drawerOpen><AppShell>{children}</AppShell></WorkbenchPreview> : null;
}
