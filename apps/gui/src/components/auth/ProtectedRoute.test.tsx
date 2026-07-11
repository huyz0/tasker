import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseAuthSession = vi.fn();
vi.mock('../../hooks/useAuthSession', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

const mockEnsureDevSession = vi.fn();
vi.mock('../../lib/devAuthBootstrap', () => ({
  ensureDevSession: () => mockEnsureDevSession(),
}));

async function renderWithFlags(flag: string | undefined, dev: boolean) {
  vi.stubEnv('VITE_REQUIRE_AUTH', flag);
  vi.stubEnv('DEV', dev);
  vi.resetModules();
  const { ProtectedRoute } = await import('./ProtectedRoute');
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<ProtectedRoute><div>Protected Content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('renders children unconditionally when auth enforcement is disabled (non-dev build)', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: false, userId: null });
    await renderWithFlags(undefined, false);
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('redirects to /login when enforcement is enabled and the user is unauthenticated', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: false, userId: null });
    await renderWithFlags('true', false);
    expect(screen.getByText('Login Page')).toBeDefined();
  });

  it('renders children when enforcement is enabled and the user is authenticated', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: true, userId: 'user-1' });
    await renderWithFlags('true', false);
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('renders nothing while the session check is loading and enforcement is enabled', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: true, authenticated: false, userId: null });
    await renderWithFlags('true', false);
    expect(screen.queryByText('Protected Content')).toBeNull();
    expect(screen.queryByText('Login Page')).toBeNull();
  });

  it('in dev builds, establishes a session via the test-login endpoint before rendering', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: false, userId: null });
    mockEnsureDevSession.mockResolvedValue(undefined);
    await renderWithFlags(undefined, true);

    expect(screen.queryByText('Protected Content')).toBeNull();
    await waitFor(() => expect(mockEnsureDevSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Protected Content')).toBeDefined());
  });

  it('in dev builds, still renders content even if the dev session bootstrap fails', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: false, userId: null });
    mockEnsureDevSession.mockRejectedValue(new Error('backend unreachable'));
    await renderWithFlags(undefined, true);

    await waitFor(() => expect(screen.getByText('Protected Content')).toBeDefined());
  });

  it('does not attempt dev session bootstrap once already authenticated', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: true, userId: 'user-1' });
    await renderWithFlags(undefined, true);

    expect(screen.getByText('Protected Content')).toBeDefined();
    expect(mockEnsureDevSession).not.toHaveBeenCalled();
  });
});
