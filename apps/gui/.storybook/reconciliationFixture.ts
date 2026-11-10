import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';
export type SourceActionKind = 'question' | 'approval' | 'review' | 'stalled_claim';
type SourceActionOutcome = 'success' | 'stale' | 'write_denied';
export function reconciliationFixture(kind: SourceActionKind, outcome: SourceActionOutcome = 'success', state: 'present' | 'empty' | 'loading' | 'error' = 'present') {
  const nativeFetch = globalThis.fetch.bind(globalThis); let present = state !== 'empty';
  const question = { id: 'source-storybook', taskId: 'task-storybook', projectId: 'project-storybook', taskDisplayId: 'REL-42', taskTitle: 'Inspect release evidence', question: 'Which release target should this task use?', options: [], status: 'open', askedByName: 'Release worker', createdAt: '2026-11-09T08:00:00Z' };
  const approval = { ...question, fromStatus: 'working', toStatus: 'shipped', requestedByAgentId: 'agent-storybook', requestedByName: 'Release worker', status: 'pending' };
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fail = (code: string, message: string) => json({ code, message }, 400);
    if (request.url.endsWith('/api/auth/session')) return json({ authenticated: true, userId: 'user-storybook' });
    if (request.url.endsWith('/api/client-errors')) return json({});
    const body = await request.json() as { kind?: string; status?: string; agentId?: string; userId?: string; answer?: string };
    if (request.url.endsWith('/ListAttention')) return json({ items: present && body.kind === kind ? [{ kind, sourceId: 'source-storybook', taskId: 'task-storybook', taskDisplayId: 'REL-42', taskTitle: 'Inspect release evidence', taskStatus: 'working', projectId: 'project-storybook', projectName: 'Product release',
      reason: kind === 'question' ? question.question : kind === 'approval' ? 'Requested move working → shipped' : kind === 'review' ? 'You are a reviewer on this open task' : 'No task activity for more than 24 hours',
      since: '2026-11-09T08:00:00Z', sinceKind: kind === 'question' ? 'asked_at' : kind === 'approval' ? 'requested_at' : kind === 'review' ? 'task_created_at' : 'silent_since', actorKind: kind === 'review' ? 'user' : 'agent', actorName: kind === 'review' ? 'Alex Morgan' : 'Release worker' }] : [],
      page: { totalCount: present && body.kind === kind ? 1 : 0 }, observedAt: '2026-11-10T01:00:00Z' });
    if (request.url.endsWith('/ListInputRequests')) return json({ inputRequests: body.status === 'closed' ? present ? [] : [{ ...question, status: 'answered', answer: 'Ship to staging', answeredByName: 'Alex Morgan' }] : present ? [question] : [], page: { totalCount: body.status === 'closed' ? present ? 0 : 1 : present ? 1 : 0 } });
    if (request.url.endsWith('/ListTransitionApprovals')) return json({ approvals: body.status === 'closed' ? present ? [] : [{ ...approval, status: outcome === 'stale' ? 'stale' : 'approved', decidedByName: 'Alex Morgan' }] : present ? [approval] : [], page: { totalCount: body.status === 'closed' ? present ? 0 : 1 : present ? 1 : 0 } });
    if (request.url.endsWith('/AnswerInputRequest') || request.url.endsWith('/DecideTransitionApproval')) {
      if (outcome === 'write_denied') return fail('permission_denied', 'Write access was removed; this task is still readable.');
      present = false;
      if (outcome === 'stale') return fail('failed_precondition', kind === 'approval' ? 'The task moved; this request closed as stale.' : 'Another person already answered this question.');
      return kind === 'question' ? json({ inputRequest: { ...question, status: 'answered', answer: body.answer } }) : json({ approval: { ...approval, status: 'approved' } });
    }
    if (request.url.endsWith('/ListTaskReviewers')) {
      if (state === 'loading') return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      if (state === 'error') return fail('unavailable', 'Review responsibilities are temporarily offline.');
      return json({ reviewers: present ? [{ id: 'source-storybook', taskId: 'task-storybook', userId: 'user-storybook', name: 'Alex Morgan' }] : [] });
    }
    if (request.url.endsWith('/ListOrgMembers')) return json({ members: [{ userId: 'user-storybook', name: 'Alex Morgan', email: 'alex@example.test' }], page: { totalCount: 1 } });
    if (request.url.endsWith('/AddTaskReviewer')) { present = true; return json({ success: true }); }
    if (request.url.endsWith('/RemoveTaskReviewer')) { present = false; return json({ success: true }); }
    if (request.url.endsWith('/GetTask')) return json({ orgId: 'org-storybook', task: { id: 'task-storybook', projectId: 'project-storybook', title: 'Inspect release evidence', status: 'working', assignees: present ? [{ agentId: 'agent-storybook', userId: 'user-storybook', name: 'Release worker' }] : [] } });
    if (request.url.endsWith('/UnassignTask')) {
      if (body.agentId !== 'agent-storybook' || body.userId !== 'user-storybook') return fail('failed_precondition', 'This assignment requires its recorded agent and user pair.');
      present = false; return json({ success: true });
    }
    return fail('unimplemented', 'This preview has no fixture for that request.');
  });
  return () => mock.mockRestore();
}
