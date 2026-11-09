import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactService, SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { TaskArtifactLinks } from './TaskArtifactLinks';
import { TaskContext } from './TaskContext';

const link = { id: 'link-1', taskId: 'task-1', artifactId: 'artifact-1', artifactName: 'output.md', taskTitle: 'Review',
  linkedAt: '2026-11-09T12:00:00Z', linkedBy: { kind: 'agent', id: 'worker-1', name: 'Worker One' } };
const evidence = { link, availability: 'available', contentType: 'text/markdown', storedBytes: '0', artifactCreatedAt: '2026-11-09T11:00:00Z' };
const page = (overrides = {}) => ({ links: [link], evidence: [evidence], page: { totalCount: 1 }, canLink: true, canUnlink: true, ...overrides });

function view(content = <TaskArtifactLinks taskId="task-1" orgId="org-1" />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['authSession'], { authenticated: true, userId: 'user-1', mustChangePassword: false });
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/tasks/task-1?org=org-1&project=task-project']}>{child}</MemoryRouter></QueryClientProvider>;
  return { ...render(wrap(content)), client, wrap };
}

beforeEach(() => { mockRpc(ArtifactService, 'ListTaskArtifactLinks', page()); });

describe('current task evidence', () => {
  it('requests bounded metadata and shows linked actor/time, exact zero bytes and an artifact link', async () => {
    const requests: unknown[] = [];
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', request => { requests.push(request); return page(); });
    view();
    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeVisible();
    const artifact = await screen.findByRole('link', { name: 'output.md' });
    expect(artifact).toHaveAttribute('href', '/artifacts/artifact-1?org=org-1');
    expect(screen.getByText('Stored bytes: 0')).toBeVisible();
    expect(screen.getByText(/Linked by Agent Worker One/)).toBeVisible();
    expect(screen.getByText(/Linked at/)).toBeVisible();
    expect(screen.getByText(/Created/)).toBeVisible();
    expect(requests).toContainEqual({ taskId: 'task-1', page: { limit: 20 } });
  });

  it('keeps read-only evidence visible with honest controls', async () => {
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ canLink: false, canUnlink: false }));
    view();
    expect(await screen.findByRole('link', { name: 'output.md' })).toBeVisible();
    expect(screen.getByText('Read only')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Link an artifact…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument();
  });

  it('retains legacy names with unknown metadata/permissions rather than an empty success', async () => {
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', { links: [{ ...link, linkedAt: undefined, linkedBy: undefined }] });
    view();
    expect(await screen.findByRole('link', { name: 'output.md' })).toBeVisible();
    expect(screen.getByText('Link author not recorded')).toBeVisible();
    expect(screen.getByText('Link time not recorded')).toBeVisible();
    expect(screen.getByText('Stored bytes not recorded')).toBeVisible();
    expect(screen.getByText(/Linking controls unavailable/)).toBeVisible();
    expect(screen.queryByText('No evidence linked')).not.toBeInTheDocument();
    expect(screen.queryByText('Read only')).not.toBeInTheDocument();
  });

  it('sanitizes unavailable nested titles and does not offer a source link', async () => {
    const hidden = { ...link, artifactName: 'secret old title' };
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ links: [hidden], evidence: [{ link: hidden, availability: 'unavailable' }] }));
    view();
    expect(await screen.findByText('Artifact unavailable')).toBeVisible();
    expect(screen.queryByText('secret old title')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('loads bounded later pages without dropping earlier evidence', async () => {
    const second = { ...link, id: 'link-2', artifactId: 'artifact-2', artifactName: 'second.md' };
    const requests: unknown[] = [];
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', request => {
      requests.push(request);
      return request.page?.cursor === 'next'
        ? page({ links: [second], evidence: [{ ...evidence, link: second }], page: { totalCount: 2 } })
        : page({ page: { totalCount: 2, nextCursor: 'next' } });
    });
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more evidence' }));
    expect(await screen.findByRole('link', { name: 'second.md' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'output.md' })).toBeVisible();
    expect(requests).toContainEqual({ taskId: 'task-1', page: { limit: 20, cursor: 'next' } });
  });

  it('retains earlier rows and retries a failed next page', async () => {
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ page: { totalCount: 2, nextCursor: 'next' } }));
    view();
    await screen.findByRole('link', { name: 'output.md' });
    mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'unavailable', 'Next page offline');
    fireEvent.click(screen.getByRole('button', { name: 'Load more evidence' }));
    expect(await screen.findByText(/Next page offline/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'output.md' })).toBeVisible();
    const second = { ...link, id: 'link-2', artifactId: 'artifact-2', artifactName: 'second.md' };
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ links: [second], evidence: [{ ...evidence, link: second }], page: { totalCount: 2 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading more evidence' }));
    expect(await screen.findByRole('link', { name: 'second.md' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'output.md' })).toBeVisible();
  });

  it('refreshes mutable metadata without fetching any artifact body or per-row ownership', async () => {
    let bodyReads = 0, ownerReads = 0;
    mockRpc(ArtifactService, 'GetArtifactContent', () => { bodyReads++; return {}; });
    mockRpc(ArtifactService, 'GetArtifact', () => { ownerReads++; return {}; });
    view();
    await screen.findByRole('link', { name: 'output.md' });
    const changed = { ...link, artifactName: 'edited output.md' };
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ links: [changed], evidence: [{ ...evidence, link: changed, storedBytes: '15' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    expect(await screen.findByRole('link', { name: 'edited output.md' })).toBeVisible();
    expect(screen.getByText('Stored bytes: 15')).toBeVisible();
    expect(bodyReads).toBe(0); expect(ownerReads).toBe(0);
  });

  it('places Evidence outside Summary disclosure and before the agent plan', async () => {
    view(<TaskContext taskId="task-1"><TaskArtifactLinks taskId="task-1" orgId="org-1" /></TaskContext>);
    const summary = screen.getByRole('heading', { name: 'Summary' }).closest('details')!;
    const title = await screen.findByRole('heading', { name: 'Evidence' });
    expect(summary).not.toHaveAttribute('open');
    expect(summary).not.toContainElement(title);
    expect(summary.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(screen.getByRole('heading', { name: 'Agent plan' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});


describe('evidence access and intent lifetime', () => {
  it('does not resurrect accepted metadata after denial, a later network failure or remount', async () => {
    const ui = view();
    await screen.findByRole('link', { name: 'output.md' });
    mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'permission_denied', 'Access removed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    await screen.findByText(/Access removed/);
    expect(screen.queryByRole('link', { name: 'output.md' })).not.toBeInTheDocument();
    mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'unavailable', 'Offline now');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/Offline now/);
    expect(screen.queryByRole('link', { name: 'output.md' })).not.toBeInTheDocument();
    ui.rerender(ui.wrap(<TaskArtifactLinks taskId="other-task" orgId="org-1" />));
    await screen.findByText(/Offline now/);
    ui.rerender(ui.wrap(<TaskArtifactLinks taskId="task-1" orgId="org-1" />));
    await screen.findByText(/Offline now/);
    expect(screen.queryByRole('link', { name: 'output.md' })).not.toBeInTheDocument();
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ canLink: false, canUnlink: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'output.md' })).toBeVisible();
    expect(screen.getByText('Read only')).toBeVisible();
  });

  it('rebuilds a loaded page chain with fresh cursors when metadata refreshes', async () => {
    const second = { ...link, id: 'link-2', artifactId: 'artifact-2', artifactName: 'second.md' };
    const requests: string[] = [];
    let generation = 1;
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', request => {
      requests.push(request.page?.cursor || 'first');
      return request.page?.cursor
        ? page({ links: [second], evidence: [{ ...evidence, link: second }], page: { totalCount: 2 } })
        : page({ page: { totalCount: 2, nextCursor: `cursor-${generation}` } });
    });
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more evidence' }));
    await screen.findByRole('link', { name: 'second.md' });
    generation = 2;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    await waitFor(() => expect(requests).toEqual(['first', 'cursor-1', 'first', 'cursor-2']));
    expect(screen.getByRole('link', { name: 'second.md' })).toBeVisible();
  });

  it('fences an old search result immediately when text changes before debounce', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [{ id: 'candidate', type: 'artifact', title: 'Old result' }] });
    const writes: unknown[] = [];
    mockRpc(ArtifactService, 'LinkTaskArtifact', request => { writes.push(request); return { link }; });
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    const input = screen.getByRole('textbox', { name: 'Search artifacts' });
    fireEvent.change(input, { target: { value: 'old' } });
    const stale = await screen.findByRole('button', { name: 'Old result' });
    fireEvent.change(input, { target: { value: 'new' } });
    expect(screen.queryByRole('button', { name: 'Old result' })).not.toBeInTheDocument();
    fireEvent.click(stale);
    expect(writes).toEqual([]);
  });

  it('keeps another task picker intact when an old task link finishes', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [{ id: 'candidate', type: 'artifact', title: 'Candidate' }] });
    const pending = mockRpcPending(ArtifactService, 'LinkTaskArtifact');
    const ui = view();
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'candidate' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Candidate' }));
    await waitFor(() => expect(pending.requests).toEqual([{ taskId: 'task-1', artifactId: 'candidate' }]));
    ui.rerender(ui.wrap(<TaskArtifactLinks taskId="task-2" orgId="org-1" />));
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep this' } });
    await act(async () => pending.resolve({ link }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('keep this'));
  });

  it('retains a pending write fence when its owner is reopened', async () => {
    const pending = mockRpcPending(ArtifactService, 'UnlinkTaskArtifact');
    const ui = view();
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink output.md' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    ui.rerender(ui.wrap(<TaskArtifactLinks taskId="task-2" orgId="org-1" />));
    await screen.findByRole('link', { name: 'output.md' });
    ui.rerender(ui.wrap(<TaskArtifactLinks taskId="task-1" orgId="org-1" />));
    expect(await screen.findByRole('button', { name: 'Unlink output.md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Link an artifact…' })).toBeDisabled();
    await act(async () => pending.resolve({ success: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlink output.md' })).toBeEnabled());
  });
});


afterEach(() => { vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });

describe('visible metadata freshness', () => {
  it('polls only the visible mounted pane and refreshes on focus and reconnect', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let reads = 0;
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', () => { reads++; const changed = { ...link, artifactName: `output-${reads}.md` }; return page({ links: [changed], evidence: [{ ...evidence, link: changed }] }); });
    const ui = view();
    await screen.findByRole('link', { name: 'output-1.md' });
    expect(reads).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    await screen.findByRole('link', { name: 'output-2.md' });
    act(() => focusManager.setFocused(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(reads).toBe(2);
    act(() => focusManager.setFocused(true));
    await screen.findByRole('link', { name: 'output-3.md' });
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await screen.findByRole('link', { name: 'output-4.md' });
    ui.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(reads).toBe(4);
  });

  it('never shows a previous account’s cached evidence while a new account read is pending', async () => {
    const ui = view();
    await screen.findByRole('link', { name: 'output.md' });
    const pending = mockRpcPending(ArtifactService, 'ListTaskArtifactLinks');
    act(() => ui.client.setQueryData(['authSession'], { authenticated: true, userId: 'different-user', mustChangePassword: false }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    expect(screen.queryByRole('link', { name: 'output.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link an artifact…' })).not.toBeInTheDocument();
    await act(async () => pending.resolve(page({ links: [], evidence: [] })));
    expect(await screen.findByText('No evidence linked')).toBeVisible();
  });
});


describe('denial fences', () => {
  it('requires explicit retry after denial even when global cache invalidation runs', async () => {
    const ui = view();
    await screen.findByRole('link', { name: 'output.md' });
    mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'permission_denied', 'Access removed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    await screen.findByText(/Access removed/);
    let reads = 0;
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', () => { reads++; return page(); });
    await act(async () => { await ui.client.invalidateQueries({ queryKey: ['taskArtifactLinks'] }); });
    expect(reads).toBe(0);
    expect(screen.queryByRole('link', { name: 'output.md' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'output.md' })).toBeVisible();
  });

  it('keeps write controls denied until a successful capability refresh', async () => {
    view();
    mockRpcError(ArtifactService, 'UnlinkTaskArtifact', 'permission_denied', 'Write removed');
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink output.md' }));
    await screen.findByText(/Write removed/);
    mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'unavailable', 'Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    await screen.findByText(/Offline/);
    expect(screen.getByRole('button', { name: 'Unlink output.md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Link an artifact…' })).toBeDisabled();
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', page({ canLink: false, canUnlink: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry evidence' }));
    expect(await screen.findByText('Read only')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Unlink output.md' })).not.toBeInTheDocument();
  });
});


it('does not treat a canceled refresh’s old success as fresh write authorization', async () => {
  const ui = view();
  mockRpcError(ArtifactService, 'UnlinkTaskArtifact', 'permission_denied', 'Write removed');
  fireEvent.click(await screen.findByRole('button', { name: 'Unlink output.md' }));
  await screen.findByText(/Write removed/);
  const pending = mockRpcPending(ArtifactService, 'ListTaskArtifactLinks');
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    await act(async () => { await ui.client.cancelQueries({ queryKey: ['taskArtifactLinks'] }); });
    expect(screen.getByRole('button', { name: 'Unlink output.md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Link an artifact…' })).toBeDisabled();
  } finally { pending.resolve(page({ canLink: false, canUnlink: false })); }
});
