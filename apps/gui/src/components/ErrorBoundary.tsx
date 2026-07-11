import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/errorReporter';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError({
      message: 'unhandled render error',
      err: error,
      severity: 'fatal',
      context: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
          <div className="max-w-md w-full border border-destructive/20 bg-destructive/10 text-destructive rounded-lg p-6 text-center">
            <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
            <p className="text-sm mb-4">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-background border rounded hover:bg-muted text-foreground"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
