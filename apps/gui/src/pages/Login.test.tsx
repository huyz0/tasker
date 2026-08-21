import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BACKEND_URL } from '../lib/backendUrl';
import LoginPage from './Login';
import { expectNoA11yViolations } from '../test/a11y';
import * as authSession from '../lib/authSession';

/**
 * M09-T06. The Google button is now conditional on the backend reporting that
 * Google is actually configured — the standalone binary has no credentials, and
 * a button that redirects with an empty client_id strands the person on a
 * Google error page. Tests that want the button say so.
 */
function withProviders(google: boolean) {
  vi.spyOn(authSession, 'fetchAuthProviders').mockResolvedValue({ google, password: true });
}

// M13-T11 added a username/password form (LoginForm, useMutation +
// useNavigate) alongside the existing Google button, so this page now
// needs the same providers a feature test would.
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage Component', () => {
  beforeEach(() => withProviders(true));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should render the page title and subtitle', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Tasker' })).toBeDefined();
    expect(screen.getByText('Autonomous SDLC Platform')).toBeDefined();
  });

  it('offers Google once the backend says it is configured', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeDefined();
  });

  it('offers only the password form when Google is not configured', async () => {
    // The standalone binary: one downloaded file, no OAuth credentials, and a
    // sign-in screen that shows only what actually works.
    withProviders(false);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    // The "or" separator belongs to the Google half and must go with it.
    expect(screen.queryByRole('separator', { name: 'or' })).toBeNull();
  });

  it('should redirect to the shared BACKEND_URL when the Google button is clicked, not a separately hardcoded one', async () => {
    const location = { ...window.location, href: '' };
    vi.stubGlobal('location', location);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    expect(window.location.href).toBe(`${BACKEND_URL}/api/auth/google/login`);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    await expectNoA11yViolations(container);
  });

  it('renders the username/password form alongside the Google button', () => {
    renderPage();
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined();
  });

  it('links to the registration page for someone with no account yet', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Create one' });
    expect(link.getAttribute('href')).toBe('/register');
  });

  it('renders exactly the two sign-in-triggering buttons — the password form\'s submit and the Google button', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Continue with Google' });
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
