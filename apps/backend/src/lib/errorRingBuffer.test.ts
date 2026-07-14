import { describe, it, expect, beforeEach } from 'bun:test';
import { recordErrorEvent, getRecentErrors, resetErrorRingBuffer } from './errorRingBuffer';
import { runWithRequestContext } from './requestContext';

describe('errorRingBuffer', () => {
  beforeEach(() => resetErrorRingBuffer());

  it('records an event with its error name/message extracted', () => {
    recordErrorEvent('something broke', 'error', new TypeError('bad input'));

    const [entry] = getRecentErrors();
    expect(entry!.message).toBe('something broke');
    expect(entry!.severity).toBe('error');
    expect(entry!.errName).toBe('TypeError');
    expect(entry!.errMessage).toBe('bad input');
  });

  it('captures requestId/userId from the active request context, when present', () => {
    runWithRequestContext({ requestId: 'req-abc', userId: 'user-1' }, () => {
      recordErrorEvent('scoped error', 'error', new Error('boom'));
    });

    const [entry] = getRecentErrors();
    expect(entry!.requestId).toBe('req-abc');
    expect(entry!.userId).toBe('user-1');
  });

  it('returns entries most-recent-first', () => {
    recordErrorEvent('first', 'error', undefined);
    recordErrorEvent('second', 'error', undefined);

    const entries = getRecentErrors();
    expect(entries[0]!.message).toBe('second');
    expect(entries[1]!.message).toBe('first');
  });

  it('caps retained entries at 100, dropping the oldest', () => {
    for (let i = 0; i < 150; i++) {
      recordErrorEvent(`error-${i}`, 'error', undefined);
    }

    const entries = getRecentErrors();
    expect(entries.length).toBe(100);
    expect(entries[0]!.message).toBe('error-149');
    expect(entries[entries.length - 1]!.message).toBe('error-50');
  });
});
