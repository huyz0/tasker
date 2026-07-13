import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { AppShell } from './AppShell';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import * as authSession from '../../lib/authSession';

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
