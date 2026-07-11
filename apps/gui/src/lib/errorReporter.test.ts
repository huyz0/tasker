import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportError, setErrorReporter, ConsoleErrorReporter, type ErrorReporter } from './errorReporter';

describe('errorReporter', () => {
  afterEach(() => {
    setErrorReporter(new ConsoleErrorReporter());
  });

  it('routes reported events through the active reporter', () => {
    const received: any[] = [];
    const fake: ErrorReporter = { report: (event) => received.push(event) };
    setErrorReporter(fake);

    reportError({ message: 'something broke', err: new Error('boom'), severity: 'error' });

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('something broke');
  });

  it('defaults to logging to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError({ message: 'default sink', severity: 'error' });
    expect(spy).toHaveBeenCalled();
  });
});
