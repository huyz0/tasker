import { describe, it, expect } from 'bun:test';
import { withRequestCorrelation } from './natsCorrelation';
import { runWithRequestContext } from './requestContext';

function makeFakeNc() {
  const publishedMessages: { subject: string; data: any }[] = [];
  return {
    nc: { publish: (subject: string, data?: any) => { publishedMessages.push({ subject, data }); } },
    publishedMessages,
  };
}

describe('withRequestCorrelation', () => {
  it('injects the active request id into a JSON payload published during that request', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-123', userId: 'user-1' }, () => {
      wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 'tsk-1' })));
    });

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload).toEqual({ id: 'tsk-1', requestId: 'req-123' });
  });

  it('does not overwrite an existing requestId already present on the payload', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-outer', userId: null }, () => {
      wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 'tsk-1', requestId: 'req-original' })));
    });

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload.requestId).toBe('req-original');
  });

  it('publishes the payload unchanged when called outside any request context', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    wrapped.publish('domain.task.created', Buffer.from(JSON.stringify({ id: 'tsk-1' })));

    const payload = JSON.parse(publishedMessages[0]!.data.toString());
    expect(payload).toEqual({ id: 'tsk-1' });
  });

  it('leaves non-JSON payloads unchanged instead of throwing', () => {
    const { nc, publishedMessages } = makeFakeNc();
    const wrapped = withRequestCorrelation(nc);

    runWithRequestContext({ requestId: 'req-123' }, () => {
      wrapped.publish('domain.task.created', Buffer.from('not json'));
    });

    expect(publishedMessages[0]!.data.toString()).toBe('not json');
  });
});
