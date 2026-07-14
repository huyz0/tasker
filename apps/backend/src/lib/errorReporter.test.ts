import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { ConnectError, Code } from '@connectrpc/connect';
import { reportError, setErrorReporter, LoggerErrorReporter, type ErrorReporter } from './errorReporter';
import { logger } from './logger';

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

describe('LoggerErrorReporter', () => {
  it('extracts errorCode/errorCodeName as structured fields for a ConnectError', () => {
    const spy = spyOn(logger, 'error').mockImplementation(() => logger as any);
    try {
      new LoggerErrorReporter().report({
        message: 'rpc.error',
        err: new ConnectError('bad input', Code.InvalidArgument),
        severity: 'error',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const [loggedObject] = spy.mock.calls[0]!;
      expect((loggedObject as any).errorCode).toBe(Code.InvalidArgument);
      expect((loggedObject as any).errorCodeName).toBe('InvalidArgument');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not add errorCode fields for a plain Error (no .code)', () => {
    const spy = spyOn(logger, 'error').mockImplementation(() => logger as any);
    try {
      new LoggerErrorReporter().report({ message: 'rpc.error', err: new Error('boom'), severity: 'error' });

      const [loggedObject] = spy.mock.calls[0]!;
      expect((loggedObject as any).errorCode).toBeUndefined();
      expect((loggedObject as any).errorCodeName).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('routes severity fatal through logger.fatal instead of logger.error', () => {
    const spy = spyOn(logger, 'fatal').mockImplementation(() => logger as any);
    try {
      new LoggerErrorReporter().report({ message: 'crashed', err: new Error('boom'), severity: 'fatal' });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
