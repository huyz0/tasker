import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AttentionService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, mockRpcPending, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { AttentionScreen } from './AttentionScreen';

const endpoint = `${BACKEND_URL}/${AttentionService.typeName}/ListAttention`;
const kinds = ['question', 'approval', 'review', 'stalled_claim'];
function row(kind = 'question', index = 0) {
  return { kind, sourceId: `${kind}-${index}`, taskId: `task-${index}`, taskDisplayId: `WORK-${index}`, taskTitle: `Work item ${index}`,
    taskStatus: 'working', projectId: index % 2 ? 'project-b' : 'project-a', projectName: index % 2 ? 'Beta project' : 'Alpha project',
    reason: kind === 'question' ? `Question ${index}` : kind === 'approval' ? 'Requested move working → shipped' : kind === 'review' ? 'You are a reviewer on this open task' : 'No task activity for more than 24 hours',
    since: '2026-11-09T12:00:00Z', sinceKind: kind === 'review' ? 'task_created_at' : kind === 'stalled_claim' ? 'silent_since' : kind === 'approval' ? 'requested_at' : 'asked_at', actorKind: kind === 'review' ? 'user' : 'agent', actorName: 'Worker One' };
}
const result = (kind = 'question', overrides = {}) => ({ items: [row(kind)], page: { totalCount: 1 }, observedAt: '2026-11-09T13:00:00Z', ...overrides });
function view(entry = '/attention?org=org-1', client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), content: ReactElement = <AttentionScreen />) {
  client.setQueryData(['authSession'], { authenticated: true, userId: 'user-1' });
  return renderScoped(content, { initialEntry: entry, queryClient: client });
}
beforeEach(() => { server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({}))); mockRpc(AttentionService, 'ListAttention', request => result(request.kind)); });

describe('Attention source navigation and layout', () => {
  it('reads each bounded source independently and links actual project scope', async () => {
    const requests: unknown[] = [];
    mockRpc(AttentionService, 'ListAttention', request => { requests.push(request); return result(request.kind); });
    view();
    expect(await screen.findByRole('heading', { name: 'Attention', level: 1 })).toBeVisible();
    expect(await screen.findByText('Question 0')).toBeVisible();
    await waitFor(() => expect(requests).toHaveLength(4));
    for (const kind of kinds) expect(requests).toContainEqual({ orgId: 'org-1', kind, page: { limit: 20 } });
    const nav = screen.getByRole('navigation', { name: 'Attention sources' });
    expect(within(nav).getByRole('link', { name: /Questions/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Open task WORK-0' })).toHaveAttribute('href', '/tasks/task-0?org=org-1&project=project-a');
    expect(screen.getByText('All projects in this organization')).toBeVisible();
    expect(screen.getByText('1 loaded of 1')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Resolve|Release|Approve review/ })).not.toBeInTheDocument();
  });

  it('does not request sources without an organization', async () => {
    let reads = 0; mockRpc(AttentionService, 'ListAttention', request => { reads++; return result(request.kind); });
    view('/attention');
    expect(await screen.findByText(/Choose an organization/)).toBeVisible();
    expect(reads).toBe(0);
  });

  it('keeps failed counts unknown and other source groups reachable', async () => {
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string };
      return body.kind === 'approval' ? HttpResponse.json({ code: 'unavailable', message: 'Approvals offline' }, { status: 503 }) : HttpResponse.json(result(body.kind));
    }));
    view(); await screen.findByText('Question 0');
    fireEvent.click(screen.getByRole('link', { name: /Approvals/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Approvals offline');
    expect(screen.getByRole('link', { name: /Approvals/ })).toHaveTextContent('Unavailable');
    expect(screen.queryByText('0 loaded of 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Your reviews/ }));
    expect(await screen.findByText('Review assignment date not recorded')).toBeVisible();
    expect(screen.getByText(/Task created/)).toBeVisible();
    expect(screen.getByText('Owner: You')).toBeVisible();
  });

  it('reaches125 rows without automatic fetch-all and preserves each group extent', async () => {
    const requests: { kind: string; page?: { cursor?: string } }[] = [];
    mockRpc(AttentionService, 'ListAttention', request => {
      requests.push(request); const start = Number(request.page?.cursor ?? 0);
      return result(request.kind, { items: Array.from({ length: Math.min(20, 125 - start) }, (_, i) => row(request.kind, start + i)),
        page: { totalCount: 125, ...(start + 20 < 125 ? { nextCursor: String(start + 20) } : {}) } });
    });
    view(); await screen.findByText('20 loaded of 125');
    expect(requests.every(request => !request.page?.cursor)).toBe(true);
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Load more questions' }));
      await screen.findByText(`${Math.min(40 + i * 20, 125)} loaded of 125`);
    }
    expect(screen.getAllByRole('link', { name: /^Open task WORK-/ })).toHaveLength(125);
    fireEvent.click(screen.getByRole('link', { name: /Approvals/ })); await screen.findByText('20 loaded of 125');
    fireEvent.click(screen.getByRole('link', { name: /Questions/ })); await screen.findByText('125 loaded of 125');
    expect(screen.queryByRole('button', { name: 'Load more questions' })).not.toBeInTheDocument();
  });

  it('retains rows on next-page failure and retries only that page', async () => {
    let offline = true;
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string; page?: { cursor?: string } };
      if (body.page?.cursor && offline) return HttpResponse.json({ code: 'unavailable', message: 'Page offline' }, { status: 503 });
      return HttpResponse.json(result(body.kind, { items: [row(body.kind, body.page?.cursor ? 1 : 0)], page: { totalCount: 2, ...(!body.page?.cursor ? { nextCursor: 'second' } : {}) } }));
    }));
    view(); fireEvent.click(await screen.findByRole('button', { name: 'Load more questions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Page offline');
    expect(screen.getByText('Question 0')).toBeVisible();
    offline = false; fireEvent.click(screen.getByRole('button', { name: 'Retry loading more questions' }));
    expect(await screen.findByText('Question 1')).toBeVisible(); expect(screen.getByText('2 loaded of 2')).toBeVisible();
  });

  it('rebuilds the loaded chain with fresh cursors and deduplicates source identities', async () => {
    let generation = 'old'; const requests: string[] = [];
    mockRpc(AttentionService, 'ListAttention', request => {
      if (request.kind !== 'question') return result(request.kind);
      requests.push(request.page?.cursor || 'first');
      return result('question', { items: request.page?.cursor ? [row('question'), row('question', 1)] : [row('question')], page: { totalCount: 2, ...(!request.page?.cursor ? { nextCursor: generation } : {}) } });
    });
    view(); fireEvent.click(await screen.findByRole('button', { name: 'Load more questions' })); await screen.findByText('2 loaded of 2');
    generation = 'new'; fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' }));
    await waitFor(() => expect(requests).toEqual(['first', 'old', 'first', 'new']));
    expect(screen.getAllByRole('link', { name: /^Open task WORK-/ })).toHaveLength(2);
  });

  it('labels literal excerpts, missing actors and actual silence without invented liveness', async () => {
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind, { items: [{ ...row(request.kind), actorName: undefined, actorKind: undefined, reason: '漢😀<script>literal</script>', reasonTruncated: true }] }));
    view('/attention?org=org-1&kind=stalled_claim');
    expect(await screen.findByText('漢😀<script>literal</script>')).toBeVisible();
    expect(screen.getByText(/No task activity since/)).toBeVisible();
    expect(screen.getByText('Holder not recorded')).toBeVisible();
    expect(screen.queryByText(/Dead worker|Agent stopped/)).not.toBeInTheDocument();
  });
});

function ScopeNavigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/attention?org=org-1&project=project-a')}>Project A</button>
    <button onClick={() => navigate('/attention?org=org-1&project=project-b')}>Project B</button>
    <button onClick={() => navigate('/attention?org=org-1')}>All projects</button><AttentionScreen /></>;
}
const fail = (code: string, message: string) => HttpResponse.json({ code, message }, { status: 400 });

describe('Attention current authority lifetime', () => {
  it.each(['permission_denied', 'unauthenticated'])('hides every group after %s and only explicit fresh group retry restores it', async code => {
    const ui = view(); await screen.findByText('Question 0');
    await waitFor(() => expect(screen.getAllByText('1 current')).toHaveLength(4));
    server.use(http.post(endpoint, () => fail(code, 'Task access removed')));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    fireEvent.click(screen.getByRole('link', { name: /Your reviews/ }));
    expect(screen.queryByText('Work item 0')).not.toBeInTheDocument();
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind));
    await act(async () => ui.queryClient.invalidateQueries());
    expect(screen.queryByText('Work item 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Work item 0')).toBeVisible();
    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
  });

  it('keeps denied cached data hidden through offline retry and unmount/remount', async () => {
    const ui = view(); await screen.findByText('Question 0');
    server.use(http.post(endpoint, () => fail('permission_denied', 'Access removed')));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' })); await screen.findByRole('alert');
    server.use(http.post(endpoint, () => fail('unavailable', 'Offline retry')));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Offline retry'));
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
    ui.unmount(); view('/attention?org=org-1', ui.queryClient);
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
  });

  it('quarantines a hidden sibling success that started before another group denied', async () => {
    let resolveApproval!: () => void; const pending = new Promise<void>(resolve => { resolveApproval = resolve; });
    let deny = false, approvalStarted = false;
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string };
      if (body.kind === 'approval') { approvalStarted = true; await pending; }
      return deny && body.kind === 'question' ? fail('permission_denied', 'Question read denied') : HttpResponse.json(result(body.kind));
    }));
    view(); await screen.findByText('Question 0'); await waitFor(() => expect(approvalStarted).toBe(true));
    deny = true; fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' })); await screen.findByRole('alert');
    await act(async () => resolveApproval());
    fireEvent.click(screen.getByRole('link', { name: /Approvals/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('denied'));
    expect(screen.queryByText('Requested move working → shipped')).not.toBeInTheDocument();
  });

  it('fences same-org project B and All projects caches after project A loses shared authority', async () => {
    view('/attention?org=org-1&project=project-b', undefined, <ScopeNavigation />); await screen.findByText('Question 0');
    fireEvent.click(screen.getByRole('button', { name: 'All projects' })); await screen.findByText('Question 0');
    fireEvent.click(screen.getByRole('button', { name: 'Project A' })); await screen.findByText('Question 0');
    server.use(http.post(endpoint, () => fail('permission_denied', 'Shared authority removed')));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' })); await screen.findByRole('alert');
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind));
    fireEvent.click(screen.getByRole('button', { name: 'Project B' }));
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All projects' }));
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('Question 0')).toBeVisible();
  });

  it('treats project NotFound locally while another permitted project remains reachable', async () => {
    view('/attention?org=org-1&project=project-a', undefined, <ScopeNavigation />); await screen.findByText('Question 0');
    server.use(http.post(endpoint, () => fail('not_found', 'Project unavailable')));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('link', { name: /Your reviews/ }));
    expect(screen.queryByText('Work item 0')).not.toBeInTheDocument();
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind));
    fireEvent.click(screen.getByRole('button', { name: 'Project B' })); expect(await screen.findByText('Question 0')).toBeVisible();
  });

  it('does not accept cached isSuccess after explicit denied recovery is cancelled and globally invalidated', async () => {
    const ui = view(); await screen.findByText('Question 0');
    server.use(http.post(endpoint, () => fail('permission_denied', 'Access removed')));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' })); await screen.findByRole('alert');
    const cached = ui.queryClient.getQueryData(['attention', 'user-1', 'org-1', '', 'question']);
    act(() => ui.queryClient.setQueryData(['attention', 'user-1', 'org-1', '', 'question'], cached));
    let pendingStarted = false;
    server.use(http.post(endpoint, async ({ request }) => {
      pendingStarted = true;
      return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await waitFor(() => expect(pendingStarted).toBe(true));
    await act(async () => ui.queryClient.cancelQueries({ queryKey: ['attention'] }));
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
    await act(async () => ui.queryClient.invalidateQueries());
    expect(screen.queryByText('Question 0')).not.toBeInTheDocument();
    expect(screen.queryByText('1 loaded of 1')).not.toBeInTheDocument();
  });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });
function ReturnHarness() {
  const navigate = useNavigate();
  return <Routes><Route path="/attention" element={<AttentionScreen />} />
    <Route path="/tasks/:taskId" element={<button onClick={() => navigate(-1)}>Back to attention</button>} /></Routes>;
}

describe('Attention canonical task and Back navigation', () => {
  it.each([false, true])('restores extent and useful focus once after current pages settle (source gone: %s)', async gone => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); let returning = false, snapshot = 0;
    mockRpc(AttentionService, 'ListAttention', request => {
      if (request.kind !== 'question') return result(request.kind);
      const start = request.page?.cursor ? 20 : 0; if (!start) snapshot++;
      return result('question', { items: Array.from({ length: 20 }, (_, i) => ({ ...row('question', start + i), reason: `Question ${start + i} · snapshot ${snapshot}` })).filter(item => !(returning && gone && item.sourceId === 'question-20')),
        page: { totalCount: returning && gone ? 39 : 40, ...(!start ? { nextCursor: 'page-2' } : {}) } });
    });
    const ui = view('/attention?org=org-1&kind=question', undefined, <ReturnHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more questions' })); await screen.findByText('40 loaded of 40');
    const target = screen.getByRole('link', { name: 'Open task WORK-20' }); target.focus(); fireEvent.click(target);
    expect(ui.location.url).toBe('/tasks/task-20?org=org-1&project=project-a');
    returning = true; fireEvent.click(screen.getByRole('button', { name: 'Back to attention' }));
    await screen.findByText(gone ? '39 loaded of 39' : '40 loaded of 40');
    await waitFor(() => expect(gone ? screen.getByRole('heading', { name: 'Questions', level: 2 }) : screen.getByRole('link', { name: 'Open task WORK-20' })).toHaveFocus());
    expect(ui.location.url).toBe('/attention?org=org-1&kind=question'); expect(scroll).toHaveBeenCalledTimes(1);
    const refresh = screen.getByRole('button', { name: 'Refresh questions' }); refresh.focus(); fireEvent.click(refresh);
    await screen.findByText('Question 0 · snapshot 3');
    await waitFor(() => expect(refresh).toBeEnabled()); expect(refresh).toHaveFocus(); expect(scroll).toHaveBeenCalledTimes(1);
  });
});

describe('Attention independent freshness and honest states', () => {
  it('retains accepted rows on a transient refresh failure with stale counts', async () => {
    view(); await screen.findByText('Question 0');
    server.use(http.post(endpoint, () => fail('unavailable', 'Temporary network error')));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('out of date'));
    expect(screen.getByText('Question 0')).toBeVisible(); expect(screen.getByText('1 loaded of 1')).toBeVisible();
    expect(screen.getByRole('link', { name: /Questions/ })).toHaveTextContent('Out of date');
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('keeps empty guidance local to the chosen source', async () => {
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind, { items: [], page: { totalCount: 0 } }));
    view(); expect(await screen.findByText('No open questions in this scope.')).toBeVisible();
    expect(screen.getByText('0 loaded of 0')).toBeVisible(); expect(screen.queryByText(/All caught up/)).not.toBeInTheDocument();
  });

  it('labels excerpts, human requesters and unavailable dates without evaluating content', async () => {
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind, { items: [{ ...row(request.kind), taskDisplayId: '', reason: '<script>literal</script>', reasonTruncated: true, actorKind: 'user', actorName: 'Alex Morgan', since: undefined }] }));
    view(); expect(await screen.findByText('<script>literal</script>')).toBeVisible();
    expect(screen.getByText('Excerpt · Open task for the full question.')).toBeVisible();
    expect(screen.getByText('Asked by Alex Morgan')).toBeVisible(); expect(screen.getByText('Asked at not recorded')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open task Work item 0' })).toBeVisible();
  });

  it('pauses hidden polling and refreshes only the visible active group on focus/reconnect', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); focusManager.setFocused(true);
    const reads = { question: 0, approval: 0, review: 0, stalled_claim: 0 };
    mockRpc(AttentionService, 'ListAttention', request => {
      const count = ++reads[request.kind as keyof typeof reads];
      return result(request.kind, { items: [{ ...row(request.kind), reason: `${request.kind} response ${count}` }] });
    });
    view(); await screen.findByText('question response 1');
    await waitFor(() => expect(screen.getAllByText('1 current')).toHaveLength(4));
    expect(Object.values(reads)).toEqual([1, 1, 1, 1]);
    await act(async () => vi.advanceTimersByTimeAsync(15_000)); await screen.findByText('question response 2');
    expect(reads.approval).toBe(1);
    act(() => focusManager.setFocused(false)); await act(async () => vi.advanceTimersByTimeAsync(30_000)); expect(reads.question).toBe(2);
    act(() => focusManager.setFocused(true)); await screen.findByText('question response 3');
    fireEvent.click(screen.getByRole('link', { name: /Approvals/ })); await screen.findByText('approval response 2');
    await act(async () => vi.advanceTimersByTimeAsync(15_000)); await screen.findByText('approval response 3'); expect(reads.question).toBe(3);
    act(() => onlineManager.setOnline(false)); act(() => onlineManager.setOnline(true)); await screen.findByText('approval response 4');
    expect(reads.review).toBe(1); expect(reads.stalled_claim).toBe(1);
  });

  it('does not expose one verified account response in another account', async () => {
    let account = 'user-1', resolveOld!: () => void, started = false;
    const pending = new Promise<void>(resolve => { resolveOld = resolve; });
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string }; const captured = account;
      if (captured === 'user-1' && body.kind === 'question') { started = true; await pending; }
      return HttpResponse.json(result(body.kind, { items: [{ ...row(body.kind), reason: `Private ${captured}` }] }));
    }));
    const ui = view(); await waitFor(() => expect(started).toBe(true)); account = 'user-2';
    act(() => ui.queryClient.setQueryData(['authSession'], { authenticated: true, userId: account }));
    expect(await screen.findByText('Private user-2')).toBeVisible();
    await act(async () => resolveOld()); expect(screen.queryByText('Private user-1')).not.toBeInTheDocument();
  });

  it('keeps late project A data separate from the current project B screen', async () => {
    let resolveOld!: () => void, started = false; const pending = new Promise<void>(resolve => { resolveOld = resolve; });
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string; projectId: string };
      if (body.projectId === 'project-a' && body.kind === 'question') { started = true; await pending; }
      return HttpResponse.json(result(body.kind, { items: [{ ...row(body.kind), reason: `Private ${body.projectId}` }] }));
    }));
    const ui = view('/attention?org=org-1&project=project-a', undefined, <ScopeNavigation />); await waitFor(() => expect(started).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Project B' })); expect(await screen.findByText('Private project-b')).toBeVisible();
    await act(async () => resolveOld()); expect(screen.queryByText('Private project-a')).not.toBeInTheDocument();
    expect(ui.location.search).toContain('project=project-b');
  });
});

describe('Attention return reconciliation failure lifetime', () => {
  it.each(['unavailable', 'permission_denied'])('consumes a %s Back failure before background/explicit recovery can steal focus', async code => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); let phase = 'initial';
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string };
      if (phase === 'failed' && body.kind === 'question') return fail(code, 'Return read failed');
      return HttpResponse.json(result(body.kind, { items: [row(body.kind)], page: { totalCount: 1 } }));
    }));
    const ui = view('/attention?org=org-1', undefined, <ReturnHarness />);
    fireEvent.click(await screen.findByRole('link', { name: 'Open task WORK-0' }));
    phase = 'failed'; fireEvent.click(screen.getByRole('button', { name: 'Back to attention' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Return read failed'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Questions', level: 2 })).toHaveFocus());
    const sourceLink = screen.getByRole('link', { name: /Questions/ }); sourceLink.focus(); const priorScrolls = scroll.mock.calls.length;
    phase = 'recovered';
    if (code === 'permission_denied') fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    else await act(async () => ui.queryClient.invalidateQueries({ queryKey: ['attention'] }));
    await screen.findByText('Question 0');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(sourceLink).toHaveFocus(); expect(scroll.mock.calls).toHaveLength(priorScrolls);
  });
});

describe('Attention pending return and account guards', () => {
  it('retires pending return intent when the person focuses another control', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    let phase = 'initial', started = false, resolveReturn!: () => void;
    const pending = new Promise<void>(resolve => { resolveReturn = resolve; });
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string };
      if (phase === 'returning' && body.kind === 'question') { started = true; await pending; }
      return HttpResponse.json(result(body.kind));
    }));
    view('/attention?org=org-1', undefined, <ReturnHarness />);
    fireEvent.click(await screen.findByRole('link', { name: 'Open task WORK-0' }));
    phase = 'returning'; fireEvent.click(screen.getByRole('button', { name: 'Back to attention' })); await waitFor(() => expect(started).toBe(true));
    const navigation = screen.getByRole('link', { name: /Questions/ }); navigation.focus();
    await act(async () => resolveReturn()); await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh questions' })).toBeEnabled());
    expect(navigation).toHaveFocus(); expect(scroll).not.toHaveBeenCalled();
  });

  it('settles a cancelled initial Back read once before a later recovery', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); let phase = 'initial', started = false;
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string };
      if (phase === 'returning' && body.kind === 'question') {
        started = true; return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      }
      return HttpResponse.json(result(body.kind));
    }));
    const ui = view('/attention?org=org-1', undefined, <ReturnHarness />);
    fireEvent.click(await screen.findByRole('link', { name: 'Open task WORK-0' }));
    phase = 'returning'; fireEvent.click(screen.getByRole('button', { name: 'Back to attention' })); await waitFor(() => expect(started).toBe(true));
    await act(async () => ui.queryClient.cancelQueries({ queryKey: ['attention'] }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Questions', level: 2 })).toHaveFocus());
    const navigation = screen.getByRole('link', { name: /Questions/ }); navigation.focus(); const prior = scroll.mock.calls.length;
    phase = 'recovered'; await act(async () => ui.queryClient.invalidateQueries({ queryKey: ['attention'] }));
    expect(navigation).toHaveFocus(); expect(scroll.mock.calls).toHaveLength(prior);
  });

  it('waits for the verified account and does not read sources after sign-out', async () => {
    let resolveAccount!: () => void, reads = 0; const pending = new Promise<void>(resolve => { resolveAccount = resolve; });
    server.use(http.get(`${BACKEND_URL}/api/auth/session`, async () => { await pending; return HttpResponse.json({ authenticated: false }); }));
    mockRpc(AttentionService, 'ListAttention', request => { reads++; return result(request.kind); });
    renderScoped(<AttentionScreen />, { initialEntry: '/attention?org=org-1' });
    expect(await screen.findByText('Checking account…')).toBeVisible();
    await act(async () => resolveAccount()); expect(await screen.findByText('Sign in to view attention.')).toBeVisible(); expect(reads).toBe(0);
  });
});

describe('Attention source and request generation identity', () => {
  it('keeps two questions on the same task as separate source rows', async () => {
    mockRpc(AttentionService, 'ListAttention', request => result(request.kind, { items: [row(request.kind), { ...row(request.kind), sourceId: `${request.kind}-second`, reason: 'A different source on the same task' }], page: { totalCount: 2 } }));
    view(); expect(await screen.findByText('2 loaded of 2')).toBeVisible();
    expect(screen.getByText('Question 0')).toBeVisible(); expect(screen.getByText('A different source on the same task')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Open task WORK-0' })).toHaveLength(2);
  });

  it('ignores a pre-denial sibling failure after a fresh explicit read has restored a group', async () => {
    let resolveOld!: () => void, approvalStarted = false, phase = 'initial'; const pending = new Promise<void>(resolve => { resolveOld = resolve; });
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as { kind: string };
      if (body.kind === 'approval') { approvalStarted = true; await pending; return fail('permission_denied', 'Old approval refusal'); }
      if (body.kind === 'question' && phase === 'denied') return fail('permission_denied', 'Current access removed');
      return HttpResponse.json(result(body.kind));
    }));
    view(); await screen.findByText('Question 0'); await waitFor(() => expect(approvalStarted).toBe(true));
    phase = 'denied'; fireEvent.click(screen.getByRole('button', { name: 'Refresh questions' })); await screen.findByRole('alert');
    phase = 'restored'; fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('Question 0')).toBeVisible();
    await act(async () => resolveOld());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh questions' })).toBeEnabled());
    expect(screen.getByText('Question 0')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('never repeats return scrolling during a later background refresh without new interaction', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const ui = view('/attention?org=org-1', undefined, <ReturnHarness />);
  fireEvent.click(await screen.findByRole('link', { name: 'Open task WORK-0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to attention' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'Open task WORK-0' })).toHaveFocus());
  expect(scroll).toHaveBeenCalledTimes(1);
  const pending = mockRpcPending(AttentionService, 'ListAttention'); let refresh!: Promise<void>;
  act(() => { refresh = ui.queryClient.invalidateQueries({ queryKey: ['attention'] }); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh questions' })).toBeDisabled());
  await act(async () => { pending.resolve(result('question')); await refresh; });
  expect(scroll).toHaveBeenCalledTimes(1);
});
