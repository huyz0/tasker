import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, vi, describe, beforeEach } from 'vitest';
import { AppShell } from './AppShell';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import * as authSession from '../../lib/authSession';
import { useLayoutStore } from '../../store/layout';

vi.mock('use-debounce', () => ({
  useDebounce: (value: string) => [value, { flush: vi.fn(), cancel: vi.fn() }],
}));

const queryClient = new QueryClient();

test('logs out and clears the session cookie when the logout button is clicked', async () => {
  const logoutSpy = vi.spyOn(authSession, 'logout').mockResolvedValue();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );

  fireEvent.click(screen.getByLabelText('Log out'));

  await waitFor(() => expect(logoutSpy).toHaveBeenCalled());
});

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppShell>
          <button>A control on the page behind</button>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );

// The button's name comes from an sr-only span, not an aria-label.
const openSidebar = () => fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

describe('the mobile sidebar', () => {
  beforeEach(() => {
    useLayoutStore.setState({ sidebarOpen: false });
  });

  test('has no backdrop until it is open', () => {
    renderShell();
    // On desktop the sidebar is a column, not an overlay; a permanent backdrop
    // would cover the page at every width.
    expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
  });

  test('shows a backdrop when open, and closes on a tap outside', async () => {
    renderShell();
    openSidebar();

    const backdrop = await screen.findByTestId('sidebar-backdrop');
    fireEvent.click(backdrop);

    await waitFor(() => expect(useLayoutStore.getState().sidebarOpen).toBe(false));
  });

  test('traps Tab inside itself while open', async () => {
    renderShell();
    openSidebar();

    const outside = screen.getByRole('button', { name: 'A control on the page behind' });
    const sidebar = document.querySelector('aside')!;
    const inside = Array.from(sidebar.querySelectorAll('a,button'));
    (inside[inside.length - 1] as HTMLElement).focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // Without the trap the browser hands focus to the page the drawer is
    // covering, which the user cannot see.
    await waitFor(() => expect(document.activeElement).not.toBe(outside));
    expect(sidebar.contains(document.activeElement)).toBe(true);
  });

  test('closes on Escape', async () => {
    renderShell();
    openSidebar();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(useLayoutStore.getState().sidebarOpen).toBe(false));
  });

  test('closes even when the link is for the page already showing', async () => {
    renderShell();
    openSidebar();
    expect(useLayoutStore.getState().sidebarOpen).toBe(true);

    // MemoryRouter starts at "/", so this navigates nowhere and the pathname
    // effect never fires — the drawer stayed open over the page (M06-T10).
    fireEvent.click(screen.getByRole('link', { name: /Dashboard/ }));

    await waitFor(() => expect(useLayoutStore.getState().sidebarOpen).toBe(false));
  });

  test('closes itself when a navigation link is followed', async () => {
    renderShell();
    openSidebar();
    expect(useLayoutStore.getState().sidebarOpen).toBe(true);

    fireEvent.click(screen.getByRole('link', { name: /Tasks/ }));

    // Navigating used to leave the drawer covering the page that had just
    // loaded behind it.
    await waitFor(() => expect(useLayoutStore.getState().sidebarOpen).toBe(false));
  });
});

describe('live connection indicator (M08-T10)', () => {
  test('reports the feed state in both the mobile header and the desktop rail', () => {
    // Two placements, one subscription: the shell holds the single
    // useLiveEvents and passes its status down. Only one is displayed at a
    // time (the header is md:hidden, the rail is hidden md:flex), but jsdom
    // applies no CSS, so both are in the tree here.
    renderShell();
    const indicators = screen.getAllByTestId('live-status');
    expect(indicators).toHaveLength(2);
    for (const indicator of indicators) {
      expect(indicator.getAttribute('data-status')).toBe('connecting');
    }
  });
});
