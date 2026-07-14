import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LabelChips } from './LabelChips';
import type { LabelContextValue } from './LabelContext';

vi.mock('./LabelContext', async () => {
  const actual = await vi.importActual<typeof import('./LabelContext')>('./LabelContext');
  return { ...actual, useLabels: vi.fn() };
});

import { useLabels } from './LabelContext';

function mockContext(overrides: Partial<LabelContextValue['state']> = {}, detachLabel = vi.fn()): void {
  vi.mocked(useLabels).mockReturnValue({
    state: { attached: [], available: [], isLoading: false, isError: false, error: null, ...overrides },
    actions: { attachLabel: vi.fn(), detachLabel, createLabel: vi.fn() },
  });
}

describe('LabelChips', () => {
  it('shows the empty message when no labels are attached', () => {
    mockContext();
    render(<LabelChips />);
    expect(screen.getByText('No labels attached.')).toBeInTheDocument();
  });

  it('shows a custom empty message when provided', () => {
    mockContext();
    render(<LabelChips emptyMessage="Nothing here yet." />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('renders every attached label with its color', () => {
    mockContext({ attached: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }, { id: 'lbl-2', name: 'urgent' }] });
    render(<LabelChips />);

    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
  });

  it('detaches a label when its remove button is clicked', () => {
    const detachLabel = vi.fn();
    mockContext({ attached: [{ id: 'lbl-1', name: 'bug' }] }, detachLabel);
    render(<LabelChips />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove label bug' }));
    expect(detachLabel).toHaveBeenCalledWith('lbl-1');
  });
});
