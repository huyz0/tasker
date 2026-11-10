import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';

export type ClaimReceiptState = 'populated' | 'empty' | 'loading' | 'error' | 'denied' | 'purged' | 'long' | 'pages' | 'page-error' | 'linked-other';
export const claimStoryOwner = { accountId: 'claim-story-user', orgId: 'org-claim-story', taskId: 'task-claim-story' };
const priorClaim = { id: 'ta-claim-story-prior', taskId: claimStoryOwner.taskId, orgId: claimStoryOwner.orgId,
  owner: { kind: 'agent', id: 'prior-worker', name: 'Prior release worker' }, claimedAt: '2026-11-08T12:00:00Z',
  releasedAt: '2026-11-08T12:02:00Z', releaseReason: 'released', releasedBy: { kind: 'agent', id: 'prior-worker' }, externalRunId: '<pipeline/job-17>' };
const currentClaim = { id: 'ta-claim-story-current', taskId: claimStoryOwner.taskId, orgId: claimStoryOwner.orgId,
  owner: { kind: 'agent', id: 'current-worker', name: 'Current release worker' }, claimedAt: '2026-11-08T13:00:00Z' };
interface Report { id: string; attemptId?: string; }
interface RequestBody { attemptId?: string; uncorrelatedOnly?: boolean; noteType?: string; query?: string; page?: { cursor?: string; limit?: number }; }

/** Synthetic responses use the actual Connect codec and never a live account. */
export function claimReceiptFixture(state: ClaimReceiptState = 'populated') {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let linked = false;
  const match = <T extends Report>(rows: T[], request: RequestBody) => rows.filter(row => request.attemptId
    ? row.attemptId === request.attemptId : request.uncorrelatedOnly ? row.attemptId === undefined : true);
  const page = <T extends Report>(rows: T[], request: RequestBody) => {
    const limit = request.page?.limit || 20, start = request.page?.cursor ? limit : 0;
    return { selected: rows.slice(start, start + limit), page: { totalCount: rows.length,
      ...(rows.length > start + limit ? { nextCursor: 'story-next' } : {}) } };
  };
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const error = (code: string, message: string) => json({ code, message }, 400);
    if (request.url.endsWith('/api/auth/session')) return json({ authenticated: true, userId: claimStoryOwner.accountId });
    if (request.url.endsWith('/api/client-errors')) return json({});
    const body = await request.json() as RequestBody;
    const read = /\/(ListTaskAttempts|ListTaskNotes|ListUsageRecords|ListTaskArtifactLinks)$/.test(request.url);
    if (read && state === 'loading') return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    if (read && state === 'error') return error('unavailable', 'Recorded reports are temporarily unavailable.');
    if (read && state === 'denied') return error('permission_denied', 'Current task report access was removed.');
    if (read && state === 'page-error' && body.page?.cursor) return error('unavailable', 'The older report page is temporarily unavailable.');
    if (request.url.endsWith('/ListTaskAttempts')) {
      const old = { ...priorClaim, ...(state === 'purged' ? { releaseReason: 'owner_purged', releasedBy: { kind: 'system' } } : {}),
        ...(state === 'long' ? { owner: { ...priorClaim.owner, name: `Long recorded owner name ${'x'.repeat(180)}` }, externalRunId: `pipeline/${'x'.repeat(247)}` } : {}) };
      const attempts = state === 'empty' ? [] : body.page?.cursor ? [{ ...old, id: 'ta-earlier-story', owner: { ...old.owner, name: 'Earlier review worker' } }] : [currentClaim, old];
      return json({ attempts, page: { totalCount: state === 'pages' || state === 'page-error' ? 3 : attempts.length,
        ...((state === 'pages' || state === 'page-error') && !body.page?.cursor ? { nextCursor: 'story-older' } : {}) } });
    }
    const ids: Report[] = state === 'empty' ? [] : state === 'pages' || state === 'page-error'
      ? Array.from({ length: 25 }, (_, index) => ({ id: `report-${String(index).padStart(2, '0')}`, attemptId: priorClaim.id }))
      : [{ id: 'prior', attemptId: priorClaim.id }, { id: 'current', attemptId: currentClaim.id }, { id: 'legacy' }];
    if (request.url.endsWith('/ListTaskNotes')) {
      const notes = match(ids, body).map(row => ({ ...row, taskId: claimStoryOwner.taskId, agentId: 'prior-worker',
        agentName: state === 'long' ? `Worker-${'x'.repeat(180)}` : 'Prior release worker',
        content: row.id === 'legacy' ? 'A legacy note remains reachable without a receipt.' : row.id === 'prior' ? 'Delayed report after release: verification completed and the output was recorded.' : `Recorded note ${row.id}`,
        noteType: row.id === 'prior' ? 'handoff' : 'comment', createdAt: '2026-11-08T13:05:00Z' }));
      const result = page(body.noteType ? notes.filter(note => note.noteType === body.noteType) : notes, body);
      return json({ taskNotes: result.selected, page: result.page });
    }
    if (request.url.endsWith('/ListUsageRecords')) {
      const result = page(match(ids, body).map(row => ({ ...row, taskId: claimStoryOwner.taskId, projectId: 'project-story', agentId: 'prior-worker',
        reportedByName: row.id === 'legacy' ? 'Legacy reporter' : 'Prior release worker', modelName: 'Reported model',
        inputTokens: '100', outputTokens: '20', costMicros: '1000', createdAt: '2026-11-08T13:05:00Z' })), body);
      return json({ records: result.selected, page: result.page, totals: { reports: String(ids.length), inputTokens: String(ids.length * 100), outputTokens: String(ids.length * 20), costMicros: String(ids.length * 1000) } });
    }
    if (request.url.endsWith('/ListTaskArtifactLinks')) {
      const all = ids.map(row => ({ ...row, id: `link-${row.id}`, taskId: claimStoryOwner.taskId,
        artifactId: state === 'linked-other' && row.id === 'current' ? 'candidate' : `artifact-${row.id}`,
        artifactName: `${row.id}-output.md`, taskTitle: 'Verify the release', linkedAt: '2026-11-08T13:05:00Z',
        linkedBy: { kind: 'agent', id: 'prior-worker', name: 'Prior release worker' } }));
      if (linked && state !== 'linked-other') all.push({ id: 'link-candidate', taskId: claimStoryOwner.taskId,
        artifactId: 'candidate', artifactName: 'follow-up.md', taskTitle: 'Verify the release', attemptId: undefined,
        linkedAt: '2026-11-08T13:05:00Z', linkedBy: { kind: 'user', id: claimStoryOwner.accountId, name: 'Reviewing user' } });
      const result = page(match(all, body), body);
      return json({ links: result.selected, evidence: result.selected.map(link => ({ link, availability: 'available', contentType: 'text/markdown', storedBytes: '128', artifactCreatedAt: '2026-11-08T11:00:00Z' })),
        page: result.page, canLink: true, canUnlink: true });
    }
    if (request.url.endsWith('/UniversalSearch')) return json({ results: body.query ? [{ id: 'candidate', type: 'artifact', title: 'follow-up.md' }] : [] });
    if (request.url.endsWith('/LinkTaskArtifact')) {
      linked = true;
      return json({ link: { id: 'link-candidate', taskId: claimStoryOwner.taskId, artifactId: 'candidate',
        ...(state === 'linked-other' ? { attemptId: currentClaim.id } : {}) } });
    }
    if (/\/(UpdateTaskNote|DeleteTaskNote|UnlinkTaskArtifact)$/.test(request.url)) return json({ success: true });
    return error('unimplemented', 'This request has no claim-report preview fixture.');
  });
  return () => mock.mockRestore();
}
