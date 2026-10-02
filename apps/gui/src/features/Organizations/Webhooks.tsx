import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { WebhookService, type Webhook } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { TONE_CLASSES, type StatusTone } from '../../components/ui/statusStyles';
import { formatDateTime } from '../../lib/format';

const webhookClient = createClient(WebhookService, transport);

/** What a webhook can subscribe to - the server's list (M37, ADR-0030). */
const EVENT_GROUPS: { value: string; label: string }[] = [
  { value: '*', label: 'Every event' },
  { value: 'task.*', label: 'All task events' },
  { value: 'tasknote.*', label: 'All agent-note events' },
];
const EVENT_TYPES = [
  'task.created', 'task.updated', 'task.status_updated', 'task.claimed', 'task.released', 'task.unblocked',
  'task.linked', 'task.unlinked', 'task.plan_updated', 'task.input_requested', 'task.input_answered', 'task.input_cancelled', 'task.approval_requested', 'task.approval_decided', 'task.usage_reported', 'task.summary_updated', 'task.deleted', 'task.restored', 'task.purged', 'task.stalled',
  'tasknote.created', 'tasknote.updated', 'tasknote.deleted',
];

const DELIVERY_TONE: Record<string, StatusTone> = { delivered: 'success', pending: 'warning', failed: 'destructive' };

function webhookState(w: Webhook): { label: string; tone: StatusTone } {
  if (w.active) return { label: 'Active', tone: 'success' };
  if (w.disabledReason) return { label: 'Disabled', tone: 'destructive' };
  return { label: 'Paused', tone: 'neutral' };
}

/** The once-shown secret, with what to do with it. */
function SecretCallout({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  return (
    <div role="status" className={`rounded-md p-3 text-sm flex flex-col gap-2 ${TONE_CLASSES.warning}`}>
      <p className="font-medium">Copy the signing secret now — it is not shown again.</p>
      <code className="font-mono text-xs break-all bg-background text-foreground rounded px-2 py-1">{secret}</code>
      <p className="text-xs">Verify each request's <code>X-Tasker-Signature</code>: HMAC-SHA256 of <code>"&lt;X-Tasker-Timestamp&gt;.&lt;body&gt;"</code> with this secret.</p>
      <div className="flex gap-2">
        <button onClick={() => void navigator.clipboard?.writeText(secret)} className="px-3 py-1 rounded-md border border-current text-xs font-medium">Copy</button>
        <button onClick={onDismiss} className="px-3 py-1 rounded-md border border-current text-xs font-medium">Done</button>
      </div>
    </div>
  );
}

function Deliveries({ webhookId }: { webhookId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['webhookDeliveries', webhookId],
    queryFn: async () => (await webhookClient.listWebhookDeliveries({ webhookId, page: { limit: 20 } })).deliveries,
  });
  return (
    <ListState
      isLoading={isLoading}
      error={error}
      isEmpty={(data ?? []).length === 0}
      loadingMessage="Loading deliveries…"
      emptyMessage="Nothing delivered yet. Send a ping to check the receiver."
      onRetry={() => refetch()}
    >
      <ul className="flex flex-col gap-1 text-xs" aria-label="Recent deliveries">
        {(data ?? []).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-medium ${TONE_CLASSES[DELIVERY_TONE[d.status] ?? 'neutral']}`}>{d.status}</span>
            <span className="font-mono">{d.eventType}</span>
            <span className="text-muted-foreground">{formatDateTime(d.createdAt)}</span>
            <span className="text-muted-foreground">
              {d.attempts} attempt{d.attempts === 1 ? '' : 's'}{d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}
            </span>
            {d.lastError && <span className="text-destructive basis-full">{d.lastError}</span>}
          </li>
        ))}
      </ul>
    </ListState>
  );
}

interface WebhooksProps {
  orgId: string;
}

/**
 * Organization → Webhooks (M37-T06, ADR-0030): HTTPS endpoints that receive the
 * organization's task events, signed. Admin-only on the server; for anyone else
 * the list fails with PermissionDenied and this says so.
 */
export function Webhooks({ orgId }: WebhooksProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<string[]>(['task.*']);
  const [secret, setSecret] = useState<string | null>(null);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);

  const key = ['webhooks', orgId];
  const list = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => (await webhookClient.listWebhooks({ orgId })).webhooks,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async () => webhookClient.createWebhook({ orgId, url: url.trim(), events, description: description.trim() || undefined }),
    onSuccess: (res) => {
      setSecret(res.secret);
      setAdding(false);
      setUrl('');
      setDescription('');
      setEvents(['task.*']);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => webhookClient.updateWebhook(v),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => webhookClient.deleteWebhook({ id }),
    onSuccess: refresh,
  });
  const rotate = useMutation({
    mutationFn: async (id: string) => (await webhookClient.rotateWebhookSecret({ id })).secret,
    onSuccess: (s) => setSecret(s),
  });
  const ping = useMutation({
    mutationFn: async (id: string) => webhookClient.pingWebhook({ id }),
    onSuccess: (_r, id) => {
      setOpenDeliveries(id);
      queryClient.invalidateQueries({ queryKey: ['webhookDeliveries', id] });
    },
  });

  const toggleEvent = (value: string) =>
    setEvents((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]));
  const actionError = update.error ?? remove.error ?? rotate.error ?? ping.error;
  const forbidden = (list.error as { code?: number } | null)?.code === 7;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Tasker POSTs this organization's task events to these HTTPS endpoints, signed, so an agent runner can start work without polling.
          </p>
        </div>
        {!adding && !forbidden && (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 whitespace-nowrap px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium"
          >
            Add webhook
          </button>
        )}
      </div>

      {secret && <SecretCallout secret={secret} onDismiss={() => setSecret(null)} />}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && events.length > 0) create.mutate();
          }}
          className="flex flex-col gap-3 border rounded-md p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="webhook-url">
            Endpoint URL
            <input
              id="webhook-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://runner.example.com/tasker"
              className="font-normal rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="webhook-description">
            Description (optional)
            <input
              id="webhook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="font-normal rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1">Events</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {EVENT_GROUPS.map((g) => (
                <label key={g.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={events.includes(g.value)} onChange={() => toggleEvent(g.value)} />
                  {g.label}
                </label>
              ))}
            </div>
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer">Specific events</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                {EVENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-xs font-mono">
                    <input type="checkbox" checked={events.includes(t)} onChange={() => toggleEvent(t)} />
                    {t}
                  </label>
                ))}
              </div>
            </details>
            {events.length === 0 && <p className="text-xs text-destructive">Choose at least one event.</p>}
          </fieldset>
          {create.isError && <p className="text-sm text-destructive">Failed to add webhook: {(create.error as Error).message}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!url.trim() || events.length === 0 || create.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-sm font-medium"
            >
              {create.isPending ? 'Adding…' : 'Add webhook'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium">
              Cancel
            </button>
          </div>
        </form>
      )}

      {actionError && <p className="text-sm text-destructive">{(actionError as Error).message}</p>}

      <ListState
        isLoading={list.isLoading}
        error={list.error}
        isEmpty={(list.data ?? []).length === 0}
        loadingMessage="Loading webhooks…"
        errorLabel={forbidden ? 'Only organization admins can manage webhooks' : 'Could not load webhooks'}
        emptyMessage="No webhooks yet."
        emptyAction={<p className="text-xs">Add one to send task events to an agent runner.</p>}
        onRetry={() => list.refetch()}
      >
        <ul className="flex flex-col gap-3" aria-label="Webhooks">
          {(list.data ?? []).map((w) => {
            const state = webhookState(w);
            return (
              <li key={w.id} className="border rounded-md p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm break-all">{w.url}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLASSES[state.tone]}`}>{state.label}</span>
                </div>
                {w.description && <p className="text-sm">{w.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {w.projectId ? `Project ${w.projectId}` : 'Whole organization'} · {w.events.join(', ')}
                  {w.lastDeliveryAt ? ` · last delivered ${formatDateTime(w.lastDeliveryAt)}` : ''}
                  {w.consecutiveFailures > 0 ? ` · ${w.consecutiveFailures} failed in a row` : ''}
                </p>
                {w.disabledReason && <p className="text-xs text-destructive">{w.disabledReason}</p>}
                <div className="flex flex-wrap gap-3 text-sm">
                  <button onClick={() => ping.mutate(w.id)} disabled={!w.active || ping.isPending} className="text-primary hover:underline disabled:opacity-50 disabled:no-underline">
                    Send ping
                  </button>
                  <button onClick={() => update.mutate({ id: w.id, active: !w.active })} disabled={update.isPending} className="text-primary hover:underline disabled:opacity-50">
                    {w.active ? 'Pause' : 'Enable'}
                  </button>
                  <button
                    onClick={() => setOpenDeliveries((open) => (open === w.id ? null : w.id))}
                    aria-expanded={openDeliveries === w.id}
                    className="text-primary hover:underline"
                  >
                    Deliveries
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({
                        title: 'Rotate the signing secret?',
                        consequence: 'The current secret stops signing immediately; the receiver must switch to the new one.',
                        undo: null,
                        confirmLabel: 'Rotate',
                      })) rotate.mutate(w.id);
                    }}
                    className="text-primary hover:underline"
                  >
                    Rotate secret
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({
                        title: `Delete the webhook to ${w.url}?`,
                        consequence: 'Its delivery history goes with it, and no more events are sent.',
                        undo: null,
                        confirmLabel: 'Delete',
                      })) remove.mutate(w.id);
                    }}
                    className="text-destructive hover:underline"
                  >
                    Delete
                  </button>
                </div>
                {openDeliveries === w.id && <Deliveries webhookId={w.id} />}
              </li>
            );
          })}
        </ul>
      </ListState>
      {confirmDialog}
    </div>
  );
}
