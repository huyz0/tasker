import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BACKEND_URL } from '../lib/backendUrl';
import LoginPage from './Login';
import { expectNoA11yViolations } from '../test/a11y';

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render the page title and subtitle', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Tasker' })).toBeDefined();
    expect(screen.getByText('Autonomous SDLC Platform')).toBeDefined();
  });

  it('should render the Google login button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDefined();
  });

  it('should redirect to the shared BACKEND_URL when the Google button is clicked, not a separately hardcoded one', () => {
    const location = { ...window.location, href: '' };
    vi.stubGlobal('location', location);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

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

  it('renders exactly the two sign-in-triggering buttons — the password form\'s submit and the Google button', () => {
    renderPage();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
