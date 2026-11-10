import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';

export type AttentionPreviewState = 'populated' | 'loading' | 'empty' | 'error' | 'denied' | 'unknown' | 'long' | 'pages' | 'page-error' | 'stale';
export function attentionFixture(state: AttentionPreviewState = 'populated') {
  const nativeFetch = globalThis.fetch.bind(globalThis); let questionReads = 0;
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const error = (code: string, message: string) => json({ code, message }, 400);
    if (request.url.endsWith('/api/auth/session')) return json({ authenticated: true, userId: 'attention-story-user' });
    if (request.url.endsWith('/api/client-errors')) return json({});
    if (!request.url.endsWith('/ListAttention')) return error('unimplemented', 'This preview does not issue that request.');
    const body = await request.json() as { kind: string; projectId?: string; page?: { cursor?: string } };
    if (body.kind === 'question') questionReads++;
    if (state === 'loading' && body.kind === 'question') return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    if (state === 'denied') return error('permission_denied', 'Current organization task access was removed.');
    if ((state === 'error' && body.kind === 'approval') || (state === 'stale' && body.kind === 'question' && questionReads > 1)) return error('unavailable', 'The source is temporarily offline.');
    if (state === 'page-error' && body.page?.cursor) return error('unavailable', 'The next source page is offline.');
    const start = Number(body.page?.cursor ?? 0), total = state === 'empty' ? 0 : state === 'pages' || state === 'page-error' ? 125 : 3;
    const reasons: Record<string, string> = { question: 'Which release target should this task use?', approval: 'Requested move In progress → Shipped', review: 'You are a reviewer on this open task', stalled_claim: 'No task activity for more than 24 hours' };
    const items = Array.from({ length: Math.min(20, total - start) }, (_, i) => ({ kind: body.kind, sourceId: `${body.kind}-${start + i}`, taskId: `task-${Math.floor((start + i) / 2)}`,
      taskDisplayId: `REL-${start + i + 1}`, taskTitle: state === 'long' ? `Release-${'long-unbroken-title'.repeat(12)}漢😀` : ['Confirm deployment target', 'Review release evidence', 'Investigate the quiet assignment'][(start + i) % 3],
      taskStatus: ['working', 'awaiting_review', 'queued'][(start + i) % 3], projectId: body.projectId ?? (i % 2 ? 'project-beta' : 'project-release'), projectName: body.projectId ? (body.projectId === 'project-release' ? 'Product release' : 'Beta service') : i % 2 ? 'Beta service' : 'Product release',
      reason: state === 'long' ? '漢😀<literal>' + 'A'.repeat(180) : reasons[body.kind], reasonTruncated: state === 'long',
      since: state === 'unknown' ? undefined : '2026-11-08T08:15:00Z', sinceKind: body.kind === 'question' ? 'asked_at' : body.kind === 'approval' ? 'requested_at' : body.kind === 'review' ? 'task_created_at' : 'silent_since',
      actorKind: state === 'unknown' ? undefined : body.kind === 'review' || (body.kind === 'question' && i % 2) ? 'user' : 'agent', actorName: state === 'unknown' ? undefined : body.kind === 'review' || (body.kind === 'question' && i % 2) ? 'Alex Morgan' : 'Release worker',
    }));
    return json({ items, page: { totalCount: total, ...(start + 20 < total ? { nextCursor: String(start + 20) } : {}) }, observedAt: '2026-11-10T00:00:00Z' });
  });
  return () => mock.mockRestore();
}
