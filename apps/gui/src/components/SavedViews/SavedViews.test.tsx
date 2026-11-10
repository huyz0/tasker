import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { act, fireEvent, screen, waitFor, within, render as mount } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { SavedViewService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { useLayoutStore } from '../../store/layout';
import { useScopeSync } from '../../hooks/useScope';
import { SavedViews } from './SavedViews';
let navigate: NavigateFunction;
const row = (id = 'saved-1', extra: object = {}) => ({ id, orgId: 'o1', projectId: 'p2', ownerUserId: 'u1', name: 'Release review', screen: 'tasks', visibility: 'personal', canEdit: true, projectName: 'Release', ...extra });
const definition = { version: 1, screen: 'tasks', tasks: { viewMode: 'table', search: 'release', priority: 0, ready: true, sort: 'title:asc' } };
function Harness({ viewScreen = 'tasks' }: { viewScreen?: 'tasks' | 'reports' }) { useScopeSync();navigate = useNavigate();return <><SavedViews screen={viewScreen} /><button onClick={() => navigate(-1)}>History Back</button><button onClick={() => navigate(1)}>History Forward</button></>; }
function render(entry = '/tasks?org=o1&project=p1&q=before', viewScreen: 'tasks' | 'reports' = 'tasks') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  cache.setQueryData(['authSession'], { authenticated: true, userId: 'u1', mustChangePassword: false });
  return renderScoped(<Harness viewScreen={viewScreen} />, { paths: ['/tasks', '/tasks/:taskId', '/reports'], initialEntry: entry, queryClient: cache });
}
const open = async () => { fireEvent.click(screen.getByRole('button', { name: 'Saved views' }));return screen.findByRole('dialog', { name: 'Saved views' }); };
afterEach(() => { window.history.replaceState(null, '', '/'); });
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({})));
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
  mockRpc(SavedViewService, 'ListSavedViews', (body: { visibility: string }) => ({ views: body.visibility === 'personal' ? [row()] : [], page: { totalCount: body.visibility === 'personal' ? '1' : '0' }, canCreateShared: true }));
  mockRpc(SavedViewService, 'GetSavedView', { view: row(), definition });
  mockRpc(SavedViewService, 'CreateSavedView', { view: row('created', { projectId: 'p1' }) });
  mockRpc(SavedViewService, 'RenameSavedView', { view: row('saved-1', { name: 'Renamed' }) });
  mockRpc(SavedViewService, 'DeleteSavedView', { success: true });
});
describe('named query interactions', () => {
  it('keeps catalog arrival separate from explicit fresh Open and restores the full URL with history', async () => {
    const view = render();await open();await screen.findByText('Release review');expect(view.location.search).toContain('q=before');
    fireEvent.click(screen.getByRole('button', { name: 'Open Release review' }));
    await waitFor(() => expect(new URLSearchParams(view.location.search).get('project')).toBe('p2'));
    expect(Object.fromEntries(new URLSearchParams(view.location.search))).toMatchObject({ org: 'o1', project: 'p2', view: 'table', q: 'release', priority: '0', ready: '1', sort: 'title:asc' });
    fireEvent.click(screen.getByRole('button', { name: 'History Back' }));await waitFor(() => expect(view.location.search).toContain('q=before'));
    fireEvent.click(screen.getByRole('button', { name: 'History Forward' }));await waitFor(() => expect(view.location.search).toContain('q=release'));
  });
  it('saves applied URL settings as personal by default without results or forged identity', async () => {
    const requests: object[] = [];mockRpc(SavedViewService, 'CreateSavedView', body => { requests.push(body);return { view: row('new') }; });
    const view = render('/tasks?org=o1&project=p1&priority=0&view=table&q=release&ready=0');await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Save current view' }));
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: ' Weekly release ' } });
    expect(screen.getByLabelText('Audience')).toHaveValue('personal');
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ projectId: 'p1', name: 'Weekly release', visibility: 'personal', definition: { version: 1, screen: 'tasks', tasks: { viewMode: 'table', search: 'release', priority: 0, ready: false } } });
    expect(view.location.search).toContain('q=release');
  });
  it('preserves a duplicate-name draft and lets cancellation return focus without URL changes', async () => {
    mockRpcError(SavedViewService, 'CreateSavedView', 'already_exists', 'A saved view with this name already exists.');
    const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Save current view'}));
    fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Weekly release'}});fireEvent.click(screen.getByRole('button',{name:'Save view'}));
    await screen.findByRole('alert');expect(screen.getByLabelText('View name')).toHaveValue('Weekly release');
    fireEvent.click(screen.getByRole('button',{name:'Cancel editing'}));fireEvent.click(screen.getByRole('button',{name:'Close saved views'}));
    await waitFor(() => expect(screen.getByRole('button',{name:'Saved views'})).toHaveFocus());expect(view.location.search).toContain('q=before');
  });
  it.each([false, undefined])('keeps organization creation unavailable without an explicit current server hint (%s)', async hint=>{
    mockRpc(SavedViewService,'ListSavedViews',{views:[],page:{totalCount:'0'},...(hint===undefined?{}:{canCreateShared:hint})});render();await open();fireEvent.click(await screen.findByRole('button',{name:'Save current view'}));
    expect(screen.queryByRole('option',{name:'Organization'})).not.toBeInTheDocument();
  });
  it('shows read-only shared entries with authorized context but no editing actions', async()=>{
    mockRpc(SavedViewService,'ListSavedViews',(body:{visibility:string})=>({views:body.visibility==='organization'?[row('shared',{visibility:'organization',ownerUserId:'u2',canEdit:false,projectName:undefined})]:[],page:{totalCount:body.visibility==='organization'?'1':'0'},canCreateShared:false}));render();await open();
    const area=await screen.findByRole('region',{name:'Organization saved views'});await within(area).findByText('Release review');
    expect(within(area).getByText('Saved project · Organization')).toBeVisible();expect(within(area).getByRole('button',{name:'Open Release review'})).toBeEnabled();expect(within(area).queryByRole('button',{name:'Rename Release review'})).not.toBeInTheDocument();
  });
  it.each(['failed_precondition','permission_denied','not_found','unavailable'])('keeps the current view intact after a refused Open (%s)',async code=>{
    mockRpcError(SavedViewService,'GetSavedView',code,'The saved view cannot be opened.');const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Open Release review'}));await screen.findByRole('alert');
    expect(view.location.url).toBe('/tasks?org=o1&project=p1&q=before');expect(screen.getByRole('button',{name:'Save current view'})).toBeEnabled();
  });
  it.each(['url','organization','account','close','return'])('refuses a delayed Open after newer %s intent',async change=>{
    const pending=mockRpcPending(SavedViewService,'GetSavedView');const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Open Release review'}));await waitFor(()=>expect(pending.requests).toHaveLength(1));
    if(change==='url')act(()=>navigate('/tasks?org=o1&project=p1&q=newer'));
    if(change==='return'){act(()=>navigate('/tasks?org=o1&project=p1&q=temporary'));act(()=>navigate('/tasks?org=o1&project=p1&q=before'));}
    if(change==='organization')act(()=>navigate('/reports?org=o2&project=p3&days=90'));
    if(change==='account')act(()=>view.queryClient.setQueryData(['authSession'],{authenticated:true,userId:'u2'}));
    if(change==='close')fireEvent.click(screen.getByRole('button',{name:'Close saved views'}));
    const before=view.location.url;pending.resolve({view:row(),definition});
    await waitFor(()=>expect(view.queryClient.isMutating()).toBe(0));expect(view.location.url).toBe(before);
  });
  it('renames metadata only and deletes only after an explicit permanent confirmation',async()=>{
    const renames:object[]=[],deletes:object[]=[];mockRpc(SavedViewService,'RenameSavedView',body=>{renames.push(body);return{view:row()};});mockRpc(SavedViewService,'DeleteSavedView',body=>{deletes.push(body);return{success:true};});
    render();await open();fireEvent.click(await screen.findByRole('button',{name:'Rename Release review'}));fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Renamed'}});fireEvent.click(screen.getByRole('button',{name:'Rename view'}));await waitFor(()=>expect(renames).toEqual([{viewId:'saved-1',name:'Renamed'}]));
    fireEvent.click(await screen.findByRole('button',{name:'Delete Release review'}));expect(deletes).toHaveLength(0);expect(await screen.findByText('This cannot be undone.')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'Delete view'}));await waitFor(()=>expect(deletes).toEqual([{viewId:'saved-1'}]));
  });
});


describe('catalog completeness and draft recovery', () => {
  it('reaches both audiences beyond100 with bounded independent pages, name filtering and an intact naming draft', async () => {
    const requests: { visibility: string; page?: { limit?: number; cursor?: string; filter?: string } }[] = [];
    mockRpc(SavedViewService, 'ListSavedViews', body => {
      requests.push(body);
      const all = Array.from({ length: 121 }, (_, i) => row(`${body.visibility}-${i}`, { name: `${body.visibility} ${String(i).padStart(3, '0')}`, visibility: body.visibility, ownerUserId: body.visibility === 'personal' ? 'u1' : 'u2', canEdit: body.visibility === 'personal' }));
      const filtered = all.filter(item => !body.page?.filter || item.name.includes(body.page.filter));
      const start = Number(body.page?.cursor || 0), next = start + 20;
      return { views: filtered.slice(start, next), page: { totalCount: String(filtered.length), ...(next < filtered.length ? { nextCursor: String(next) } : {}) }, canCreateShared: true };
    });
    render();await open();await screen.findByText('personal 000');
    fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Keep this draft' } });
    for (let page = 1; page <= 5; page++) { fireEvent.click(screen.getByRole('button', { name: 'Next Personal views' }));await screen.findByText(`personal ${String(page * 20).padStart(3, '0')}`); }
    expect(screen.getByText('organization 000')).toBeVisible();expect(screen.getByText('personal 100')).toBeVisible();
    for (let page = 1; page <= 5; page++) { fireEvent.click(screen.getByRole('button', { name: 'Next Organization views' }));await screen.findByText(`organization ${String(page * 20).padStart(3, '0')}`); }
    expect(screen.getByText('personal 100')).toBeVisible();expect(screen.getByText('organization 100')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Previous Personal views' }));await screen.findByText('personal 080');
    fireEvent.change(screen.getByLabelText('Filter Organization views by name'), { target: { value: '120' } });await screen.findByText('organization 120');
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Organization saved views' })).getByText('1 shown · 1 total')).toBeVisible());
    expect(screen.getByLabelText('View name')).toHaveValue('Keep this draft');expect(requests.every(request => request.page?.limit === 20)).toBe(true);
  });
  it('keeps the current page and naming draft after a page failure, then retries that same cursor', async () => {
    mockRpc(SavedViewService, 'ListSavedViews', body => ({ views: body.visibility === 'personal' ? [row()] : [], page: { totalCount: '40', nextCursor: 'next-personal' }, canCreateShared: true }));
    render();await open();await screen.findByText('Release review');fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Page recovery' } });
    mockRpcError(SavedViewService, 'ListSavedViews', 'unavailable', 'This page is temporarily offline.');fireEvent.click(screen.getByRole('button', { name: 'Next Personal views' }));
    await screen.findByRole('button', { name: 'Retry Personal views' });expect(screen.getByLabelText('View name')).toHaveValue('Page recovery');
    const requests: { page?: { cursor?: string } }[] = [];
    mockRpc(SavedViewService, 'ListSavedViews', body => { requests.push(body);return { views: [row('next', { name: 'Recovered page' })], page: { totalCount: '40' }, canCreateShared: true }; });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Personal views' }));await screen.findByText('Recovered page');expect(requests.at(-1)?.page?.cursor).toBe('next-personal');expect(screen.getByLabelText('View name')).toHaveValue('Page recovery');
  });
  it('offers Organization for an empty current-admin catalog, then retains the name and safely recovers after revoked authority', async () => {
    mockRpc(SavedViewService, 'ListSavedViews', { views: [], page: { totalCount: '0' }, canCreateShared: true });mockRpcError(SavedViewService, 'CreateSavedView', 'permission_denied', 'Administration was revoked.');
    render();await open();fireEvent.click(await screen.findByRole('button', { name: 'Save current view' }));
    await screen.findByRole('option', { name: 'Organization' });fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'organization' } });fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Shared draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));await screen.findByRole('alert');
    expect(screen.getByLabelText('View name')).toHaveValue('Shared draft');expect(screen.getByRole('button', { name: 'Save view' })).toBeDisabled();expect(screen.getByRole('option', { name: 'Organization' })).toBeDisabled();
    const requests: { visibility: string }[] = [];mockRpc(SavedViewService, 'CreateSavedView', body => { requests.push(body);return { view: row() }; });
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'personal' } });fireEvent.click(screen.getByRole('button', { name: 'Save view' }));await screen.findByText('View saved.');expect(requests[0]?.visibility).toBe('personal');
  });
  it('does not let a completed save after close alter a newly opened dialog', async () => {
    const pending = mockRpcPending(SavedViewService, 'CreateSavedView');const view = render();await open();fireEvent.click(await screen.findByRole('button', { name: 'Save current view' }));fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Old operation' } });fireEvent.click(screen.getByRole('button', { name: 'Save view' }));await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Close saved views' }));await open();await screen.findByText('Release review');pending.resolve({ view: row() });await waitFor(() => expect(view.queryClient.isMutating()).toBe(0));
    expect(screen.queryByText('View saved.')).not.toBeInTheDocument();expect(screen.getByRole('dialog', { name: 'Saved views' })).toBeVisible();expect(view.location.search).toContain('q=before');
  });
  it.each(['   ', 'bad\u0000name', 'x'.repeat(129)])('refuses an invalid naming draft before an RPC (%j)', async name => {
    render();await open();fireEvent.click(await screen.findByRole('button', { name: 'Save current view' }));fireEvent.change(screen.getByLabelText('View name'), { target: { value: name } });expect(screen.getByRole('button', { name: 'Save view' })).toBeDisabled();
  });
  it('keeps a naming draft after a changed URL and requires an explicit current-settings capture', async () => {
    const requests: { definition: { tasks: { search: string } } }[] = [];mockRpc(SavedViewService, 'CreateSavedView', body => { requests.push(body);return { view: row() }; });
    render();await open();fireEvent.click(await screen.findByRole('button', { name: 'Save current view' }));fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Retained name' } });
    act(() => navigate('/tasks?org=o1&project=p1&q=after'));fireEvent.click(screen.getByRole('button', { name: 'Save view' }));await screen.findByRole('alert');expect(requests).toHaveLength(0);expect(screen.getByLabelText('View name')).toHaveValue('Retained name');
    fireEvent.click(screen.getByRole('button', { name: 'Use current settings' }));fireEvent.click(screen.getByRole('button', { name: 'Save view' }));await screen.findByText('View saved.');expect(requests[0]?.definition.tasks.search).toBe('after');
  });
  it('keeps obsolete entries editable for cleanup and refuses to apply their missing project', async () => {
    mockRpc(SavedViewService, 'ListSavedViews', body => ({ views: body.visibility === 'personal' ? [row('old', { unavailableReason: 'project_unavailable', projectName: undefined })] : [], page: { totalCount: body.visibility === 'personal' ? '1' : '0' }, canCreateShared: true }));mockRpcError(SavedViewService, 'GetSavedView', 'failed_precondition', 'Unavailable project.');
    const view=render();await open();await screen.findByText('Unavailable project · Personal');fireEvent.click(screen.getByRole('button',{name:'Open Release review'}));await screen.findByRole('alert');expect(view.location.search).toContain('project=p1');
    fireEvent.click(screen.getByRole('button',{name:'Delete Release review'}));fireEvent.click(screen.getByRole('button',{name:'Delete view'}));await screen.findByText('Saved view deleted.');
  });
  it('does not render another tenant’s name even if a response violates its requested scope', async () => {
    mockRpc(SavedViewService,'ListSavedViews',body=>({views:body.visibility==='personal'?[row('foreign',{orgId:'o2',name:'Foreign private name'})]:[],page:{totalCount:'1'},canCreateShared:true}));render();await open();await screen.findByRole('button',{name:'Retry Personal views'});expect(screen.queryByText('Foreign private name')).not.toBeInTheDocument();
  });
  it('renders a denied catalog as a denial with Retry rather than an empty collection', async () => {
    mockRpcError(SavedViewService,'ListSavedViews','permission_denied','Access removed.');render();await open();await screen.findByRole('button',{name:'Refresh lists'});expect(screen.queryByText('No personal views yet. Use Save current view to add one.')).not.toBeInTheDocument();
  });
});


it('identifies the audience and readable project when confirming a same-name shared deletion', async () => {
  mockRpc(SavedViewService, 'ListSavedViews', body => ({ views: [row(body.visibility, { visibility: body.visibility, ownerUserId: body.visibility === 'personal' ? 'u1' : 'u2' })], page: { totalCount: '1' }, canCreateShared: true }));
  render();await open();const section = await screen.findByRole('region', { name: 'Organization saved views' });
  fireEvent.click(await within(section).findByRole('button', { name: 'Delete Release review' }));
  const form = screen.getByRole('heading', { name: 'Delete saved view?' }).closest('form')!;
  expect(within(form).getByText('Release review')).toBeVisible();expect(within(form).getByText('Organization · Release')).toBeVisible();
});


it.each(['40', undefined])('does not call an empty page an empty collection without an authoritative zero (%s)', async totalCount => {
  mockRpc(SavedViewService, 'ListSavedViews', { views: [], ...(totalCount === undefined ? {} : { page: { totalCount } }), canCreateShared: true });
  render();await open();await screen.findByRole('button', { name: 'Refresh Personal views' });
  expect(screen.queryByText('No personal views yet. Use Save current view to add one.')).not.toBeInTheDocument();
});
it('keeps a failed session check distinct from sign-out and retries without exposing stale names', async () => {
  server.use(http.get(`${BACKEND_URL}/api/auth/session`, () => HttpResponse.json({ authenticated: true, userId: 'u1' })));
  const view=render();await open();await screen.findByText('Release review');
  act(() => view.queryClient.getQueryCache().find({ queryKey: ['authSession'] })!.setState({ status: 'error', error: new Error('Session check offline'), errorUpdatedAt: Date.now() }));
  const retry=await screen.findByRole('button', { name: 'Retry session' });expect(screen.queryByText('Release review')).not.toBeInTheDocument();
  fireEvent.click(retry);await screen.findByText('Release review');expect(view.location.search).toContain('q=before');
});


it('applies a readable organization report with a fresh window and one reversible project change', async () => {
  const report = row('report', { screen: 'reports', visibility: 'organization', ownerUserId: 'u2', canEdit: false });
  mockRpc(SavedViewService, 'ListSavedViews', body => ({ views: body.visibility === 'organization' ? [report] : [], page: { totalCount: body.visibility === 'organization' ? '1' : '0' }, canCreateShared: false }));
  mockRpc(SavedViewService, 'GetSavedView', { view: report, definition: { version: 1, screen: 'reports', reports: { windowDays: 90 } } });
  const view=render('/reports?org=o1&project=p1&days=7', 'reports');await open();fireEvent.click(await screen.findByRole('button', { name: 'Open Release review' }));
  await waitFor(() => expect(view.location.url).toBe('/reports?org=o1&project=p2&days=90'));
  fireEvent.click(screen.getByRole('button', { name: 'History Back' }));await waitFor(() => expect(view.location.url).toBe('/reports?org=o1&project=p1&days=7'));
});
it('checks native browser history intent rather than an earlier rendered location', async () => {
  window.history.replaceState({ key: 'native-initial', idx: 0 }, '', '/tasks?org=o1&project=p1&q=before');
  const cache=new QueryClient({ defaultOptions: { queries: { retry: false } } });cache.setQueryData(['authSession'],{authenticated:true,userId:'u1'});
  const pending=mockRpcPending(SavedViewService,'GetSavedView');mount(<QueryClientProvider client={cache}><BrowserRouter><Harness /></BrowserRouter></QueryClientProvider>);
  await open();fireEvent.click(await screen.findByRole('button',{name:'Open Release review'}));await waitFor(()=>expect(pending.requests).toHaveLength(1));
  act(()=>navigate('/tasks?org=o1&project=p1&q=native-newer'));pending.resolve({view:row(),definition});await waitFor(()=>expect(cache.isMutating()).toBe(0));expect(window.location.search).toContain('q=native-newer');
});
it.each([{}, { view: row() }, { view: row('different'), definition }])('keeps current settings on an incomplete fresh response (%j)',async response=>{
  mockRpc(SavedViewService,'GetSavedView',response);const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Open Release review'}));await screen.findByRole('alert');expect(view.location.search).toContain('q=before');
});
it('shows a pending session check before a confirmed sign-out and exposes no catalog', async () => {
  let finish!: (value: { authenticated: boolean; userId: string | null }) => void;const pending=new Promise<{authenticated:boolean;userId:string|null}>(resolve=>finish=resolve);
  server.use(http.get(`${BACKEND_URL}/api/auth/session`,async()=>HttpResponse.json(await pending)));
  const view=render();view.queryClient.removeQueries({queryKey:['authSession']});await open();await screen.findByText('Checking your session…');finish({authenticated:false,userId:null});
  await screen.findByText('Sign in to manage your saved views. Your current view is unchanged.');expect(screen.queryByText('Release review')).not.toBeInTheDocument();
});
it('distinguishes a filtered authoritative zero from an empty unfiltered catalog', async () => {
  mockRpc(SavedViewService,'ListSavedViews',{views:[],page:{totalCount:'0'},canCreateShared:false});render();await open();await screen.findByText('No personal views yet. Use Save current view to add one.');
  fireEvent.change(screen.getByLabelText('Filter Personal views by name'),{target:{value:'missing'}});await screen.findByText('No saved names match this filter.');
});

it('does not resurrect personal metadata from a late sibling after organization access is denied', async () => {
  let finish!: (body: object) => void;const late=new Promise<object>(resolve=>finish=resolve);
  server.use(http.post(`${BACKEND_URL}/${SavedViewService.typeName}/ListSavedViews`,async({request})=>{
    const body=await request.json() as {visibility:string};return body.visibility==='personal'?HttpResponse.json(await late):HttpResponse.json({code:'permission_denied',message:'Organization access removed.'},{status:403});
  }));
  const view=render();await open();await screen.findByText('Organization access is unavailable. Refresh the lists to check your access again.');
  finish({views:[row('late',{name:'Late personal name'})],page:{totalCount:'1'},canCreateShared:true});await waitFor(()=>expect(view.queryClient.isFetching()).toBe(0));
  expect(screen.queryByText('Late personal name')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Save current view'})).toBeDisabled();
});
it('blocks an earlier Open after a catalog proves lost organization access, then recovers a naming draft through fresh lists', async () => {
  const pending=mockRpcPending(SavedViewService,'GetSavedView');const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Save current view'}));fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Retained access draft'}});
  fireEvent.click(await screen.findByRole('button',{name:'Open Release review'}));await waitFor(()=>expect(pending.requests).toHaveLength(1));
  mockRpcError(SavedViewService,'ListSavedViews','permission_denied','Access removed.');await act(async()=>{await view.queryClient.invalidateQueries({queryKey:['savedViews']});});
  await screen.findByText('Organization access is unavailable. Refresh the lists to check your access again.');pending.resolve({view:row(),definition});await waitFor(()=>expect(view.queryClient.isMutating()).toBe(0));
  expect(view.location.search).toContain('q=before');expect(screen.getByLabelText('View name')).toHaveValue('Retained access draft');expect(screen.getByRole('button',{name:'Save view'})).toBeDisabled();
  mockRpc(SavedViewService,'ListSavedViews',body=>({views:body.visibility==='personal'?[row()]:[],page:{totalCount:body.visibility==='personal'?'1':'0'},canCreateShared:true}));
  fireEvent.click(screen.getByRole('button',{name:'Refresh lists'}));await waitFor(()=>expect(screen.getByLabelText('View name')).toBeEnabled());expect(screen.getByLabelText('View name')).toHaveValue('Retained access draft');
});


it('does not submit an invalid draft through the form keyboard-submit path', async () => {
  const requests: object[]=[];mockRpc(SavedViewService,'CreateSavedView',body=>{requests.push(body);return{view:row()};});render();await open();fireEvent.click(await screen.findByRole('button',{name:'Save current view'}));
  fireEvent.change(screen.getByLabelText('View name'),{target:{value:'   '}});fireEvent.submit(screen.getByLabelText('View name').closest('form')!);expect(requests).toHaveLength(0);
});
it('does not post a private naming draft if the account changes before the save starts', async () => {
  const requests: object[]=[];mockRpc(SavedViewService,'CreateSavedView',body=>{requests.push(body);return{view:row()};});const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Save current view'}));fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Private old-account name'}});
  act(()=>{fireEvent.click(screen.getByRole('button',{name:'Save view'}));view.queryClient.setQueryData(['authSession'],{authenticated:true,userId:'u2'});});await waitFor(()=>expect(view.queryClient.isMutating()).toBe(0));expect(requests).toHaveLength(0);expect(screen.queryByDisplayValue('Private old-account name')).not.toBeInTheDocument();
});

it('keeps a revoked editor blocked through failed and pending retries until both fresh lists succeed', async () => {
  const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Save current view'}));fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Verified recovery draft'}});
  mockRpcError(SavedViewService,'ListSavedViews','permission_denied','Organization access removed.');await act(async()=>{await view.queryClient.invalidateQueries({queryKey:['savedViews']});});
  await screen.findByText('Organization access is unavailable. Refresh the lists to check your access again.');
  mockRpcError(SavedViewService,'ListSavedViews','unavailable','Verification temporarily offline.');fireEvent.click(screen.getByRole('button',{name:'Refresh lists'}));await waitFor(()=>expect(view.queryClient.isFetching()).toBe(0));
  expect(screen.getByRole('button',{name:'Save view'})).toBeDisabled();expect(screen.getByLabelText('View name')).toHaveValue('Verified recovery draft');
  const pending=mockRpcPending(SavedViewService,'ListSavedViews');fireEvent.click(screen.getByRole('button',{name:'Refresh lists'}));await waitFor(()=>expect(pending.requests).toHaveLength(2));expect(screen.getByRole('button',{name:'Save view'})).toBeDisabled();
  pending.resolve({views:[],page:{totalCount:'0'},canCreateShared:true});await waitFor(()=>expect(screen.getByRole('button',{name:'Save view'})).toBeEnabled());expect(screen.getByLabelText('View name')).toHaveValue('Verified recovery draft');
});
it.each(['rename','delete'] as const)('disables a retained shared %s after fresh canEdit is revoked and accepts fresh reauthorization',async kind=>{
  const shared=row('shared',{visibility:'organization',ownerUserId:'u2'});
  const catalog=(editable:boolean)=>(body:{visibility:string})=>({views:body.visibility==='organization'?[{...shared,canEdit:editable}]:[],page:{totalCount:body.visibility==='organization'?'1':'0'},canCreateShared:editable});
  mockRpc(SavedViewService,'ListSavedViews',catalog(true));const requests:object[]=[];mockRpc(SavedViewService,kind==='rename'?'RenameSavedView':'DeleteSavedView',body=>{requests.push(body);return kind==='rename'?{view:shared}:{success:true};});
  const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:`${kind==='rename'?'Rename':'Delete'} Release review`}));
  if(kind==='rename')fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Retained shared draft'}});
  mockRpc(SavedViewService,'ListSavedViews',catalog(false));await act(async()=>{await view.queryClient.invalidateQueries({queryKey:['savedViews']});});
  const submit=screen.getByRole('button',{name:kind==='rename'?'Rename view':'Delete view'});await waitFor(()=>expect(submit).toBeDisabled());fireEvent.submit(submit.closest('form')!);expect(requests).toHaveLength(0);
  mockRpc(SavedViewService,'ListSavedViews',catalog(true));fireEvent.click(screen.getByRole('button',{name:'Check editing access'}));await waitFor(()=>expect(submit).toBeEnabled());if(kind==='rename')expect(screen.getByLabelText('View name')).toHaveValue('Retained shared draft');
});
it.each(['rename','delete'] as const)('does not retry a shared %s after a refused mutation until a new current check',async kind=>{
  const shared=row('shared',{visibility:'organization',ownerUserId:'u2'});mockRpc(SavedViewService,'ListSavedViews',body=>({views:body.visibility==='organization'?[shared]:[],page:{totalCount:body.visibility==='organization'?'1':'0'},canCreateShared:true}));
  mockRpcError(SavedViewService,kind==='rename'?'RenameSavedView':'DeleteSavedView','permission_denied','Administration was revoked.');render();await open();fireEvent.click(await screen.findByRole('button',{name:`${kind==='rename'?'Rename':'Delete'} Release review`}));
  if(kind==='rename')fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Refused shared draft'}});
  const submit=screen.getByRole('button',{name:kind==='rename'?'Rename view':'Delete view'});fireEvent.click(submit);await screen.findByRole('alert');expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Check editing access'}));await waitFor(()=>expect(submit).toBeEnabled());
});


it('uses current legacy shared edit metadata without inventing a shared-create grant',async()=>{
  const shared=row('legacy-shared',{visibility:'organization',ownerUserId:'u2'});mockRpc(SavedViewService,'ListSavedViews',body=>({views:body.visibility==='organization'?[shared]:[],page:{totalCount:body.visibility==='organization'?'1':'0'}}));
  render();await open();fireEvent.click(await screen.findByRole('button',{name:'Rename Release review'}));expect(screen.getByRole('button',{name:'Rename view'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Cancel editing'}));fireEvent.click(screen.getByRole('button',{name:'Save current view'}));expect(screen.queryByRole('option',{name:'Organization'})).not.toBeInTheDocument();
});
it('does not restore shared editing from an older positive sibling after a current administrative refusal',async()=>{
  const shared=row('shared',{visibility:'organization',ownerUserId:'u2'});mockRpc(SavedViewService,'ListSavedViews',body=>({views:body.visibility==='organization'?[shared]:[],page:{totalCount:body.visibility==='organization'?'1':'0'},canCreateShared:true}));
  const view=render();await open();fireEvent.click(await screen.findByRole('button',{name:'Rename Release review'}));
  let finish!: (body:object)=>void;const late=new Promise<object>(resolve=>finish=resolve);
  server.use(http.post(`${BACKEND_URL}/${SavedViewService.typeName}/ListSavedViews`,async({request})=>{const body=await request.json() as {visibility:string};return body.visibility==='organization'?HttpResponse.json(await late):HttpResponse.json({views:[],page:{totalCount:'0'},canCreateShared:false});}));
  act(()=>{void view.queryClient.invalidateQueries({queryKey:['savedViews']});});await screen.findByRole('button',{name:'Check editing access'});
  finish({views:[shared],page:{totalCount:'1'},canCreateShared:true});await waitFor(()=>expect(view.queryClient.isFetching()).toBe(0));expect(screen.getByRole('button',{name:'Rename view'})).toBeDisabled();
});
