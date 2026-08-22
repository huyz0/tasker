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

// M12-T01: no mock of `@connectrpc/connect`/`connect-web`/`health_pb` here.
// `@tanstack/react-query` is mocked wholesale below (`useQuery`/`useMutation`
// never call the real `queryFn`/`mutationFn`), so nothing in this file ever
// issues a real RPC regardless; constructing the real generated client
// against the real transport at import time is safe on its own — no network
// call happens until a method is actually invoked, and MSW would intercept
// that anyway (see setupTests.ts).

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

  it('lands on the dashboard, not on backend telemetry', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    // Every screen is now loaded via React.lazy/Suspense, so its content
    // isn't in the DOM on the same tick render() returns - find* awaits it.
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeDefined();
    // System Health moved to /settings: database latency is an operator's
    // concern and was the only thing on the home screen that ever changed.
    expect(screen.queryByRole('button', { name: 'Ping Backend' })).toBeNull();
  });

  it('serves backend telemetry at /settings, which used to be a placeholder', async () => {
    healthQueryResult = { data: { message: 'pong', dbStatus: 'ok' }, error: null, isLoading: false };
    renderApp('/settings');
    expect(await screen.findByRole('button', { name: 'Ping Backend' })).toBeDefined();
    expect(screen.getByText(/pong/)).toBeDefined();
    // The route used to render "Settings module placeholder area".
    expect(screen.queryByText(/placeholder area/)).toBeNull();
  });

  it('clicking Ping Backend on /settings triggers a refetch', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp('/settings');
    const before = mockUseQuery.mock.calls.length;

    fireEvent.click(await screen.findByRole('button', { name: 'Ping Backend' }));

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

  it('can toggle the sidebar dynamically', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    await screen.findByRole('heading', { name: 'Dashboard' });
    const toggleBtn = screen.getByRole('button', { name: 'Toggle Sidebar' });
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toBeDefined();
  });

  it('renders the Not Found view on an unknown URL rather than an empty pane', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp('/nonsense');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();
    // Still inside the shell, so the sidebar is there to navigate away with.
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeInTheDocument();
  });

  // M01-T03: asserting `navigate` was called with some string only proves the
  // search picked a target. These mount the app at that exact target and check
  // the entity's own view renders there — a dead link would land on Not Found.
  describe('global search navigation targets', () => {
    it('resolves a task result to the tasks workbench', async () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp(resultRoute({ type: 'task', id: 'tsk-1' })!);

      expect(await screen.findByRole('heading', { name: 'Tasks Workbench' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    });

    it('resolves an artifact result to the artifacts browser', async () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp(resultRoute({ type: 'artifact', id: 'art-1' })!);

      expect(await screen.findByText('Artifacts Explorer')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    });
  });

  it('can route to generic placeholder views', async () => {
    healthQueryResult = { data: undefined, error: null, isLoading: false };
    renderApp();
    await screen.findByRole('heading', { name: 'Dashboard' });
    const orgLink = screen.getByRole('link', { name: 'Organizations' });
    fireEvent.click(orgLink);
    expect(await screen.findByText('Organizations & Settings')).toBeInTheDocument();
  });

  // Every screen is its own lazy-loaded chunk now (route-level code-
  // splitting, front-end chunk optimization). These exist to prove each one
  // actually resolves and renders through its own Suspense boundary, not
  // just the handful the tests above happen to touch already.
  describe('every remaining screen resolves through its own lazy chunk', () => {
    it.each([
      ['/projects', 'heading', 'Projects'],
      ['/agents', 'heading', 'AI Agents'],
      ['/labels', 'heading', 'Labels'],
      ['/bin', 'heading', 'Bin'],
      // Roles/Teams/Memory/Handoffs all gate their real content behind
      // activeOrgId (this test file uses the real layout store, not a
      // mock, and no org is selected here) - their own "select an org"
      // copy is still proof the right lazy chunk mounted.
      ['/roles', 'text', 'Select an organization to manage its roles.'],
      ['/teams', 'text', 'Select an organization to manage its teams.'],
      ['/memory', 'text', 'Select an organization to browse its shared memory.'],
      ['/handoffs', 'text', 'Select an organization to see its pending handoffs.'],
      ['/reports', 'text', 'Select an organization to see project reports.'],
    ] as const)('%s renders through its own lazy chunk', async (path, kind, name) => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp(path);
      if (kind === 'heading') {
        expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
      } else {
        expect(await screen.findByText(name)).toBeInTheDocument();
      }
    });

    it('/task-types renders its own empty state', async () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp('/task-types');
      expect(await screen.findByText('No task types yet.')).toBeInTheDocument();
    });

    it('/login renders the sign-in card, outside the authenticated shell', async () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp('/login');
      // The password form's submit, not the Google button: since M09-T06 that
      // one is conditional on the backend reporting Google as configured, and
      // this test is about routing, not about which providers exist.
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      // Outside AppShell entirely - no sidebar to navigate away with.
      expect(screen.queryByRole('link', { name: 'Organizations' })).toBeNull();
    });

    it('/register renders the account-creation card, outside the authenticated shell', async () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp('/register');
      expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Organizations' })).toBeNull();
    });

    it('/oauth/callback renders its in-progress state', async () => {
      healthQueryResult = { data: undefined, error: null, isLoading: false };
      renderApp('/oauth/callback');
      expect(await screen.findByText('Linking Repository...')).toBeInTheDocument();
    });
  });
});
