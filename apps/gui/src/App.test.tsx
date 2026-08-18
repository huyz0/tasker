import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { resultRoute } from './components/layout/GlobalSearch';

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
  useQueries: () => [],
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
  DashboardService: {},
  RoleService: {},
  TeamService: {},
  MemoryService: {},
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

  const renderApp = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

  it('lands on the dashboard, not on backend telemetry', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeDefined();
    // System Health moved to /settings: database latency is an operator's
    // concern and was the only thing on the home screen that ever changed.
    expect(screen.queryByRole('button', { name: 'Ping Backend' })).toBeNull();
  });

  it('serves backend telemetry at /settings, which used to be a placeholder', () => {
    healthQueryResult = { data: { message: 'pong', dbStatus: 'ok' }, error: null, isLoading: false };
    renderApp('/settings');
    expect(screen.getByRole('button', { name: 'Ping Backend' })).toBeDefined();
    expect(screen.getByText(/pong/)).toBeDefined();
    // The route used to render "Settings module placeholder area".
    expect(screen.queryByText(/placeholder area/)).toBeNull();
  });

  it('clicking Ping Backend on /settings triggers a refetch', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp('/settings');
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

  it('renders the Not Found view on an unknown URL rather than an empty pane', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp('/nonsense');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();
    // Still inside the shell, so the sidebar is there to navigate away with.
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeInTheDocument();
  });

  // M01-T03: asserting `navigate` was called with some string only proves the
  // search picked a target. These mount the app at that exact target and check
  // the entity's own view renders there — a dead link would land on Not Found.
  describe('global search navigation targets', () => {
    it('resolves a task result to the tasks workbench', () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp(resultRoute({ type: 'task', id: 'tsk-1' })!);

      expect(screen.getByRole('heading', { name: 'Tasks Workbench' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    });

    it('resolves an artifact result to the artifacts browser', () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp(resultRoute({ type: 'artifact', id: 'art-1' })!);

      expect(screen.getByText('Artifacts Explorer')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    });
  });

  it('can route to generic placeholder views', () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    const orgLink = screen.getByRole('link', { name: 'Organizations' });
    fireEvent.click(orgLink);
    expect(screen.getByText('Organizations & Settings')).toBeInTheDocument();
  });
});
