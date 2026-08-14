import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { mockUniversalSearch, mockNavigate } = vi.hoisted(() => ({
  mockUniversalSearch: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ universalSearch: mockUniversalSearch })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  SearchService: 'SearchService',
}));
vi.mock('../../lib/connectTransport', () => ({ transport: {} }));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector: any) => selector({ activeOrgId: 'org-1' })),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// useDebounce is mocked to apply the debounced value immediately, so tests
// don't need to deal with the real 300ms delay.
vi.mock('use-debounce', () => ({
  useDebounce: (value: string) => [value, { flush: vi.fn(), cancel: vi.fn() }],
}));

import { GlobalSearch, resultRoute } from './GlobalSearch';

function renderSearch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    mockUniversalSearch.mockReset();
    mockNavigate.mockReset();
    mockUniversalSearch.mockResolvedValue({ results: [] });
  });

  it('renders the closed search button by default', () => {
    renderSearch();
    expect(screen.getByText('Search tasks, artifacts...')).toBeInTheDocument();
  });

  it('opens the search dialog when the button is clicked', () => {
    renderSearch();
    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument();
  });

  it('opens the search dialog on Cmd+K and closes it on Escape', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Type a command or search...')).not.toBeInTheDocument();
  });

  it('closes the dialog when the close button is clicked', () => {
    renderSearch();
    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByPlaceholderText('Type a command or search...')).not.toBeInTheDocument();
  });

  it('shows a loading state while the search request is in flight', async () => {
    let resolveSearch: (v: any) => void = () => {};
    mockUniversalSearch.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));
    renderSearch();

    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.change(screen.getByPlaceholderText('Type a command or search...'), { target: { value: 'foo' } });

    await waitFor(() => expect(screen.getByText('Searching...')).toBeInTheDocument());
    resolveSearch({ results: [] });
  });

  it('shows "No results found" when the search returns nothing for a non-empty query', async () => {
    mockUniversalSearch.mockResolvedValue({ results: [] });
    renderSearch();

    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.change(screen.getByPlaceholderText('Type a command or search...'), { target: { value: 'nothing-matches' } });

    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument());
  });

  it('renders task and artifact results with their snippet', async () => {
    mockUniversalSearch.mockResolvedValue({
      results: [
        { id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: 'login flow' },
        { id: 'art-1', type: 'artifact', title: 'Design doc', snippet: '' },
      ],
    });
    renderSearch();

    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.change(screen.getByPlaceholderText('Type a command or search...'), { target: { value: 'query' } });

    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());
    expect(screen.getByText('login flow')).toBeInTheDocument();
    expect(screen.getByText('Design doc')).toBeInTheDocument();
  });

  it('navigates to a task result and closes the dialog on click', async () => {
    mockUniversalSearch.mockResolvedValue({
      results: [{ id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: 'login flow' }],
    });
    renderSearch();

    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.change(screen.getByPlaceholderText('Type a command or search...'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Fix login bug'));
    expect(mockNavigate).toHaveBeenCalledWith(resultRoute({ type: 'task', id: 'tsk-1' }));
    expect(mockNavigate).toHaveBeenCalledWith('/tasks/tsk-1');
    expect(screen.queryByPlaceholderText('Type a command or search...')).not.toBeInTheDocument();
  });

  it('hides a result whose type this build has no route for, instead of offering a dead click', async () => {
    mockUniversalSearch.mockResolvedValue({
      results: [
        { id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: '' },
        { id: 'prj-1', type: 'project', title: 'Some future type', snippet: '' },
      ],
    });
    renderSearch();

    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.change(screen.getByPlaceholderText('Type a command or search...'), { target: { value: 'query' } });

    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());
    expect(screen.queryByText('Some future type')).not.toBeInTheDocument();
  });

  it('maps every result type the backend emits to a route, and nothing else', () => {
    // universalSearch pushes exactly these two types (search.handler.ts).
    expect(resultRoute({ type: 'task', id: 'tsk-1' })).toBe('/tasks/tsk-1');
    expect(resultRoute({ type: 'artifact', id: 'art-1' })).toBe('/artifacts/art-1');
    expect(resultRoute({ type: 'project', id: 'prj-1' })).toBeNull();
  });

  it('navigates to an artifact result on click', async () => {
    mockUniversalSearch.mockResolvedValue({
      results: [{ id: 'art-1', type: 'artifact', title: 'Design doc', snippet: '' }],
    });
    renderSearch();

    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    fireEvent.change(screen.getByPlaceholderText('Type a command or search...'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Design doc')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Design doc'));
    expect(mockNavigate).toHaveBeenCalledWith('/artifacts/art-1');
  });

  it('closes the dialog when clicking the backdrop overlay', () => {
    renderSearch();
    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument();

    const overlay = document.body.querySelector('.fixed.inset-0')!;
    fireEvent.click(overlay);

    expect(screen.queryByPlaceholderText('Type a command or search...')).not.toBeInTheDocument();
  });

  it('does not call universalSearch while the query is empty', () => {
    renderSearch();
    fireEvent.click(screen.getByText('Search tasks, artifacts...'));
    expect(mockUniversalSearch).not.toHaveBeenCalled();
  });
});
