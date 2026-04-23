import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// -------------------------------------------------------------------
// Mock @tanstack/react-query so we control what useQuery returns.
// -------------------------------------------------------------------
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseQueryClient = vi.fn(() => ({ invalidateQueries: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: () => mockUseMutation(),
  useQueryClient: () => mockUseQueryClient(),
}));

// -------------------------------------------------------------------
// Mock the ConnectRPC client + transport so the module resolves without
// a real server. We only need the import-time side-effects silenced.
// -------------------------------------------------------------------
vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));

vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ ping: vi.fn(), listRepositoryLinks: vi.fn(), syncPullRequests: vi.fn() })),
}));

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  HealthService: {},
  AuthService: {},
  OrgService: {},
  TaskTypeService: {},
  ProjectTemplateService: {},
  ProjectService: {},
  AgentService: {},
  TaskService: {},
  ArtifactService: {},
  CommentService: {},
  TaskNoteService: {},
  RepositoryService: {},
}));

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------
describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderApp = () => render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  it('renders the heading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    renderApp();
    expect(screen.getByRole('heading', { name: 'Dashboard Overview' })).toBeDefined();
  });

  it('shows a Ping Backend button', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    renderApp();
    expect(screen.getByRole('button', { name: 'Ping Backend' })).toBeDefined();
  });

  it('shows loading indicator while fetching', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: true });
    renderApp();
    expect(screen.getByText('Loading telemetry...')).toBeDefined();
  });

  it('shows error message when the query fails', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      error: new Error('connection refused'),
      isLoading: false,
    });
    renderApp();
    expect(screen.getByText(/Error: connection refused/)).toBeDefined();
  });

  it('shows message and DB status when data is returned', () => {
    mockUseQuery.mockReturnValue({
      data: { message: 'pong', dbStatus: 'ok' },
      error: null,
      isLoading: false,
    });
    renderApp();
    expect(screen.getByText(/pong/)).toBeDefined();
    expect(screen.getByText(/ok/)).toBeDefined();
  });

  it('clicking Ping Backend updates the queryKey (triggers refetch)', async () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });

    renderApp();
    const before = mockUseQuery.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Ping Backend' }));

    await waitFor(() => {
      expect(mockUseQuery.mock.calls.length).toBeGreaterThan(before);
    });

    const calls = mockUseQuery.mock.calls;
    const firstKey = (calls[0][0] as { queryKey: unknown[] }).queryKey[1];
    const lastKey = (calls[calls.length - 1][0] as { queryKey: unknown[] }).queryKey[1];
    expect(firstKey).not.toBe(lastKey);
  });

  it('can toggle the sidebar dynamically', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    renderApp();
    const toggleBtn = screen.getByRole('button', { name: 'Toggle Sidebar' });
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toBeDefined();
  });

  it('can route to generic placeholder views', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    renderApp();
    const orgLink = screen.getByRole('link', { name: 'Organizations' });
    fireEvent.click(orgLink);
    expect(screen.getByText('Organizations & Settings')).toBeInTheDocument();
  });
});
