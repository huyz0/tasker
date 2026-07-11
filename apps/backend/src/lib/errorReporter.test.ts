import { describe, it, expect, afterEach } from 'bun:test';
import { reportError, setErrorReporter, LoggerErrorReporter, type ErrorReporter } from './errorReporter';

describe('errorReporter', () => {
  afterEach(() => {
    // Restore the real default reporter so other test files aren't affected.
    setErrorReporter(new LoggerErrorReporter());
  });

  it('routes reported events through the active reporter', () => {
    const received: any[] = [];
    const fake: ErrorReporter = { report: (event) => received.push(event) };
    setErrorReporter(fake);

    reportError({ message: 'something broke', err: new Error('boom'), severity: 'error', context: { requestId: 'abc' } });

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('something broke');
    expect(received[0].severity).toBe('error');
    expect(received[0].context).toEqual({ requestId: 'abc' });
  });

  it('is swappable at runtime, allowing a different sink to take over', () => {
    const first: any[] = [];
    const second: any[] = [];
    setErrorReporter({ report: (e) => first.push(e) });
    reportError({ message: 'to first', severity: 'error' });

    setErrorReporter({ report: (e) => second.push(e) });
    reportError({ message: 'to second', severity: 'error' });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
