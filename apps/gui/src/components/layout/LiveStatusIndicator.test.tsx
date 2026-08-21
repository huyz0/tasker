import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LiveStatusIndicator } from './LiveStatusIndicator';

describe('LiveStatusIndicator', () => {
  it('says what is happening in words, not only in colour', () => {
    // A coloured dot alone is unreadable to a screen reader and to anyone who
    // cannot distinguish the hues.
    render(<LiveStatusIndicator status="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');
  });

  it('announces politely rather than interrupting', () => {
    render(<LiveStatusIndicator status="offline" />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('describes the offline state as slower, not as stopped', () => {
    // Polling is still refreshing the screen. "Offline" on its own would
    // suggest the data on it has stopped being true.
    render(<LiveStatusIndicator status="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing periodically');
  });

  it('keeps the connected state quiet visually but still readable', () => {
    // A working app should not spend header space saying so — but a screen
    // reader user still needs the state on request.
    render(<LiveStatusIndicator status="live" />);
    const label = screen.getByText('Live');
    expect(label.className).toContain('sr-only');
    expect(label.className).not.toContain('sm:not-sr-only');
  });

  it('shows the unhappy states visibly once there is room for them', () => {
    render(<LiveStatusIndicator status="reconnecting" />);
    expect(screen.getByText('Reconnecting…').className).toContain('sm:not-sr-only');
  });

  it('exposes the raw state for tests and styling without parsing the label', () => {
    for (const status of ['connecting', 'live', 'reconnecting', 'offline'] as const) {
      const { unmount } = render(<LiveStatusIndicator status={status} />);
      expect(screen.getByTestId('live-status').getAttribute('data-status')).toBe(status);
      unmount();
    }
  });

  it('renders every status without falling through to undefined', () => {
    for (const status of ['connecting', 'live', 'reconnecting', 'offline'] as const) {
      const { unmount } = render(<LiveStatusIndicator status={status} />);
      expect(screen.getByRole('status').textContent).toBeTruthy();
      unmount();
    }
  });
});
