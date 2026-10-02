import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityBadge, BlockedBadge } from './PriorityBadge';
import { priorityLabel, priorityTone, PRIORITY_OPTIONS } from './priority';

describe('PriorityBadge (M35)', () => {
  it('says nothing for "no priority" and names the rest', () => {
    const { container } = render(<PriorityBadge priority={0} />);
    expect(container).toBeEmptyDOMElement();
    for (const [p, label] of [[1, 'Urgent'], [2, 'High'], [3, 'Medium'], [4, 'Low']] as const) {
      render(<PriorityBadge priority={p} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('maps each priority to a tone on the documented scale', () => {
    expect([1, 2, 3, 4, 0].map(priorityTone)).toEqual(['destructive', 'warning', 'info', 'neutral', 'neutral']);
    expect(priorityLabel(9)).toBe('Priority 9');
    // Most important first, "none" last - the order every picker shows.
    expect(PRIORITY_OPTIONS.map((o) => o.value)).toEqual([1, 2, 3, 4, 0]);
  });
});

describe('BlockedBadge (M35)', () => {
  it('says nothing when nothing blocks the task, and counts only above one', () => {
    const { container } = render(<BlockedBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    render(<BlockedBadge count={1} />);
    expect(screen.getByText('Blocked')).toHaveAttribute('title', 'Waiting on 1 unfinished task');
    render(<BlockedBadge count={3} />);
    expect(screen.getByText('Blocked · 3')).toHaveAttribute('title', 'Waiting on 3 unfinished tasks');
  });
});
