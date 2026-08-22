import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthService, AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../test/mockRpc';

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
  // AccountSettings (rendered inside SystemHealthPage since M13-T12) reads
  // this on mount; its own tests own the interesting behavior, this file
  // just needs it to resolve so the page around it renders.
  const withLinkedIdentities = () =>
    mockRpc(AuthService, 'ListLinkedIdentities', { identities: [], hasPassword: false });

  it('shows database and NATS status with their latencies', async () => {
    withLinkedIdentities();
    mockRpc(HealthService, 'Ping', {
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
    withLinkedIdentities();
    mockRpc(HealthService, 'Ping', { message: 'pong', dbStatus: 'ok', natsStatus: 'down' });
    renderPage();

    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument());
    expect(screen.getByText('down')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('surfaces a failed ping with a retry that recovers', async () => {
    withLinkedIdentities();
    mockRpcError(HealthService, 'Ping', 'unavailable', 'connection refused');
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('connection refused'));

    // The retry hits the same URL; re-registering with a success response
    // replaces the error handler for it.
    mockRpc(HealthService, 'Ping', { message: 'pong', dbStatus: 'ok', natsStatus: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // Recovery is the point: an error with a button that leaves the error on
    // screen is the same dead end as no button at all.
    await waitFor(() => expect(screen.getByText('pong')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('re-pings when the button is pressed', async () => {
    withLinkedIdentities();
    let calls = 0;
    mockRpc(HealthService, 'Ping', () => {
      calls += 1;
      return { message: 'pong', dbStatus: 'ok', natsStatus: 'ok' };
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('pong')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ping Backend' }));
    await waitFor(() => expect(calls).toBeGreaterThan(1));
  });
});
