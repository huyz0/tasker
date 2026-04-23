import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrganizationsDashboard } from './index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the Zustand store hook
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => {
    // Basic mock logic to handle multiple selector returns
    const state = {
      setActivePageTitle: vi.fn(),
      activeOrgId: 'org-1',
      setActiveOrgId: vi.fn(),
    };
    return selector(state);
  })
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

describe('OrganizationsDashboard', () => {
  it('renders the header correctly', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationsDashboard />
      </QueryClientProvider>
    );
    expect(screen.getByText('Organizations & Settings')).toBeDefined();
    expect(screen.getByText('Manage hierarchical organizational structure and teams.')).toBeDefined();
  });

  it('renders loading state for orgs', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationsDashboard />
      </QueryClientProvider>
    );
    expect(screen.getByText('Loading organizations...')).toBeDefined();
  });
});
