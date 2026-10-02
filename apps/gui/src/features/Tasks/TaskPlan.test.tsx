import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TaskPlan } from './TaskPlan';

describe('TaskPlan (M38)', () => {
  it('says when there is no plan', () => {
    render(<TaskPlan steps={[]} />);
    expect(screen.getByText('The agent has not shared a plan.')).toBeInTheDocument();
  });

  it('shows each step in order with its state, and progress counting done and skipped', () => {
    render(<TaskPlan steps={[
      { title: 'Read', status: 'done' }, { title: 'Write', status: 'in_progress' },
      { title: 'Skip me', status: 'skipped' }, { title: 'Ship', status: 'pending' }, { title: 'Odd', status: 'weird' },
    ] as any} />);
    const bar = screen.getByRole('progressbar', { name: 'Plan progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Plan steps' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['✓Done: Read', '▶In progress: Write', '–Skipped: Skip me', '○Pending: Ship', '○Pending: Odd']);
    expect(screen.getByText('Skip me')).toHaveClass('line-through');
    expect(screen.getByText('Write')).toHaveClass('font-medium');
  });
});
