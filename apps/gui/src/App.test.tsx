import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// -------------------------------------------------------------------
// Mock @tanstack/react-query so we control what useQuery returns.
// -------------------------------------------------------------------
const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

// -------------------------------------------------------------------
// Mock the ConnectRPC client + transport so the module resolves without
// a real server. We only need the import-time side-effects silenced.
// -------------------------------------------------------------------
vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));

vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ ping: vi.fn() })),
}));

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  HealthService: {},
}));

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------
describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Tasker Health Monitor' })).toBeDefined();
  });

  it('shows a Ping Backend button', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Ping Backend' })).toBeDefined();
  });

  it('shows loading indicator while fetching', () => {
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: true });
    render(<App />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('shows error message when the query fails', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      error: new Error('connection refused'),
      isLoading: false,
    });
    render(<App />);
    expect(screen.getByText(/Error: connection refused/)).toBeDefined();
  });

  it('shows message and DB status when data is returned', () => {
    mockUseQuery.mockReturnValue({
      data: { message: 'pong', dbStatus: 'ok' },
      error: null,
      isLoading: false,
    });
    render(<App />);
    expect(screen.getByText(/pong/)).toBeDefined();
    expect(screen.getByText(/ok/)).toBeDefined();
  });

  it('clicking Ping Backend updates the queryKey (triggers refetch)', async () => {
    // The component uses Date.now() as a queryKey element; clicking the button
    // sets a new timestamp which causes useQuery to be called with a new key.
    mockUseQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });

    render(<App />);
    const before = mockUseQuery.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Ping Backend' }));

    await waitFor(() => {
      expect(mockUseQuery.mock.calls.length).toBeGreaterThan(before);
    });

    // The queryKey should have changed (different timestamp)
    const calls = mockUseQuery.mock.calls;
    const firstKey = (calls[0][0] as { queryKey: unknown[] }).queryKey[1];
    const lastKey = (calls[calls.length - 1][0] as { queryKey: unknown[] }).queryKey[1];
    expect(firstKey).not.toBe(lastKey);
  });
});
