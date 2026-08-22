import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { expectNoA11yViolations } from '../../test/a11y';
import { LineChart } from './LineChart';

const series = [
  {
    label: 'Autonomous',
    colorToken: 1 as const,
    points: [
      { date: '2026-08-01', value: 1 },
      { date: '2026-08-02', value: 3 },
      { date: '2026-08-03', value: 5 },
    ],
  },
  {
    label: 'Assisted',
    colorToken: 2 as const,
    points: [
      { date: '2026-08-01', value: 2 },
      { date: '2026-08-02', value: 2 },
      { date: '2026-08-03', value: 2 },
    ],
  },
];

const props = {
  title: 'Autonomy and rework',
  description: 'Autonomous versus assisted task completions per day.',
  series,
};

/** The plot has a real size in the browser; jsdom reports 0×0 unless told. */
function sizeChart(el: Element): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 260, width: 640, height: 260, toJSON: () => ({}) }) as DOMRect;
}

describe('LineChart', () => {
  it('is an image named by its title', () => {
    render(<LineChart {...props} />);
    expect(screen.getByRole('img', { name: 'Autonomy and rework' })).toBeInTheDocument();
  });

  it('exposes the data as a table: one column per series, one row per day', () => {
    render(<LineChart {...props} />);
    const table = screen.getByRole('table', { name: 'Autonomy and rework' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Date', 'Autonomous', 'Assisted']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3 days
    const first = within(rows[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(first).toEqual(['2026-08-01', '1', '2']);
  });

  it('names every series in the legend, never by colour alone', () => {
    render(<LineChart {...props} />);
    const labels = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(labels).toEqual(['Autonomous', 'Assisted']);
  });

  it('reads out the most recent day on focus', () => {
    render(<LineChart {...props} />);
    fireEvent.focus(screen.getByRole('img', { name: 'Autonomy and rework' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      '2026-08-03 · Autonomous 5, Assisted 2',
    );
  });

  it('walks days with arrow keys, clamped at both ends', () => {
    render(<LineChart {...props} />);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    fireEvent.focus(img);
    fireEvent.keyDown(img, { key: 'ArrowLeft' });
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-02 · Autonomous 3, Assisted 2');
    fireEvent.keyDown(img, { key: 'ArrowLeft' });
    fireEvent.keyDown(img, { key: 'ArrowLeft' }); // already at the first day
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-01 · Autonomous 1, Assisted 2');
    fireEvent.keyDown(img, { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-02');
    fireEvent.keyDown(img, { key: 'End' });
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-03');
    fireEvent.keyDown(img, { key: 'End' });
    fireEvent.keyDown(img, { key: 'ArrowRight' }); // already at the last day
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-03');
    fireEvent.keyDown(img, { key: 'Home' });
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-01');
    fireEvent.keyDown(img, { key: 'Tab' }); // unhandled keys change nothing
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-01');
  });

  it('starts from the most recent day when keyed before ever focusing', () => {
    render(<LineChart {...props} />);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    fireEvent.keyDown(img, { key: 'ArrowLeft' });
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-02');
  });

  it('reads out the day nearest the pointer', () => {
    render(<LineChart {...props} />);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    sizeChart(img);
    fireEvent.mouseMove(img, { clientX: 340, clientY: 100 });
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-02 · Autonomous 3, Assisted 2');
  });

  it('ignores pointer noise before layout has a size', () => {
    render(<LineChart {...props} />);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    fireEvent.mouseMove(img, { clientX: 340, clientY: 100 });
    expect(screen.getByRole('status')).toHaveTextContent(/^$/);
  });

  it('formats values through yFormat in the readout and the table', () => {
    render(<LineChart {...props} yFormat={(v) => `${v}%`} />);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent('Autonomous 5%, Assisted 2%');
    const table = screen.getByRole('table', { name: 'Autonomy and rework' });
    const first = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(first.map((c) => c.textContent)).toEqual(['2026-08-01', '1%', '2%']);
  });

  it('shows the footnote visibly', () => {
    render(<LineChart {...props} footnote="History collected since 2026-08-20" />);
    expect(screen.getByText('History collected since 2026-08-20')).toBeInTheDocument();
  });

  it('renders a single-point series without an axis to spread it on', () => {
    const single = [
      { label: 'Autonomous', colorToken: 1 as const, points: [{ date: '2026-08-22', value: 4 }] },
    ];
    render(<LineChart {...props} series={single} />);
    const table = screen.getByRole('table', { name: 'Autonomy and rework' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-22 · Autonomous 4');
  });

  it('says honestly when there is nothing to chart', () => {
    render(<LineChart {...props} series={[]} />);
    expect(screen.getByText('No data for this period yet.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Autonomy and rework' })).toBeInTheDocument();
  });

  it('renders an all-zero series without dividing by zero', () => {
    const zero = [
      {
        label: 'Autonomous',
        colorToken: 1 as const,
        points: [
          { date: '2026-08-01', value: 0 },
          { date: '2026-08-02', value: 0 },
        ],
      },
    ];
    render(<LineChart {...props} series={zero} />);
    const img = screen.getByRole('img', { name: 'Autonomy and rework' });
    fireEvent.focus(img);
    expect(screen.getByRole('status')).toHaveTextContent('2026-08-02 · Autonomous 0');
  });

  it('has no axe violations when populated', async () => {
    const { container } = render(<LineChart {...props} footnote="History collected since 2026-08-20" />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations when empty', async () => {
    const { container } = render(<LineChart {...props} series={[]} />);
    await expectNoA11yViolations(container);
  });
});
