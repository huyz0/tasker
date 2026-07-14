import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('renders a fallback and logs the error when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('kaboom')).toBeDefined();
    expect(spy).toHaveBeenCalled();
  });

  it('reloads the page when the Reload button is clicked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', { writable: true, configurable: true, value: { reload: reloadSpy } });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reloadSpy).toHaveBeenCalled();
  });
});
