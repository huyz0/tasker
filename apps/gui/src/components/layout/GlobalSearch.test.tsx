import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { GlobalSearch } from './GlobalSearch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient();

// Mock useDebounce
vi.mock('use-debounce', () => ({
  useDebounce: (value: string) => [value, { flush: vi.fn(), cancel: vi.fn() }],
}));

test('renders the global search button', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    </QueryClientProvider>
  );

  expect(screen.getByText('Search tasks, artifacts...')).toBeInTheDocument();
});
