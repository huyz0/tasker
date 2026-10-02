import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebhookService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { confirmAction, cancelAction } from '../../test/confirm';
import { Webhooks } from './Webhooks';

/** M37-T06: Organization → Webhooks. */
function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Webhooks orgId="org-1" />
    </QueryClientProvider>,
  );
}

const hook = (over: Record<string, unknown> = {}) => ({
  id: 'wh-1', orgId: 'org-1', url: 'https://runner.example.com/in', events: ['task.*'], description: 'runner',
  active: true, consecutiveFailures: 0, createdAt: '2026-10-02T10:00:00Z', ...over,
});

/** Records every write the panel makes, keyed by method. */
function recordWrites() {
  const writes: { method: string; body: any }[] = [];
  const responses: Record<string, object> = {
    CreateWebhook: { webhook: hook({ id: 'wh-new' }), secret: 'whsec_created' },
    UpdateWebhook: { webhook: hook() },
    DeleteWebhook: { success: true },
    RotateWebhookSecret: { secret: 'whsec_rotated' },
    PingWebhook: { delivery: { id: 'whd-1', webhookId: 'wh-1', eventType: 'ping', status: 'pending', attempts: 0, createdAt: '2026-10-02T10:00:00Z' } },
  };
  for (const [method, response] of Object.entries(responses)) {
    mockRpc(WebhookService, method, (body) => { writes.push({ method, body }); return response; });
  }
  return writes;
}

describe('Webhooks (M37-T06)', () => {
  it('lists webhooks with their scope, events and state', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [
      hook(),
      hook({ id: 'wh-2', url: 'https://other.example.com', projectId: 'proj-9', active: false, consecutiveFailures: 20, disabledReason: 'disabled after 20 consecutive failed deliveries' }),
      hook({ id: 'wh-3', url: 'https://paused.example.com', active: false }),
    ] });
    renderPanel();
    const list = await screen.findByRole('list', { name: 'Webhooks' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Whole organization · task.*');
    expect(within(items[0]!).getByText('Active')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Disabled')).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Project proj-9');
    expect(items[1]).toHaveTextContent('20 failed in a row');
    expect(items[1]).toHaveTextContent('disabled after 20 consecutive failed deliveries');
    expect(within(items[2]!).getByText('Paused')).toBeInTheDocument();
    // A webhook that is not active cannot be pinged.
    expect(within(items[1]!).getByRole('button', { name: 'Send ping' })).toBeDisabled();
  });

  it('says plainly when the caller is not an admin, and offers nothing to do', async () => {
    mockRpcError(WebhookService, 'ListWebhooks', 'permission_denied', 'requires org:admin');
    renderPanel();
    expect(await screen.findByText(/Only organization admins can manage webhooks/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add webhook' })).toBeNull();
  });

  it('shows an empty state', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [] });
    renderPanel();
    expect(await screen.findByText('No webhooks yet.')).toBeInTheDocument();
  });

  it('adds a webhook with the chosen events and shows its secret once', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [] });
    const writes = recordWrites();
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Add webhook' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: ' https://runner.example.com/in ' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'CI runner' } });
    // task.* is preselected; switch to every event plus one specific type.
    fireEvent.click(screen.getByLabelText('All task events'));
    const submit = screen.getAllByRole('button', { name: 'Add webhook' }).at(-1)!;
    expect(submit).toBeDisabled();
    expect(screen.getByText('Choose at least one event.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Every event'));
    fireEvent.click(screen.getByLabelText('task.unblocked'));
    fireEvent.click(submit);

    await waitFor(() => expect(writes).toContainEqual({ method: 'CreateWebhook', body: { orgId: 'org-1', url: 'https://runner.example.com/in', events: ['*', 'task.unblocked'], description: 'CI runner' } }));
    const callout = await screen.findByRole('status');
    expect(callout).toHaveTextContent('whsec_created');
    expect(callout).toHaveTextContent('not shown again');
    fireEvent.click(within(callout).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('whsec_created')).toBeNull();
  });

  it('reports a refused URL', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [] });
    mockRpcError(WebhookService, 'CreateWebhook', 'invalid_argument', 'url host "10.0.0.1" resolves to a non-public address (10.0.0.1)');
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Add webhook' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://10.0.0.1/' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add webhook' }).at(-1)!);
    expect(await screen.findByText(/Failed to add webhook: .*non-public address/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Endpoint URL')).toBeNull();
  });

  it('pings, pauses, rotates (after confirming) and deletes (after confirming)', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [hook()] });
    mockRpc(WebhookService, 'ListWebhookDeliveries', { deliveries: [], page: {} });
    const writes = recordWrites();
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Send ping' }));
    await waitFor(() => expect(writes).toContainEqual({ method: 'PingWebhook', body: { id: 'wh-1' } }));
    // The ping opens the delivery list so its result can be watched.
    expect(await screen.findByRole('button', { name: 'Deliveries' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(writes).toContainEqual({ method: 'UpdateWebhook', body: { id: 'wh-1', active: false } }));

    fireEvent.click(screen.getByRole('button', { name: 'Rotate secret' }));
    await cancelAction();
    expect(writes.some((w) => w.method === 'RotateWebhookSecret')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate secret' }));
    await confirmAction();
    expect(await screen.findByText('whsec_rotated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await confirmAction();
    await waitFor(() => expect(writes).toContainEqual({ method: 'DeleteWebhook', body: { id: 'wh-1' } }));
  });

  it('enables a paused webhook, and reports a failed action', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [hook({ active: false })] });
    mockRpcError(WebhookService, 'UpdateWebhook', 'internal', 'database unavailable');
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Enable' }));
    expect(await screen.findByText(/database unavailable/)).toBeInTheDocument();
  });

  it('shows recent deliveries with their outcome, and an empty or failed list', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [hook(), hook({ id: 'wh-2', url: 'https://two.example.com' })] });
    mockRpc(WebhookService, 'ListWebhookDeliveries', (body: { webhookId: string }) => {
      if (body.webhookId === 'wh-2') return { deliveries: [], page: {} };
      return { deliveries: [
        { id: 'd1', webhookId: 'wh-1', eventType: 'task.created', status: 'delivered', attempts: 1, lastStatusCode: 204, createdAt: '2026-10-02T10:00:00Z' },
        { id: 'd2', webhookId: 'wh-1', eventType: 'task.unblocked', status: 'pending', attempts: 2, lastStatusCode: 503, lastError: 'receiver answered HTTP 503', createdAt: '2026-10-02T10:01:00Z' },
      ], page: {} };
    });
    renderPanel();
    const toggles = await screen.findAllByRole('button', { name: 'Deliveries' });
    fireEvent.click(toggles[0]!);
    const deliveries = await screen.findByRole('list', { name: 'Recent deliveries' });
    expect(within(deliveries).getAllByRole('listitem')[0]).toHaveTextContent('delivered');
    expect(deliveries).toHaveTextContent('2 attempts · HTTP 503');
    expect(deliveries).toHaveTextContent('receiver answered HTTP 503');
    fireEvent.click(toggles[0]!);
    expect(screen.queryByRole('list', { name: 'Recent deliveries' })).toBeNull();

    fireEvent.click(toggles[1]!);
    expect(await screen.findByText(/Nothing delivered yet/)).toBeInTheDocument();
  });

  it('shows a failed delivery load with a retry', async () => {
    mockRpc(WebhookService, 'ListWebhooks', { webhooks: [hook()] });
    mockRpcError(WebhookService, 'ListWebhookDeliveries', 'unavailable', 'backend down');
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Deliveries' }));
    expect(await screen.findByText(/backend down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
