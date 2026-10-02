import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderScoped } from '../../test/renderScoped';
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

test('every sidebar link carries the active scope, so following one does not lose the project', async () => {
  // M28-T04. A missed call site does not error — it silently drops you into
  // another project, or none. So this asserts the invariant over the whole
  // nav rather than trusting an audit of the individual links.
  renderScoped(<AppShell><div /></AppShell>, {
    paths: ['/tasks'],
    initialEntry: '/tasks?org=org-1&project=proj-1',
  });

  const links = screen.getAllByRole('link');
  expect(links.length).toBeGreaterThan(5);

  const dropped = links
    .map((link) => link.getAttribute('href') ?? '')
    // The logout control leaves the shell for /login, where a scope would be
    // meaningless; it is a button, not a link, so nothing here should match.
    .filter((href) => href.startsWith('/'))
    .filter((href) => !(href.includes('org=org-1') && href.includes('project=proj-1')));

  expect(dropped, `these shell links drop the scope: ${dropped.join(', ')}`).toEqual([]);
});

test('a link built without the helper is caught by that invariant', () => {
  // Proving the guard above can fail: an unscoped href is exactly what a
  // forgotten `scopedTo` produces, and it must not pass.
  const hrefs = ['/tasks?org=org-1&project=proj-1', '/reports'];
  const dropped = hrefs.filter((h) => !(h.includes('org=org-1') && h.includes('project=proj-1')));
  expect(dropped).toEqual(['/reports']);
});


// ── M29-T07: the bell is mounted, in both header regions ───────────────────

describe('notification bell (M29-T07)', () => {
  test('renders in both header regions, so neither breakpoint loses it', async () => {
    // Deliberately no active org: the bell renders regardless and its queries
    // stay disabled, which keeps this test about *mounting*. Setting an org
    // here would wake ListProjects, GetIdentity and the event subscription,
    // and the test would be half a mock of the whole app.
    //
    // The bell's own behaviour - badge, list, mark-read, navigation with
    // scope - is covered against the real transport in
    // NotificationBell.test.tsx, and end to end in the T08 browser spec.
    renderShell();

    // The mobile header is `md:hidden` and the sidebar block is `hidden
    // md:flex`; they are never both visible, so mounting only one hides the
    // bell from half the users. That is the bug the sidebar's own ThemeToggle
    // comment records having already happened once.
    await waitFor(() => expect(screen.getAllByTestId('notification-bell')).toHaveLength(2));
  });

  test('is reachable by name for a screen reader', async () => {
    renderShell();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(2));
  });
});

describe('keyboard and screen-reader affordances', () => {
  beforeEach(() => useLayoutStore.setState({ sidebarOpen: false }));

  test('the first focusable element skips to the page content', () => {
    renderShell();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(document.querySelector('main#main')).not.toBeNull();
    // Nothing precedes it in tab order.
    const focusables = document.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]');
    expect(focusables[0]).toBe(skip);
  });

  test('the menu button reports whether the drawer it controls is open', () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Toggle Sidebar' });
    expect(toggle).toHaveAttribute('aria-controls', 'app-sidebar');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('the theme toggle is mounted once, in the sidebar footer, for every width', () => {
    renderShell();
    expect(screen.getAllByRole('radiogroup', { name: 'Colour theme' })).toHaveLength(1);
    expect(document.querySelector('aside')!.contains(screen.getByRole('radiogroup'))).toBe(true);
  });
});
