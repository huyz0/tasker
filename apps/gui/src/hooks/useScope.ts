import { Code, ConnectError } from '@connectrpc/connect';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLayoutStore } from '../store/layout';

/**
 * The active organization and project, carried in the URL (M28, ADR-0025).
 *
 * Before this, scope lived only in the layout store — not persisted, not in
 * the URL — so a bookmark recorded the screen but not the project, and the
 * three deep-linkable routes resolved against whatever the switcher happened
 * to auto-select. A task link saved from one project could open under
 * another.
 *
 * Query parameters rather than path segments because `AppShell` sits *above*
 * the inner `<Routes>` and holds the app-wide event subscription: it can call
 * `useSearchParams`, but never `useParams`. ADR-0025 has the rest of the
 * measured cost.
 *
 * **The URL is the source of truth; the store is the read surface.** Twenty
 * component sites read scope from the store and are deliberately untouched —
 * rewriting them would change every query key in the application for no
 * user-visible gain. `useScopeSync` is the one place the two meet, and it
 * flows in one direction only: URL → store. Anything that *changes* scope
 * writes the URL and lets it flow back.
 */

const ORG_PARAM = 'org';
const PROJECT_PARAM = 'project';

export interface Scope {
  orgId: string;
  projectId: string;
}

/**
 * Scope as the URL currently states it.
 *
 * Absent reads as `''`, not `undefined`: the store's own initial value is
 * `''` and every `enabled:` guard in the application tests falsiness, so one
 * shape of "no scope" keeps those call sites honest.
 */
export function useScope(): Scope {
  const [params] = useSearchParams();
  return {
    orgId: params.get(ORG_PARAM) ?? '',
    projectId: params.get(PROJECT_PARAM) ?? '',
  };
}

/**
 * Change scope by navigating.
 *
 * A key named with an empty value is *removed* rather than written blank —
 * `?project=` would be a scope that reads as present. A key not named at all
 * is left alone, so setting an org does not disturb a project and neither
 * disturbs a screen-local parameter like Bin's `?tab=`.
 *
 * `replace` exists for the switcher's auto-select: filling in a scope the
 * user never chose should not leave the scopeless URL sitting in history for
 * the Back button to return to.
 */
/**
 * Where the user is *now*, not where they were at the last render.
 *
 * A render-time location is not enough: a sidebar click commits to history
 * synchronously, but React re-renders a tick later, and the project
 * auto-select measured landing 11ms after a click — inside that gap — and
 * wrote the scope onto the page the user had just left. When the browser's
 * history belongs to the router (BrowserRouter stamps a `key` into
 * `history.state`), `window.location` is the live truth. Otherwise — a
 * MemoryRouter, as in tests — the render-time location is the only one.
 */
function currentLocation(rendered: { pathname: string; search: string; hash: string }) {
  if (typeof window !== 'undefined' && window.history.state && 'key' in window.history.state) {
    const { pathname, search, hash } = window.location;
    return { pathname, search, hash };
  }
  return rendered;
}

export function useSetScope() {
  // Stable identity, deliberately: the effects that correct scope
  // (`Organizations`' snap-to-first, `Projects`' archive-clear) list this as a
  // dependency, and a callback that changed on every navigation re-ran them
  // after every URL change — an unbounded loop where the correction's own
  // condition stayed true.
  //
  // It reads the live location (see `currentLocation`) and navigates to an
  // absolute path. `setSearchParams` did neither: its "?…" navigation resolved against
  // the pathname the caller was rendered on, so the switcher's auto-select,
  // landing after the user had already clicked a sidebar link, sent them back
  // to the page they had just left.
  const navigate = useNavigate();
  const location = useLocation();
  const latest = useRef(location);
  latest.current = location;
  return useCallback(
    (next: Partial<Scope>, options?: { replace?: boolean; intent?: 'selection' | 'normalization' }) => {
      const { pathname, search, hash } = currentLocation(latest.current);
      const updated = new URLSearchParams(search);
      const apply = (key: string, value: string | undefined) => {
        if (value === undefined) return;
        if (value) updated.set(key, value);
        else updated.delete(key);
      };
      apply(ORG_PARAM, next.orgId);
      apply(PROJECT_PARAM, next.projectId);
      const before = new URLSearchParams(search);
      const changed = before.get(ORG_PARAM) !== updated.get(ORG_PARAM)
        || before.get(PROJECT_PARAM) !== updated.get(PROJECT_PARAM);
      if (!changed) return;
      // Existing replace callers fill/correct scope automatically. Explicit
      // selection leaves incompatible detail in the same navigation, rather
      // than relying on a later store effect that also closes deep links.
      const intent = options?.intent ?? (options?.replace ? 'normalization' : 'selection');
      let destination = pathname;
      if (intent === 'selection') {
        const detail = /^\/(tasks|artifacts)\/[^/]+\/?$/.exec(pathname);
        if (detail) destination = `/${detail[1]}`;
        if (pathname === '/memory' || pathname.startsWith('/memory/')) {
          destination = '/memory';
          if (next.projectId) updated.set('scope', 'project');
          else if (updated.get('scope') === 'team') updated.set('scope', 'organization');
        }
      }
      const query = updated.toString();
      navigate({ pathname: destination, search: query ? `?${query}` : '', hash }, { replace: options?.replace ?? false });
    },
    // Empty on purpose: the target is absolute and read from the ref, so the
    // first render's `navigate` is as correct as any later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

/**
 * Feed the URL's scope into the store, once, for the whole application.
 *
 * Called from `AppShell` — the only component guaranteed mounted for the
 * session, and already the holder of the single live-event subscription.
 *
 * Entity readers wait for both the URL and this store to match the authorized
 * owner before exposing content/actions. Deliberate selection is encoded by
 * the URL writer in one navigation; hydration and normalization therefore
 * never masquerade as a new selection or dismiss a direct-linked resource.
 */
export function useScopeSync(): void {
  const { orgId, projectId } = useScope();
  const setActiveOrgId = useLayoutStore((s) => s.setActiveOrgId);
  const setActiveProjectId = useLayoutStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveOrgId(orgId);
  }, [orgId, setActiveOrgId]);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);
}

/** Normalize an entity entry from a successful authorized read, preserving Back. */
export function useCanonicalResourceScope(
  resourceKey: string | null,
  owner: (Scope & { memoryTier?: 'project' | 'organization' | 'team' }) | undefined,
  readSucceeded: boolean,
  readError?: unknown,
): boolean {
  const location = useLocation();
  const navigate = useNavigate();
  const activeOrgId = useLayoutStore(s => s.activeOrgId);
  const activeProjectId = useLayoutStore(s => s.activeProjectId);
  const latest = useRef(location);
  latest.current = location;
  const failureCode = readError ? ConnectError.from(readError).code : undefined;
  const accessUnavailable = failureCode === Code.PermissionDenied || failureCode === Code.Unauthenticated || failureCode === Code.NotFound;
  const accepted = useRef<{ key: string | null; owner?: typeof owner }>({ key: null });
  if (accepted.current.key !== resourceKey) accepted.current = { key: resourceKey };
  // A known access loss revokes previous acceptance until a fresh read wins.
  // A later network error must never resurrect the old accepted owner.
  if (accessUnavailable) accepted.current.owner = undefined;
  if (resourceKey && readSucceeded && !accessUnavailable && owner?.orgId
    && (owner.projectId || owner.memoryTier === 'organization' || owner.memoryTier === 'team')) {
    accepted.current.owner = owner;
  }
  const resolved = accepted.current.owner;
  const params = new URLSearchParams(location.search);
  const matches = !!resolved && params.get(ORG_PARAM) === resolved.orgId
    && (params.get(PROJECT_PARAM) ?? '') === resolved.projectId
    && (!resolved.memoryTier || params.get('scope') === resolved.memoryTier);

  useEffect(() => {
    if (!resourceKey || !readSucceeded || !resolved || matches) return;
    const current = currentLocation(latest.current);
    if (current.pathname !== location.pathname || current.search !== location.search) return;
    const next = new URLSearchParams(current.search);
    next.set(ORG_PARAM, resolved.orgId);
    if (resolved.projectId) next.set(PROJECT_PARAM, resolved.projectId);
    else next.delete(PROJECT_PARAM);
    if (resolved.memoryTier) next.set('scope', resolved.memoryTier);
    navigate({ pathname: current.pathname, search: next.toString(), hash: current.hash }, { replace: true });
  }, [resourceKey, readSucceeded, resolved, matches, location.pathname, location.search, navigate]);

  // Keep an already-resolved editor mounted during background reads. A new
  // entity must earn its own authorized owner before content/actions appear.
  return !resourceKey || (!accessUnavailable && matches && activeOrgId === resolved?.orgId && activeProjectId === resolved?.projectId);
}

/**
 * Put the current scope onto a path, for links and for navigations.
 *
 * Carries *only* scope. A screen-local parameter belongs to the screen that
 * set it, so following a link from Bin to Reports must not take `?tab=`
 * along.
 */
export function useScopedTo() {
  const { orgId, projectId } = useScope();
  return useCallback(
    (to: string): string => {
      const params = new URLSearchParams();
      if (orgId) params.set(ORG_PARAM, orgId);
      if (projectId) params.set(PROJECT_PARAM, projectId);
      const query = params.toString();
      return query ? `${to}?${query}` : to;
    },
    [orgId, projectId],
  );
}
