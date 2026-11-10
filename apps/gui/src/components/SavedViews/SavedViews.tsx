import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { SavedViewService, type SavedViewMetadata } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { currentLocation } from '../../lib/liveRouterLocation';
import { useAuthSession } from '../../hooks/useAuthSession';
import type { AuthSession } from '../../lib/authSession';
import { useScope } from '../../hooks/useScope';
import { useLayoutStore } from '../../store/layout';
import { Dialog } from '../ui/Dialog';
import { SavedViewAccess, type Audience } from './access';
import { definitionFromUrl, locationFromSavedView, viewNameSchema, type ViewLocation, type ViewScreen } from './definition';

const client = createClient(SavedViewService, transport);
const control = 'min-h-control rounded-md border px-3 py-2 type-label disabled:opacity-50';
const quiet = `${control} hover:bg-muted`;
const input = 'min-h-control w-full rounded-md border bg-background px-3 py-2 type-body';
interface SavedViewsProps { screen: ViewScreen; onApplied?: () => void; }
interface DialogProps extends SavedViewsProps { orgId: string; projectId: string; onClose: () => void; }
interface SessionProps extends DialogProps { accountId: string; }
interface Intent extends ViewLocation { key: string; }
type Editor = { kind: 'save'; intent: Intent } | { kind: 'rename' | 'delete'; view: SavedViewMetadata };

/** One compact entry point; the authenticated catalog mounts only on explicit use. */
export function SavedViews({ screen, onApplied }: SavedViewsProps) {
  const [open, setOpen] = useState(false), scope = useScope();
  const org = useLayoutStore(s => s.activeOrgId), project = useLayoutStore(s => s.activeProjectId);
  const ready = !!scope.orgId && !!scope.projectId && org === scope.orgId && project === scope.projectId;
  useEffect(() => { setOpen(false); }, [scope.orgId, scope.projectId, screen]);
  return <>
    
      <button type="button" className={quiet} disabled={!ready} onClick={event => { event.currentTarget.focus();setOpen(true); }}>Saved views</button>
    {open && ready && <SavedViewDialog key={JSON.stringify([screen, scope.orgId, scope.projectId])} screen={screen} orgId={scope.orgId} projectId={scope.projectId} onApplied={onApplied} onClose={() => setOpen(false)} />}
  </>;
}
function SavedViewDialog(props: DialogProps) {
  const account = useAuthSession(), cache = useQueryClient();
  return <Dialog open title="Saved views" onClose={props.onClose} className="w-full max-w-2xl max-h-[85dvh]" headerRight={
      <button type="button" className={quiet} onClick={props.onClose} aria-label="Close saved views">Close</button>}>
    {account.isLoading ? <p role="status" className="p-panel type-body">Checking your session…</p>
      : account.error ? <div role="alert" className="p-panel type-body"><p>Could not verify your session. Your current view is unchanged.</p>
      <button type="button" className={`${quiet} mt-2`} disabled={account.isFetching} onClick={() => { void cache.invalidateQueries({ queryKey: ['authSession'] }); }}>Retry session</button></div>
      : !account.authenticated || !account.userId ? <p role="alert" className="p-panel type-body">Sign in to manage your saved views. Your current view is unchanged.</p>
      : <SavedViewSession key={JSON.stringify([account.userId, props.orgId, props.projectId, props.screen])} {...props} accountId={account.userId} />}
  </Dialog>;
}
interface CatalogScope { accountId: string; orgId: string; screen: ViewScreen; visit: string; revision: number; access: SavedViewAccess; }
function useCatalog(scope: CatalogScope, audience: Audience) {
  const [filter, setFilter] = useState(''), [appliedFilter] = useDebounce(filter, 250);
  const [cursors, setCursors] = useState<string[]>(['']), [pageIndex, setPageIndex] = useState(0);
  const cursor = cursors[pageIndex]!;
  const query = useQuery({
    queryKey: ['savedViews', scope.accountId, scope.orgId, scope.screen, scope.visit, scope.revision, audience, appliedFilter, cursor],
    staleTime: 0, gcTime: 0, retry: false,
    queryFn: async ({ signal }) => {
      const receipt = scope.access.begin(scope.revision);
      try {
      const response = await client.listSavedViews({ orgId: scope.orgId, screen: scope.screen, visibility: audience,
        page: { limit: 20, sort: 'name:asc', ...(appliedFilter ? { filter: appliedFilter } : {}), ...(cursor ? { cursor } : {}) } }, { signal });
      if (response.views.some(row => row.orgId !== scope.orgId || row.screen !== scope.screen || row.visibility !== audience
        || (audience === 'personal' && row.ownerUserId !== scope.accountId))) throw new Error('Saved views could not be verified for this account and organization.');
      signal.throwIfAborted();scope.access.accept(response, audience, receipt);
      return { ...response, receipt };
      } catch (cause) {
        scope.access.fail(cause, receipt, signal.aborted);
        throw cause;
      }
    },
  });
  const reset = () => { setCursors(['']);setPageIndex(0);setFilter(''); };
  return { query, filter, pageIndex,
    setFilter(value: string) { setFilter(value);setCursors(['']);setPageIndex(0); }, reset,
    previous() { setPageIndex(index => Math.max(index - 1, 0)); },
    next() { const next = query.data?.page?.nextCursor;if (!next) return;setCursors(previous => [...previous.slice(0, pageIndex + 1), next]);setPageIndex(pageIndex + 1); },
    changingFilter: filter !== appliedFilter,
  };
}
function failure(error: unknown) {
  const code = ConnectError.from(error).code;
  if (code === Code.NotFound) return 'This saved view is no longer available. Refresh the lists or save your current view.';
  if (code === Code.FailedPrecondition) return 'This saved view has an unavailable project or definition. Keep your current view or save a new one.';
  if (code === Code.PermissionDenied || code === Code.Unauthenticated) return 'You do not have access to this action. Your current view is unchanged.';
  return error instanceof Error ? error.message : 'The action could not finish. Try again.';
}
function SavedViewSession({ screen, orgId, projectId, accountId, onClose, onApplied }: SessionProps) {
  const location = useLocation(), navigate = useNavigate(), cache = useQueryClient(), visit = useId();
  const latest = useRef(location), alive = useRef(true);latest.current = location;
  const [access] = useState(() => new SavedViewAccess());
  const [revision, setRevision] = useState(0);
  useEffect(() => { alive.current = true;return () => { alive.current = false; }; }, []);
  const live = (): Intent => ({ ...currentLocation(latest.current), key: typeof window !== 'undefined' && window.history.state?.key ? String(window.history.state.key) : latest.current.key });
  const sameSession = () => {
    const session = cache.getQueryData<AuthSession>(['authSession']), current = live(), params = new URLSearchParams(current.search);
    return alive.current && !access.denied && session?.authenticated && session.userId === accountId && cache.getQueryState(['authSession'])?.status !== 'error'
      && params.get('org') === orgId && params.get('project') === projectId && (screen === 'tasks' ? /^\/tasks(?:\/[^/]+)?\/?$/.test(current.pathname) : /^\/reports\/?$/.test(current.pathname));
  };
  const sameIntent = (before: Intent) => { const now = live();return sameSession() && now.key === before.key && now.pathname === before.pathname && now.search === before.search && now.hash === before.hash; };
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState('');
  const [audience, setAudience] = useState<Audience>('personal'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const scope = { accountId, orgId, screen, visit, revision, access };
  const personal = useCatalog(scope, 'personal'), organization = useCatalog(scope, 'organization');
  const denied = access.denied;
  const canShare = access.canEditShared && [personal, organization].every(catalog => catalog.query.isSuccess && !catalog.query.isFetching && !!catalog.query.data && access.freshSharedHint(catalog.query.data));
  const sharedEditor = editor && editor.kind !== 'save' && editor.view.visibility === 'organization';
  const canEdit = !sharedEditor || access.canEditShared;
  const editorEpoch = useRef(0);
  const edit = (next: Editor | null) => { editorEpoch.current++;setEditor(next);setError('');setNotice('');if (next?.kind === 'rename') setName(next.view.name);else setName('');if (next?.kind === 'save') setAudience('personal'); };
  const refresh = () => { personal.reset();organization.reset();access.retry();setRevision(value => value + 1);setError(''); };
  const openView = useMutation({ gcTime: 0,
    mutationFn: async ({ view, intent }: { view: SavedViewMetadata; intent: Intent }) => {
      const response = await client.getSavedView({ viewId: view.id });
      if (!sameIntent(intent)) throw new Error('Your current view changed. Choose Open again to apply this saved view.');
      if (!response.view || !response.definition || response.view.id !== view.id) throw new Error('This saved view is unavailable.');
      return { next: locationFromSavedView(intent, response.view, response.definition, screen, orgId, accountId), intent };
    },
    onSuccess: ({ next, intent }) => { if (!sameIntent(intent)) return;onApplied?.();navigate(next);onClose(); },
    onError: cause => { if (sameSession()) setError(failure(cause)); },
  });
  const save = useMutation({ gcTime: 0,
    mutationFn: async ({ draft, epoch }: { draft: Editor; epoch: number }) => {
      const parsed = draft.kind === 'delete' ? '' : viewNameSchema.parse(name);
      if (!sameSession()) throw new Error('Your account or project changed. Reopen Saved views.');
      if (draft.kind !== 'save' && draft.view.visibility === 'organization' && !access.canEditShared) throw new ConnectError('Current organization administration must be checked again.', Code.PermissionDenied);
      if (draft.kind === 'save') {
        if (!sameIntent(draft.intent)) throw new Error('Your current view changed. Use current settings before saving.');
        await client.createSavedView({ projectId, name: parsed, visibility: audience, definition: definitionFromUrl(screen, draft.intent.search) });
      } else if (draft.kind === 'rename') await client.renameSavedView({ viewId: draft.view.id, name: parsed });
      else await client.deleteSavedView({ viewId: draft.view.id });
      return { epoch, kind: draft.kind };
    },
    onSuccess: result => { if (!sameSession() || editorEpoch.current !== result.epoch) return;edit(null);refresh();setNotice(result.kind === 'delete' ? 'Saved view deleted.' : result.kind === 'rename' ? 'Saved view renamed.' : 'View saved.'); },
    onError: (cause, { draft }) => { if (!sameSession()) return;if (ConnectError.from(cause).code === Code.PermissionDenied && (draft.kind === 'save' ? audience === 'organization' : draft.view.visibility === 'organization')) access.denyShared();setError(failure(cause)); },
  });
  const busy = save.isPending || openView.isPending;
  const validName = viewNameSchema.safeParse(name);
  return <div role="region" aria-label="Saved view content" tabIndex={0} className="min-h-0 overflow-y-auto p-panel space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="type-body text-muted-foreground">Save filters and layout. Opening a view checks your current access.</p>
      
      <button type="button" className={quiet} disabled={busy || denied} onClick={() => edit({ kind: 'save', intent: live() })}>Save current view</button>
    </div>
    {(error || denied) && <div role="alert" className="rounded-md border bg-surface-panel p-panel type-body"><p>{denied ? 'Organization access is unavailable. Refresh the lists to check your access again.' : error}</p>
      <button type="button" className={`${quiet} mt-2`} disabled={busy} onClick={refresh}>Refresh lists</button></div>}
    {notice && <p role="status" className="type-body">{notice}</p>}
    {editor && <form className="space-y-3 rounded-md border bg-surface-panel p-panel" onSubmit={event => { event.preventDefault();if (!busy && !denied && canEdit && (editor.kind === 'delete' || validName.success) && !(editor.kind === 'save' && audience === 'organization' && !canShare)) save.mutate({ draft: editor, epoch: editorEpoch.current }); }}>
      <h3 className="type-section-title">{editor.kind === 'save' ? 'Save current view' : editor.kind === 'rename' ? 'Rename saved view' : 'Delete saved view?'}</h3>
      {editor.kind !== 'save' && <><p className="type-body break-words">{editor.view.name}</p><p className="type-caption text-muted-foreground break-words">{editor.view.visibility === 'personal' ? 'Personal' : 'Organization'} · {editor.view.unavailableReason === 'project_unavailable' ? 'Unavailable project' : editor.view.projectName || 'Saved project'}</p></>}
      {editor.kind === 'delete' ? <><p className="type-body">Remove this named configuration. Tasks, reports and their data stay available.</p><p className="type-body text-destructive-subtle-foreground">This cannot be undone.</p></> : <>
        <label className="block type-label" htmlFor={`${visit}-name`}>View name</label>
        <input autoFocus id={`${visit}-name`} className={input} value={name} maxLength={128} onChange={event => setName(event.target.value)} disabled={busy || denied} autoComplete="off" />
        {name && !validName.success && <p className="type-caption text-destructive-subtle-foreground">{validName.error.issues[0]?.message}</p>}
      </>}
      {editor.kind === 'save' && <>
        <label className="block type-label" htmlFor={`${visit}-audience`}>Audience</label>
        <select id={`${visit}-audience`} className={input} value={audience} disabled={busy || denied} onChange={event => setAudience(event.target.value as Audience)}>
          <option value="personal">Personal</option>{(canShare || audience === 'organization') && <option value="organization" disabled={!canShare}>Organization</option>}
        </select>
        <p className="type-caption text-muted-foreground">{audience === 'personal' ? 'Only you can see and manage this name.' : 'People with current access can open it. Organization administrators manage it.'}</p>
        {!sameIntent(editor.intent) && 
      <button type="button" className={quiet} disabled={busy || denied} onClick={() => { setEditor({ kind: 'save', intent: live() });setError(''); }}>Use current settings</button>}
        {audience === 'organization' && !canShare && <p className="type-caption">Organization saving is unavailable. Choose Personal or refresh the lists.</p>}
      </>}
      {sharedEditor && !canEdit && !denied && <div role="status" className="type-body"><p>Current organization administration is required to edit this name.</p>
      <button type="button" className={`${quiet} mt-2`} disabled={busy || organization.query.isFetching} onClick={() => { void organization.query.refetch(); }}>Check editing access</button></div>}
      <div className="flex flex-wrap justify-end gap-2">
        
      <button type="button" className={quiet} onClick={() => edit(null)} disabled={busy}>Cancel editing</button>
        
      <button type="submit" disabled={busy || denied || !canEdit || (editor.kind !== 'delete' && !validName.success) || (editor.kind === 'save' && audience === 'organization' && !canShare)} className={`${control} ${editor.kind === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
          {save.isPending ? 'Saving…' : editor.kind === 'save' ? 'Save view' : editor.kind === 'rename' ? 'Rename view' : 'Delete view'}
        </button>
      </div>
    </form>}
    <CatalogSection audience="personal" catalog={personal} busy={busy} denied={denied} sharedEditable={access.canEditShared} onOpen={view => { setError('');openView.mutate({ view, intent: live() }); }} onEdit={(kind, view) => edit({ kind, view })} />
    <CatalogSection audience="organization" catalog={organization} busy={busy} denied={denied} sharedEditable={access.canEditShared} onOpen={view => { setError('');openView.mutate({ view, intent: live() }); }} onEdit={(kind, view) => edit({ kind, view })} />
    {openView.isPending && <p role="status" className="type-body">Checking saved view access…</p>}
  </div>;
}
interface CatalogProps { audience: Audience; catalog: ReturnType<typeof useCatalog>; busy: boolean; denied: boolean; sharedEditable: boolean; onOpen: (view: SavedViewMetadata) => void; onEdit: (kind: 'rename' | 'delete', view: SavedViewMetadata) => void; }
function CatalogSection({ audience, catalog, busy, denied, sharedEditable, onOpen, onEdit }: CatalogProps) {
  const id = useId(), label = audience === 'personal' ? 'Personal' : 'Organization', { query } = catalog;
  const blocked = query.isFetching || catalog.changingFilter || busy || denied;
  return <section aria-label={`${label} saved views`} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="type-section-title">{label}</h3><p className="type-caption text-muted-foreground">{audience === 'personal' ? 'Visible only to you' : 'Shared with the organization; administrators manage names.'}</p></div>
    <label htmlFor={id} className="sr-only">Filter {label} views by name</label>
    <input id={id} type="search" className={input} placeholder="Filter names…" disabled={busy || denied} value={catalog.filter} onChange={event => catalog.setFilter(event.target.value)} maxLength={500} />
    {query.isFetching && query.data && !denied && <p role="status" className="type-body">Refreshing {label} views…</p>}
    {denied ? <p className="type-body text-muted-foreground">Saved names are unavailable until organization access is checked again.</p> : query.isLoading ? <p role="status" className="type-body">Loading {label} views…</p> : query.error ? <div role="alert" className="type-body"><p>{failure(query.error)}</p>
      <button type="button" className={`${quiet} mt-2`} disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Retry {label} views</button></div> : <>
      <p className="type-caption text-muted-foreground">{query.data?.views.length ?? 0} shown · {query.data?.page?.totalCount !== undefined ? `${query.data.page.totalCount} total` : 'total unavailable'}</p>
      {query.data?.views.length ? <ul className="divide-y rounded-md border">{query.data.views.map(view => <li key={view.id} className="flex min-w-0 flex-wrap items-center gap-3 p-panel">
        <div className="min-w-0 flex-1 basis-full sm:basis-0"><p className="type-label break-words">{view.name}</p><p className="type-caption text-muted-foreground break-words">{view.unavailableReason === 'project_unavailable' ? 'Unavailable project' : view.projectName || 'Saved project'} · {label}</p>{view.unavailableReason && <p className="type-caption">Unavailable saved view. Keep current settings or save a new name.</p>}</div>
        <div className="flex flex-wrap gap-2">
      <button type="button" className={quiet} disabled={busy} aria-label={`Open ${view.name}`} onClick={() => onOpen(view)}>Open</button>
          {view.canEdit && (audience === 'personal' || sharedEditable) && <>
      <button type="button" className={quiet} disabled={busy} aria-label={`Rename ${view.name}`} onClick={() => onEdit('rename', view)}>Rename</button>
      <button type="button" className={quiet} disabled={busy} aria-label={`Delete ${view.name}`} onClick={() => onEdit('delete', view)}>Delete</button></>}
        </div>
      </li>)}</ul> : query.data?.page?.totalCount === 0 ? <p className="type-body text-muted-foreground">{catalog.filter ? 'No saved names match this filter.' : `No ${label.toLowerCase()} views yet. Use Save current view to add one.`}</p>
        : <div className="type-body text-muted-foreground"><p>No saved views on this page. Use Previous or refresh this page.</p>
      <button type="button" className={`${quiet} mt-2`} disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Refresh {label} views</button></div>}
    </>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" className={quiet} disabled={blocked || catalog.pageIndex === 0} onClick={catalog.previous}>Previous {label} views</button>
      <button type="button" className={quiet} disabled={blocked || !query.data?.page?.nextCursor || !!query.error} onClick={catalog.next}>Next {label} views</button></div>
  </section>;
}
