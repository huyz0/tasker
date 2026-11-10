import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { AttentionService, EventService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { useLiveEvents } from '../../hooks/useLiveEvents';
import { AttentionScreen } from './AttentionScreen';

const source = (kind: string, actorName = 'Worker One') => ({ kind, sourceId: `${kind}-1`, taskId: 'task-1', taskDisplayId: 'TASK-1', taskTitle: 'Current task', taskStatus: 'working', projectId: 'project-1', projectName: 'Project One', reason: 'Current source', actorId: kind === 'review' ? 'user-1' : 'agent-1', actorKind: kind === 'review' ? 'user' : 'agent', actorName, sinceKind: kind === 'review' ? 'task_created_at' : kind === 'stalled_claim' ? 'silent_since' : 'asked_at', since: '2026-11-08T12:00:00Z' });
function frame(subject: string) {
  const json = new TextEncoder().encode(JSON.stringify({ subject, orgId: 'org-1', projectId: 'project-1', occurredAt: '2026-11-10T01:00:00Z', payloadJson: '{}' }));
  const bytes = new Uint8Array(5 + json.length); new DataView(bytes.buffer).setUint32(1, json.length, false); bytes.set(json, 5); return bytes;
}
function LiveReader() {
  const { status } = useLiveEvents({ orgId: 'org-1' });
  return <><output aria-label="Event connection">{status}</output><AttentionScreen /></>;
}
function open(kind = 'question') {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  server.use(http.post(`${BACKEND_URL}/${EventService.typeName}/SubscribeEvents`, () => new HttpResponse(new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(frame('stream.ready')); } }), { headers: { 'content-type': 'application/connect+json' } })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.setQueryData(['authSession'], { authenticated: true, userId: 'user-1' });
  const ui = renderScoped(<LiveReader />, { initialEntry: `/attention?org=org-1&kind=${kind}`, queryClient: client });
  return { ...ui, send: (subject: string) => controller.enqueue(frame(subject)) };
}
beforeEach(() => server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({}))));

describe('Attention consumes the existing real Connect event stream', () => {
  it.each([{ subject: 'domain.task.status_updated', kind: 'review' }, { subject: 'domain.comment.created', kind: 'stalled_claim' }, { subject: 'domain.tasknote.created', kind: 'stalled_claim' }, { subject: 'domain.project.archived', kind: 'question' }, { subject: 'stream.resync', kind: 'question' }])('reads current source truth after $subject', async ({ subject, kind }) => {
    let present = true;
    mockRpc(AttentionService, 'ListAttention', request => ({ items: request.kind === kind && present ? [source(kind)] : [], page: { totalCount: request.kind === kind && present ? 1 : 0 } }));
    const ui = open(kind); await screen.findByText('1 loaded of 1'); await waitFor(() => expect(screen.getByLabelText('Event connection')).toHaveTextContent('live'));
    present = false; act(() => ui.send(subject)); expect(await screen.findByText('0 loaded of 0')).toBeVisible();
  });

  it('reconciles actor names without a task-body or actor catalogue waterfall', async () => {
    let name = 'Worker One', bodyReads = 0;
    mockRpc(AttentionService, 'ListAttention', request => ({ items: request.kind === 'question' ? [source('question', name)] : [], page: { totalCount: request.kind === 'question' ? 1 : 0 } }));
    server.use(http.post(`${BACKEND_URL}/tasker.health.v1.TaskService/GetTask`, () => { bodyReads++; return HttpResponse.json({}); }));
    const ui = open(); await screen.findByText('Asked by Agent Worker One'); await waitFor(() => expect(screen.getByLabelText('Event connection')).toHaveTextContent('live'));
    name = 'Renamed worker'; act(() => ui.send('domain.agent.updated'));
    expect(await screen.findByText('Asked by Agent Renamed worker')).toBeVisible(); expect(bodyReads).toBe(0);
  });

  it('lets an authority event obtain denial, then keeps every group fenced through resync until fresh explicit retry', async () => {
    let deny = false, reads = 0;
    server.use(http.post(`${BACKEND_URL}/${AttentionService.typeName}/ListAttention`, async ({ request }) => {
      const body = await request.json() as { kind: string }; reads++;
      return deny ? HttpResponse.json({ code: 'permission_denied', message: 'Current task read revoked' }, { status: 403 }) : HttpResponse.json({ items: [source(body.kind)], page: { totalCount: 1 } });
    }));
    const ui = open(); await screen.findByText('1 loaded of 1'); await waitFor(() => expect(screen.getAllByText('1 current')).toHaveLength(4));
    await waitFor(() => expect(screen.getByLabelText('Event connection')).toHaveTextContent('live'));
    deny = true; act(() => ui.send('domain.grant.revoked')); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('task read revoked'));
    expect(screen.getAllByText('Unavailable')).toHaveLength(4); expect(screen.queryByText('Current source')).not.toBeInTheDocument();
    deny = false; const deniedReads = reads;
    act(() => { ui.send('stream.resync'); ui.send('domain.grant.created'); });
    await act(async () => ui.queryClient.invalidateQueries());
    expect(screen.queryByText('Current source')).not.toBeInTheDocument(); expect(reads).toBe(deniedReads);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('Current source')).toBeVisible();
    expect(within(screen.getByRole('navigation', { name: 'Attention sources' })).getAllByText('Unavailable')).toHaveLength(3);
  });
});
