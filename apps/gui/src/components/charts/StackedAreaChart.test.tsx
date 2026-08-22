import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { expectNoA11yViolations } from '../../test/a11y';
import { StackedAreaChart } from './StackedAreaChart';

const bands = [
  {
    label: 'Backlog',
    colorToken: 1,
    points: [
      { date: '2026-08-01', value: 5 },
      { date: '2026-08-02', value: 4 },
      { date: '2026-08-03', value: 3 },
    ],
  },
  {
    label: 'Doing',
    colorToken: 2,
    points: [
      { date: '2026-08-01', value: 1 },
      { date: '2026-08-02', value: 2 },
      { date: '2026-08-03', value: 2 },
    ],
  },
  {
    label: 'Done',
    colorToken: 3,
    points: [
      { date: '2026-08-01', value: 0 },
      { date: '2026-08-02', value: 1 },
      { date: '2026-08-03', value: 3 },
    ],
  },
];

const props = {
  title: 'Cumulative flow',
  description: 'Tasks per status per day, stacked.',
  bands,
};

describe('StackedAreaChart', () => {
  it('is an image named by its title', () => {
    render(<StackedAreaChart {...props} />);
    expect(screen.getByRole('img', { name: 'Cumulative flow' })).toBeInTheDocument();
  });

  it('exposes the data as a table with a Total column', () => {
    render(<StackedAreaChart {...props} />);
    const table = screen.getByRole('table', { name: 'Cumulative flow' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Date', 'Backlog', 'Doing', 'Done', 'Total']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3 days
    const first = within(rows[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(first).toEqual(['2026-08-01', '5', '1', '0', '6']);
    const last = within(rows[3]).getAllByRole('cell').map((c) => c.textContent);
    expect(last).toEqual(['2026-08-03', '3', '2', '3', '8']);
  });

  it('names every band in the legend, never by colour alone', () => {
    render(<StackedAreaChart {...props} />);
    const labels = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(labels).toEqual(['Backlog', 'Doing', 'Done']);
  });

  it('reads out every band plus the total for the focused day', () => {
    render(<StackedAreaChart {...props} />);
    const img = screen.getByRole('img', { name: 'Cumulative flow' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent(
      '2026-08-03 · Backlog 3, Doing 2, Done 3 · total 8',
    );
    fireEvent.keyDown(img, { key: 'ArrowLeft' });
    expect(screen.getByRole('status')).toHaveTextContent(
      '2026-08-02 · Backlog 4, Doing 2, Done 1 · total 7',
    );
  });

  it('formats values through yFormat', () => {
    render(<StackedAreaChart {...props} yFormat={(v) => `${v} tasks`} />);
    const img = screen.getByRole('img', { name: 'Cumulative flow' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent('Backlog 3 tasks');
    expect(screen.getByRole('status')).toHaveTextContent('total 8 tasks');
  });

  it('cycles the palette past six bands rather than refusing them', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      label: `Status ${i + 1}`,
      colorToken: i + 1,
      points: [
        { date: '2026-08-01', value: 1 },
        { date: '2026-08-02', value: 2 },
      ],
    }));
    render(<StackedAreaChart {...props} bands={many} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    const table = screen.getByRole('table', { name: 'Cumulative flow' });
    // Date + 8 bands + Total
    expect(within(table).getAllByRole('columnheader')).toHaveLength(10);
  });

  it('renders a single day as a stack without a time axis to spread on', () => {
    const single = bands.map((b) => ({ ...b, points: [b.points[0]] }));
    render(<StackedAreaChart {...props} bands={single} />);
    const table = screen.getByRole('table', { name: 'Cumulative flow' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    const img = screen.getByRole('img', { name: 'Cumulative flow' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent(
      '2026-08-01 · Backlog 5, Doing 1, Done 0 · total 6',
    );
  });

  it('shows the footnote visibly', () => {
    render(<StackedAreaChart {...props} footnote="History collected since 2026-08-20" />);
    expect(screen.getByText('History collected since 2026-08-20')).toBeInTheDocument();
  });

  it('says honestly when there is nothing to chart', () => {
    render(<StackedAreaChart {...props} bands={[]} />);
    expect(screen.getByText('No data for this period yet.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cumulative flow' })).toBeInTheDocument();
  });

  it('renders all-zero bands without dividing by zero', () => {
    const zero = bands.map((b) => ({
      ...b,
      points: b.points.map((p) => ({ ...p, value: 0 })),
    }));
    render(<StackedAreaChart {...props} bands={zero} />);
    const img = screen.getByRole('img', { name: 'Cumulative flow' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent('total 0');
  });

  it('has no axe violations when populated', async () => {
    const { container } = render(
      <StackedAreaChart {...props} footnote="History collected since 2026-08-20" />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations when empty', async () => {
    const { container } = render(<StackedAreaChart {...props} bands={[]} />);
    await expectNoA11yViolations(container);
  });
});
