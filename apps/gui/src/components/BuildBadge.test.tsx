import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildBadge } from './BuildBadge';

describe('BuildBadge', () => {
  // These previously asserted `bg-green-100` / `bg-red-100`, which broke the
  // moment the palette moved to semantic tokens — and which
  // `ui-testing-standard.md` §2 forbids outright ("DO NOT test CSS classes").
  // What actually matters is WCAG 1.4.1: status must not be conveyed by colour
  // alone. Assert the text, which is the channel a colour-blind user reads.
  it('states the status in text, not only in colour', () => {
    render(<BuildBadge status="SUCCESS" commitSha="1234567890" />);
    expect(screen.getByTestId('build-badge').textContent).toBe('1234567 - SUCCESS');
  });

  it('distinguishes failure from success in text', () => {
    render(<BuildBadge status="FAILURE" commitSha="1234567890" />);
    expect(screen.getByTestId('build-badge').textContent).toBe('1234567 - FAILURE');
  });

  it('falls back to a neutral treatment for an unfinished build', () => {
    render(<BuildBadge status="PENDING" commitSha="abcdef1234" />);
    expect(screen.getByTestId('build-badge').textContent).toBe('abcdef1 - PENDING');
  });
});
