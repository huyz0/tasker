import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrganizationsDashboard } from './index';

// Mock the Zustand store hook
vi.mock('../../store/layout', () => ({
  useLayoutStore: () => vi.fn()
}));

describe('OrganizationsDashboard', () => {
  it('renders the header correctly', () => {
    render(<OrganizationsDashboard />);
    expect(screen.getByText('Organizations & Settings')).toBeDefined();
    expect(screen.getByText('Manage hierarchical organizational structure and teams.')).toBeDefined();
  });

  it('renders members list', () => {
    render(<OrganizationsDashboard />);
    expect(screen.getByText('Admin User')).toBeDefined();
    expect(screen.getByText('Member One')).toBeDefined();
  });
});
