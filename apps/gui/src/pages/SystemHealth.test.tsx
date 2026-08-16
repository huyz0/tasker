import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockPing, mockListLinkedIdentities } = vi.hoisted(() => ({
  mockPing: vi.fn(),
  // AccountSettings (rendered inside SystemHealthPage since M13-T12) reads
  // this on mount; its own tests own the interesting behavior, this file
  // just needs it to resolve so the page around it renders.
  mockListLinkedIdentities: vi.fn().mockResolvedValue({ identities: [], hasPassword: false }),
}));

vi.mock('@connectrpc/connect-web', () => ({ createConnectTransport: vi.fn(() => ({})) }));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: (service: unknown) =>
    service === 'AuthService'
      ? { listLinkedIdentities: mockListLinkedIdentities }
      : { ping: mockPing },
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ HealthService: 'HealthService', AuthService: 'AuthService' }));
vi.mock('../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({ setActivePageTitle: vi.fn() })),
}));

import { SystemHealthPage } from './SystemHealth';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}><SystemHealthPage /></QueryClientProvider>,
  );
}

describe('SystemHealthPage', () => {
  beforeEach(() => mockPing.mockReset());

  it('shows database and NATS status with their latencies', async () => {
    mockPing.mockResolvedValue({
      message: 'pong', dbStatus: 'ok', dbLatencyMs: 3, natsStatus: 'ok', natsLatencyMs: 7, version: 'abc1234',
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('pong')).toBeInTheDocument());
    expect(screen.getByText('ok (3ms)')).toBeInTheDocument();
    expect(screen.getByText('ok (7ms)')).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
  });

  it('omits latency and version when the server does not report them', async () => {
    // A backend that answers without timings is still a healthy backend; the
    // page must not render "ok (undefinedms)".
    mockPing.mockResolvedValue({ message: 'pong', dbStatus: 'ok', natsStatus: 'down' });
    renderPage();

    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument());
    expect(screen.getByText('down')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('surfaces a failed ping with a retry that recovers', async () => {
    mockPing
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue({ message: 'pong', dbStatus: 'ok', natsStatus: 'ok' });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('connection refused'));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // Recovery is the point: an error with a button that leaves the error on
    // screen is the same dead end as no button at all.
    await waitFor(() => expect(screen.getByText('pong')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('re-pings when the button is pressed', async () => {
    mockPing.mockResolvedValue({ message: 'pong', dbStatus: 'ok', natsStatus: 'ok' });
    renderPage();
    await waitFor(() => expect(screen.getByText('pong')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ping Backend' }));
    await waitFor(() => expect(mockPing.mock.calls.length).toBeGreaterThan(1));
  });
});
