import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildBadge } from './BuildBadge';


describe('BuildBadge', () => {
  it('renders success status correctly', () => {
    render(<BuildBadge status="SUCCESS" commitSha="1234567890" />);
    const badge = screen.getByTestId('build-badge');
    expect(badge.textContent).toBe('1234567 - SUCCESS');
    expect(badge.className).toContain('bg-green-100');
  });

  it('renders failure status correctly', () => {
    render(<BuildBadge status="FAILURE" commitSha="1234567890" />);
    const badge = screen.getByTestId('build-badge');
    expect(badge.textContent).toBe('1234567 - FAILURE');
    expect(badge.className).toContain('bg-red-100');
  });
});
