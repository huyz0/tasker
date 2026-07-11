import { reportError } from './errorReporter';

export function registerGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    reportError({ message: 'window.onerror', err: event.error ?? event.message, severity: 'error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError({ message: 'unhandledrejection', err: event.reason, severity: 'error' });
  });
}
