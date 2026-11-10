import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';
type CommentState = 'populated' | 'empty' | 'loading' | 'error';
export function commentFixture(state: CommentState = 'populated') {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let comments = state === 'empty' ? [] : [
    { id: 'human-comment', userId: 'user-storybook', agentId: '', authorName: 'Alex Morgan', content: 'Please preserve the existing scope while reviewing the release.', createdAt: '2026-11-09T08:00:00Z' },
    { id: 'agent-comment', userId: '', agentId: 'agent-storybook', authorName: 'Release worker', content: 'The verification evidence is ready for a person to inspect.', createdAt: '2026-11-09T08:10:00Z' },
  ];
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (request.url.endsWith('/api/auth/session')) return json({ authenticated: true, userId: 'user-storybook' });
    if (request.url.endsWith('/api/client-errors')) return json({});
    const body = await request.json() as { content?: string; commentId?: string };
    if (request.url.endsWith('/ListComments')) {
      if (state === 'loading') return new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      if (state === 'error') return json({ code: 'unavailable', message: 'The comment thread is temporarily offline.' }, 503);
      return json({ comments, page: { totalCount: comments.length } });
    }
    if (request.url.endsWith('/CreateComment')) {
      const comment = { id: 'new-comment', userId: 'user-storybook', agentId: '', authorName: 'Alex Morgan', content: body.content ?? '', createdAt: '2026-11-10T01:00:00Z' };
      comments = [...comments, comment]; return json({ comment });
    }
    if (request.url.endsWith('/UpdateComment')) { comments = comments.map(comment => comment.id === body.commentId ? { ...comment, content: body.content ?? '' } : comment); return json({ comment: comments.find(comment => comment.id === body.commentId) }); }
    if (request.url.endsWith('/DeleteComment')) { comments = comments.filter(comment => comment.id !== body.commentId); return json({ success: true }); }
    return json({ code: 'unimplemented', message: 'This preview has no fixture for that request.' }, 400);
  });
  return () => mock.mockRestore();
}
