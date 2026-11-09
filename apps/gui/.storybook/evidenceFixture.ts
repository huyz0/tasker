import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';

export type EvidenceState = 'populated' | 'empty' | 'loading' | 'error' | 'denied' | 'readonly' | 'legacy' | 'unavailable' | 'long' | 'pages' | 'page-error';
const link = { id: 'story-link', taskId: 'task-storybook', artifactId: 'artifact-storybook', artifactName: 'release-verification.md', taskTitle: 'Verify the release',
  linkedAt: '2026-11-09T12:00:00Z', linkedBy: { kind: 'agent', id: 'worker-1', name: 'Release worker' } };

/** Isolated wire responses exercise the real Connect decoder; no live account. */
export function evidenceFixture(state: EvidenceState = 'populated') {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let removed = false, added = false;
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const error = (code: string, message: string) => json({ code, message }, 400);
    if (request.url.endsWith('/api/auth/session')) return json({ authenticated: true, userId: 'evidence-story-user' });
    if (request.url.endsWith('/api/client-errors')) return json({});
    const body = await request.json() as { page?: { cursor?: string }; query?: string };
    if (request.url.endsWith('/ListTaskArtifactLinks')) {
      if (state === 'loading') return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      if (state === 'error') return error('unavailable', 'Evidence is temporarily offline.');
      if (state === 'denied') return error('permission_denied', 'Current artifact access was removed.');
      if (state === 'page-error' && body.page?.cursor) return error('unavailable', 'The next evidence page is offline.');
      const current = { ...link, ...(body.page?.cursor ? { id: 'second-link', artifactId: 'second-artifact', artifactName: 'deployment-notes.txt', linkedBy: { kind: 'user', id: 'reviewer', name: 'Alex Morgan' } } : {}),
        ...(state === 'long' ? { artifactName: `verification-${'very-long-unbroken-file-name'.repeat(12)}.md` } : {}) };
      const links = state === 'empty' || removed ? [] : [current];
      if (added) links.push({ ...link, id: 'new-link', artifactId: 'candidate', artifactName: 'follow-up.md' });
      const metadata = links.map(row => ({ link: row, availability: state === 'unavailable' ? 'unavailable' : state === 'long' ? 'archived' : 'available', contentType: 'text/markdown', storedBytes: state === 'long' ? '4500000000' : '0', artifactCreatedAt: '2026-11-09T11:00:00Z' }));
      if (state === 'legacy') return json({ links: links.map(row => ({ ...row, linkedAt: undefined, linkedBy: undefined })) });
      return json({ links, evidence: metadata, canLink: state !== 'readonly', canUnlink: state !== 'readonly',
        page: { totalCount: state === 'pages' || state === 'page-error' ? 2 : links.length,
          ...((state === 'pages' || state === 'page-error') && !body.page?.cursor ? { nextCursor: 'story-next' } : {}) } });
    }
    if (request.url.endsWith('/UniversalSearch')) return json({ results: body.query ? [{ id: 'candidate', type: 'artifact', title: 'follow-up.md' }] : [] });
    if (request.url.endsWith('/LinkTaskArtifact')) { added = true; return json({ link }); }
    if (request.url.endsWith('/UnlinkTaskArtifact')) { removed = true; return json({ success: true }); }
    return error('unimplemented', 'This request has no preview fixture.');
  });
  return () => mock.mockRestore();
}
