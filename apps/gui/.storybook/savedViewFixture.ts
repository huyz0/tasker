import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';
import { useLayoutStore } from '../src/store/layout';
import type { ViewScreen } from '../src/components/SavedViews/definition';
export type SavedViewState = 'populated' | 'empty' | 'loading' | 'error' | 'denied' | 'read-only' | 'restricted-project' | 'obsolete' | 'invalid' | 'long' | 'duplicate' | 'pending' | 'save-denied' | 'beyond-page' | 'open-denied' | 'signed-out' | 'auth-loading' | 'rename-error' | 'delete-error' | 'session-error' | 'empty-page' | 'old-server' | 'edit-revoked';
interface FixtureRow { id: string; orgId: string; projectId: string; ownerUserId: string; name: string; screen: string; visibility: string; canEdit: boolean; projectName?: string; unavailableReason?: string; }
interface FixtureBody { viewId?: string; name?: string; projectId?: string; visibility?: string; page?: { filter?: string; cursor?: string; limit?: number }; }
/** Synthetic serialized responses for the real client, isolated from authenticated services. */
export function savedViewFixture(state: SavedViewState = 'populated', screen: ViewScreen = 'tasks') {
  const previous = useLayoutStore.getState();useLayoutStore.setState({ activeOrgId: 'org-storybook', activeProjectId: 'project-storybook' });
  const nativeFetch = globalThis.fetch.bind(globalThis), canShare = state !== 'read-only';
  let revoked = false;
  let views: FixtureRow[] = (state === 'empty' || state === 'empty-page') ? [] : ['personal', 'organization'].flatMap(visibility => Array.from({ length: state === 'beyond-page' ? 121 : 1 }, (_, index) => ({
    id: `${visibility}-${index}`, orgId: 'org-storybook', projectId: 'project-storybook', ownerUserId: visibility === 'personal' ? 'user-storybook' : 'another-user',
    name: state === 'long' && visibility === 'personal' ? `Release${'W'.repeat(121)}` : state === 'beyond-page' ? `${visibility} release ${String(index + 1).padStart(3, '0')}` : visibility === 'personal' ? 'My release review' : 'Organization release review',
    screen, visibility, canEdit: visibility === 'personal' || canShare,
    ...(state !== 'restricted-project' && state !== 'obsolete' ? { projectName: 'Release planning' } : {}),
    ...(state === 'obsolete' ? { unavailableReason: 'project_unavailable' } : state === 'invalid' ? { unavailableReason: 'definition_invalid' } : {}),
  })));
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fail = (code: string, message: string, status = 400) => json({ code, message }, status);
    const hold = () => new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    if (request.url.endsWith('/api/auth/session')) return state === 'session-error' ? fail('unavailable', 'Session checks are offline.', 503) : state === 'auth-loading' ? hold() : json({ authenticated: state !== 'signed-out', userId: state === 'signed-out' ? null : 'user-storybook' });
    if (request.url.endsWith('/api/client-errors')) return json({});
    const body = await request.json() as FixtureBody;
    if (request.url.endsWith('/ListSavedViews')) {
      if (state === 'loading') return hold();if (state === 'error') return fail('unavailable', 'Saved names are temporarily offline.', 503);if (state === 'denied') return fail('permission_denied', 'Organization access was removed.', 403);
      const filtered = views.filter(row => row.visibility === body.visibility && (!body.page?.filter || row.name.toLowerCase().includes(body.page.filter.toLowerCase())));
      const start = Number(body.page?.cursor || 0), next = start + Math.min(body.page?.limit || 20, 100);
      return json({ views: filtered.slice(start, next).map(row => ({ ...row, canEdit: row.visibility === 'personal' || (canShare && !revoked) })), ...(state !== 'old-server' ? { canCreateShared: canShare && !revoked } : {}), page: { totalCount: state === 'empty-page' ? '40' : String(filtered.length), ...(next < filtered.length ? { nextCursor: String(next) } : {}) } });
    }
    const row = views.find(row => row.id === body.viewId);
    if (request.url.endsWith('/GetSavedView')) {
      if (!row) return fail('not_found', 'The saved view is no longer available.', 404);
      if (row.unavailableReason) return fail('failed_precondition', 'The saved project or definition is unavailable.');
      if (state === 'open-denied') return fail('permission_denied', 'Current source access was removed.', 403);
      return json({ view: row, definition: { version: 1, screen, ...(screen === 'tasks' ? { tasks: { viewMode: 'table', search: 'release', priority: 0, ready: false } } : { reports: { windowDays: 90 } }) } });
    }
    if (request.url.endsWith('/CreateSavedView')) {
      if (state === 'pending') return hold();if (state === 'duplicate') return fail('already_exists', 'A saved view with this name already exists.');if (state === 'save-denied') return fail('permission_denied', 'Current administration or source access was removed.', 403);
      const added: FixtureRow = { id: `new-${views.length}`, orgId: 'org-storybook', projectId: body.projectId || '', ownerUserId: 'user-storybook', name: body.name || '', screen, visibility: body.visibility || 'personal', canEdit: true, projectName: 'Release planning' };views.push(added);return json({ view: added });
    }
    if (request.url.endsWith('/RenameSavedView')) {
      if (state === 'edit-revoked' && row?.visibility === 'organization') { revoked = true;return fail('permission_denied', 'Administration was revoked.', 403); }
      if (state === 'rename-error') return fail('already_exists', 'A saved view with this name already exists.');if (!row) return fail('not_found', 'The saved view is no longer available.', 404);
      row.name = body.name || '';return json({ view: row });
    }
    if (request.url.endsWith('/DeleteSavedView')) {
      if (state === 'edit-revoked' && row?.visibility === 'organization') { revoked = true;return fail('permission_denied', 'Administration was revoked.', 403); }
      if (state === 'delete-error') return fail('unavailable', 'Removal is temporarily unavailable.', 503);if (!row) return fail('not_found', 'The saved view is no longer available.', 404);
      views = views.filter(item => item.id !== row.id);return json({ success: true });
    }
    return fail('unimplemented', 'This preview has no fixture for that action.');
  });
  return () => { mock.mockRestore();useLayoutStore.setState(previous); };
}
