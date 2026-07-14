import { describe, it, expect, beforeEach } from 'bun:test';
import { withRequestCorrelation, publishDomainEvent } from './natsCorrelation';
import { runWithRequestContext } from './requestContext';
import { getBusinessEventCounts, resetBusinessEvents } from './businessEvents';

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

describe('publishDomainEvent', () => {
  beforeEach(() => {
    resetBusinessEvents();
  });

  it('records the business event and publishes to NATS when nc is connected', () => {
    const { nc, publishedMessages } = makeFakeNc();
    publishDomainEvent(nc, 'domain.task.created', { id: 'tsk-1' });

    expect(getBusinessEventCounts()).toEqual({ 'domain.task.created': 1 });
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]!.subject).toBe('domain.task.created');
    expect(JSON.parse(publishedMessages[0]!.data.toString())).toEqual({ id: 'tsk-1' });
  });

  it('still records the business event when nc is null (no NATS connection)', () => {
    // STANDALONE local dev commonly runs without NATS - the whole point of
    // this test is that business-event volume stays visible in exactly
    // that environment, not just when a real NATS connection exists.
    publishDomainEvent(null, 'domain.task.created', { id: 'tsk-1' });
    expect(getBusinessEventCounts()).toEqual({ 'domain.task.created': 1 });
  });
});
