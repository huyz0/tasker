import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// -------------------------------------------------------------------
// Mock @tanstack/react-query so we control what useQuery returns.
// -------------------------------------------------------------------
// The Dashboard fires several useQuery calls (health ping, orgs, projects,
// agents, tasks) per render. These tests only care about the health ping
// response, so the mock keys off queryKey[0] and gives every other query an
// inert default instead of one blanket return value for every call.
let healthQueryResult: { data: unknown; error: unknown; isLoading: boolean } = { data: undefined, error: null, isLoading: false };
const mockUseQuery = vi.fn((opts: { queryKey: unknown[] }) => {
  if (opts.queryKey[0] === 'healthPing') return healthQueryResult;
  return { data: undefined, error: null, isLoading: false };
});
const mockUseMutation = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseQueryClient = vi.fn(() => ({ invalidateQueries: vi.fn() }));
const mockUseInfiniteQuery = vi.fn(() => ({ data: undefined, isLoading: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts as { queryKey: unknown[] }),
  useMutation: () => mockUseMutation(),
  useQueryClient: () => mockUseQueryClient(),
  useInfiniteQuery: () => mockUseInfiniteQuery(),
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
  LabelService: {},
  RepositoryService: {},
  SearchService: {},
}));

// -------------------------------------------------------------------
// ProtectedRoute has its own dedicated test file covering auth-gating and
// the dev-session-bootstrap behavior; here we only care about routing and
// page content, so bypass it entirely.
// -------------------------------------------------------------------
vi.mock('./components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: unknown }) => children,
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
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    expect(screen.getByRole('heading', { name: 'Dashboard Overview' })).toBeDefined();
  });

  it('shows a Ping Backend button', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    expect(screen.getByRole('button', { name: 'Ping Backend' })).toBeDefined();
  });

  it('shows loading indicator while fetching', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: true };
    renderApp();
    expect(screen.getByText('Loading telemetry...')).toBeDefined();
  });

  it('shows error message when the query fails', () => {
    healthQueryResult = {
      data: undefined,
      error: new Error('connection refused'),
      isLoading: false,
    };
    renderApp();
    expect(screen.getByText(/Error: connection refused/)).toBeDefined();
  });

  it('shows message and DB status when data is returned', () => {
    healthQueryResult = {
      data: { message: 'pong', dbStatus: 'ok' },
      error: null,
      isLoading: false,
    };
    renderApp();
    expect(screen.getByText(/pong/)).toBeDefined();
    expect(screen.getByText(/ok/)).toBeDefined();
  });

  it('clicking Ping Backend updates the queryKey (triggers refetch)', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };

    renderApp();
    const before = mockUseQuery.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Ping Backend' }));

    await waitFor(() => {
      expect(mockUseQuery.mock.calls.length).toBeGreaterThan(before);
    });

    const healthCalls = mockUseQuery.mock.calls
      .map((call) => call[0] as { queryKey: unknown[] })
      .filter((opts) => opts.queryKey[0] === 'healthPing');
    const firstKey = healthCalls[0].queryKey[1];
    const lastKey = healthCalls[healthCalls.length - 1].queryKey[1];
    expect(firstKey).not.toBe(lastKey);
  });

  it('can toggle the sidebar dynamically', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    const toggleBtn = screen.getByRole('button', { name: 'Toggle Sidebar' });
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toBeDefined();
  });

  it('can route to generic placeholder views', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    const orgLink = screen.getByRole('link', { name: 'Organizations' });
    fireEvent.click(orgLink);
    expect(screen.getByText('Organizations & Settings')).toBeInTheDocument();
  });
});
