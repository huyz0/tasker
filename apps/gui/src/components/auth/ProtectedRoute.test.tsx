import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockUseAuthSession = vi.fn();
vi.mock('../../hooks/useAuthSession', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

async function renderWithFlag(flag: string | undefined) {
  vi.stubEnv('VITE_REQUIRE_AUTH', flag);
  vi.resetModules();
  const { ProtectedRoute } = await import('./ProtectedRoute');
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<ProtectedRoute><div>Protected Content</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('renders children unconditionally when auth enforcement is disabled', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: false, userId: null });
    await renderWithFlag(undefined);
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('redirects to /login when enforcement is enabled and the user is unauthenticated', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: false, userId: null });
    await renderWithFlag('true');
    expect(screen.getByText('Login Page')).toBeDefined();
  });

  it('renders children when enforcement is enabled and the user is authenticated', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: false, authenticated: true, userId: 'user-1' });
    await renderWithFlag('true');
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('renders nothing while the session check is loading and enforcement is enabled', async () => {
    mockUseAuthSession.mockReturnValue({ isLoading: true, authenticated: false, userId: null });
    await renderWithFlag('true');
    expect(screen.queryByText('Protected Content')).toBeNull();
    expect(screen.queryByText('Login Page')).toBeNull();
  });
});
