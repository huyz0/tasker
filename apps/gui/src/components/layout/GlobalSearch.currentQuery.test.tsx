import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending, server } from '../../test/mockRpc';
import { BACKEND_URL } from '../../lib/backendUrl';
import { useLayoutStore } from '../../store/layout';
import { GlobalSearch } from './GlobalSearch';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual('react-router-dom'), useNavigate: () => navigate,
}));

// The real debounce is intentional: old results must stop accepting Enter
// immediately when typing changes, before the next request starts.
function renderSearch(providedClient?: QueryClient) {
  const client = providedClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/tasks?org=o1&project=p1&view=table']}><GlobalSearch /></MemoryRouter>
  </QueryClientProvider>);
  return { ...view, client };
}
function type(text: string) {
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: text } });
  return input;
}
const task = (title: string, id = 'task-b') => ({ id, type: 'task', title, snippet: '' });

beforeEach(() => {
  navigate.mockReset();
  useLayoutStore.setState({ activeOrgId: 'o1', activeProjectId: 'p1', searchOpen: true });
  mockRpc(SearchService, 'UniversalSearch', { results: [] });
  server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({ ok: true })));
});

describe('current search results and visible keyboard order', () => {
  it('starts at the first visible group when server types are interleaved', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [
      { id: 'artifact-b', type: 'artifact', title: 'Artifact match', snippet: '' }, task('Task match'),
    ] });
    renderSearch(); const input = type('match');
    await screen.findByRole('option', { name: 'Task match' });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Task match');
    expect(screen.getByRole('option', { name: 'Task match' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Artifact match' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders Memory results and opens the supported belief detail route', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [{ id: 'belief-b', type: 'belief', title: 'Known convention', snippet: 'Shared knowledge' }] });
    renderSearch(); type('knowledge');
    fireEvent.click(await screen.findByRole('option', { name: /Known convention/ }));
    expect(navigate).toHaveBeenCalledWith('/memory/belief-b');
  });

  it('orders all six result types and keyboard selection by their visible groups', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [
      { id: 'artifact-b', type: 'artifact', title: 'Artifact match', snippet: '' },
      { id: 'belief-b', type: 'belief', title: 'Memory match', snippet: '' },
      { id: 'agent-b', type: 'agent', title: 'Agent match', snippet: '' },
      task('Task match'),
      { id: 'comment-b', type: 'comment', parentType: 'task', parentId: 'task-b', title: 'Comment match', snippet: '' },
      { id: 'p2', type: 'project', title: 'Project match', snippet: '' },
    ] });
    renderSearch(); const input = type('match');
    await screen.findByRole('option', { name: /Memory match/ });
    const titles = ['Task match', 'Artifact match', 'Project match', 'Agent match', 'Comment match', 'Memory match'];
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(titles);
    for (const title of titles) {
      expect(screen.getByRole('option', { name: title })).toHaveAttribute('aria-selected', 'true');
      expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: title }).id);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    expect(screen.getByRole('option', { name: 'Task match' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not open an old result during the real debounce window', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [task('Old match')] });
    renderSearch(); type('old');
    await screen.findByRole('option', { name: 'Old match' });
    const pending = mockRpcPending(SearchService, 'UniversalSearch');
    try {
      const input = type('new');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.queryByRole('option', { name: 'Old match' })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Searching');
      await waitFor(() => expect(pending.requests).toHaveLength(1));
      pending.resolve({ results: [task('New match')] });
      fireEvent.click(await screen.findByRole('option', { name: 'New match' }));
      expect(navigate).toHaveBeenCalledOnce();
    } finally { pending.resolve({ results: [] }); }
  });

  it('shows a retryable initial failure rather than a blank or successful empty search', async () => {
    mockRpcError(SearchService, 'UniversalSearch', 'unavailable', 'Search is offline');
    renderSearch(); type('broken');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search is offline');
    expect(screen.queryByText('No results found.')).not.toBeInTheDocument();
    mockRpc(SearchService, 'UniversalSearch', { results: [task('Recovered match')] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('option', { name: 'Recovered match' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not present the previous query after a later query fails', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [task('Previous match')] });
    renderSearch(); type('previous');
    await screen.findByRole('option', { name: 'Previous match' });
    mockRpcError(SearchService, 'UniversalSearch', 'unavailable', 'Current query failed');
    const input = type('current');
    expect(await screen.findByRole('alert')).toHaveTextContent('Current query failed');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText('No results found.')).not.toBeInTheDocument();
  });

  it('announces a successful no-match result separately from loading', async () => {
    renderSearch(); type('no-match');
    expect(await screen.findByRole('status')).toHaveTextContent(/Searching|No results/);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No results found.'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  for (const kind of ['project', 'agent'] as const) {
    it(`keeps the searched organization on a ${kind} list destination`, async () => {
      mockRpc(SearchService, 'UniversalSearch', { results: [{ id: kind === 'project' ? 'p2' : 'agent-b', type: kind, title: 'Scoped match', snippet: '' }] });
      renderSearch(); type('scoped');
      fireEvent.click(await screen.findByRole('option', { name: 'Scoped match' }));
      expect(navigate).toHaveBeenCalledWith(kind === 'project' ? '/projects?org=o1&project=p2' : '/agents?org=o1&project=p1');
    });
  }

  it('asks for an organization without sending an empty-org search request', async () => {
    useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
    const requests: unknown[] = [];
    mockRpc(SearchService, 'UniversalSearch', body => { requests.push(body); return { results: [] }; });
    renderSearch(); type('query');
    expect(screen.getByRole('status')).toHaveTextContent('Select an organization');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    expect(requests).toEqual([]);
  });
});

describe('search races and refresh authority', () => {
  for (const change of ['query', 'organization'] as const) {
    it(`ignores an older response after the ${change} changes`, async () => {
      const pending = mockRpcPending(SearchService, 'UniversalSearch');
      renderSearch(); type('older');
      try {
        await waitFor(() => expect(pending.requests).toHaveLength(1));
        mockRpc(SearchService, 'UniversalSearch', { results: [task('Current match')] });
        if (change === 'query') type('current');
        else act(() => useLayoutStore.setState({ activeOrgId: 'o2', activeProjectId: 'p2' }));
        await screen.findByRole('option', { name: 'Current match' });
        await act(async () => {
          pending.resolve({ results: [task('Obsolete match')] });
          await new Promise(resolve => setTimeout(resolve, 0));
        });
        expect(screen.getAllByRole('option')).toHaveLength(1);
        expect(screen.getByRole('option', { name: 'Current match' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('option', { name: 'Obsolete match' })).not.toBeInTheDocument();
      } finally { pending.resolve({ results: [] }); }
    });
  }

  it('hides cached suggestions after a background access denial and recovers with retry', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [task('Previously authorized match')] });
    const view = renderSearch(); type('known');
    await screen.findByRole('option', { name: 'Previously authorized match' });
    mockRpcError(SearchService, 'UniversalSearch', 'permission_denied', 'Search access removed');
    await act(async () => { await view.client.invalidateQueries({ queryKey: ['universalSearch', 'known', 'o1'] }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Search access removed');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    mockRpc(SearchService, 'UniversalSearch', { results: [task('Fresh authorized match')] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('option', { name: 'Fresh authorized match' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats whitespace as the empty invitation without requesting an invalid query', async () => {
    const requests: unknown[] = [];
    mockRpc(SearchService, 'UniversalSearch', body => { requests.push(body); return { results: [] }; });
    renderSearch(); type('   ');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    expect(requests).toEqual([]);
    expect(screen.getByText(/Search across tasks/)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});

describe('combobox focus ownership', () => {
  it('keeps result options out of Tab order while input arrows own selection', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [task('Keyboard match')] });
    renderSearch(); const input = type('keyboard');
    await screen.findByRole('option', { name: 'Keyboard match' });
    const user = userEvent.setup();
    expect(input).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close search' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close search' })).toHaveFocus();
  });

  it('hands focus to the input before Retry unmounts its button', async () => {
    mockRpcError(SearchService, 'UniversalSearch', 'unavailable', 'Retry this query');
    renderSearch(); const input = type('retry');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const pending = mockRpcPending(SearchService, 'UniversalSearch');
    try {
      await userEvent.setup().click(retry);
      expect(input).toHaveFocus();
      pending.resolve({ results: [task('Recovered keyboard match')] });
      await screen.findByRole('option', { name: 'Recovered keyboard match' });
      expect(input).toHaveFocus();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(navigate).toHaveBeenCalledWith('/tasks/task-b');
    } finally { pending.resolve({ results: [] }); }
  });
});

describe('search response clarity under application defaults', () => {
  it('does not repeat a short Memory statement as its own snippet', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [{ id: 'belief-b', type: 'belief', title: 'Known convention', snippet: 'Known convention' }] });
    renderSearch(); type('known');
    const option = await screen.findByRole('option');
    expect(option).toHaveAccessibleName('Known convention');
  });

  it('offers explicit retry after one failed request even when the app retries other queries', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1000 } } });
    let requests = 0;
    server.use(http.post(`${BACKEND_URL}/${SearchService.typeName}/UniversalSearch`, () => {
      requests++;
      return HttpResponse.json({ code: 'unavailable', message: 'Search failed promptly' }, { status: 503 });
    }));
    renderSearch(client); type('failed');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search failed promptly');
    expect(requests).toBe(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('organization-only source context', () => {
  it('opens an agent list without inventing a project for organization Memory', async () => {
    useLayoutStore.setState({ activeProjectId: '' });
    mockRpc(SearchService, 'UniversalSearch', { results: [{ id: 'agent-b', type: 'agent', title: 'Organization agent', snippet: '' }] });
    renderSearch(); type('agent');
    fireEvent.click(await screen.findByRole('option', { name: 'Organization agent' }));
    expect(navigate).toHaveBeenCalledWith('/agents?org=o1');
  });
});
