import { describe, it, expect, vi } from 'vitest';

const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

import { useAuthSession } from './useAuthSession';

describe('useAuthSession', () => {
  it('defaults to unauthenticated while loading', () => {
    mockUseQuery.mockReturnValue({ isLoading: true, data: undefined });
    const result = useAuthSession();
    expect(result).toEqual({ isLoading: true, authenticated: false, userId: null, mustChangePassword: false });
  });

  it('reflects the resolved session', () => {
    mockUseQuery.mockReturnValue({ isLoading: false, data: { authenticated: true, userId: 'user-1', mustChangePassword: false } });
    const result = useAuthSession();
    expect(result).toEqual({ isLoading: false, authenticated: true, userId: 'user-1', mustChangePassword: false });
  });

  /** M13-T12. */
  it('reflects mustChangePassword: true so callers can act on it', () => {
    mockUseQuery.mockReturnValue({ isLoading: false, data: { authenticated: true, userId: 'user-1', mustChangePassword: true } });
    const result = useAuthSession();
    expect(result.mustChangePassword).toBe(true);
  });
});
