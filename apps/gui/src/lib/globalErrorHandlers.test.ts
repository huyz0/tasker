import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerGlobalErrorHandlers } from './globalErrorHandlers';
import { setErrorReporter, ConsoleErrorReporter } from './errorReporter';

describe('registerGlobalErrorHandlers', () => {
  afterEach(() => {
    setErrorReporter(new ConsoleErrorReporter());
    vi.restoreAllMocks();
  });

  it('registers a handler that reports uncaught window errors', () => {
    const handlers: Record<string, (event: any) => void> = {};
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: any) => {
      handlers[type] = listener;
    });
    const received: any[] = [];
    setErrorReporter({ report: (e) => received.push(e) });

    registerGlobalErrorHandlers();
    handlers.error({ error: new Error('window boom') });

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('window.onerror');
  });

  it('registers a handler that reports unhandled promise rejections', () => {
    const handlers: Record<string, (event: any) => void> = {};
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: any) => {
      handlers[type] = listener;
    });
    const received: any[] = [];
    setErrorReporter({ report: (e) => received.push(e) });

    registerGlobalErrorHandlers();
    handlers.unhandledrejection({ reason: new Error('rejection boom') });

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('unhandledrejection');
  });
});
