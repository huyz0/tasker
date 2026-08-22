import { useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { chartColor, nearestIndex, tickIndices } from './scale';

/**
 * The shared wrapper carrying the chart kit's whole a11y and testing contract
 * (ADR-0021): a `role="img"` element named by the title, an sr-only data table
 * as the queryable truth for tests and screen readers, a polite readout line,
 * and a deliberate horizontal scroller so the 375px gate sees a scroll
 * container rather than an overflow.
 */

/** One fixed viewBox for every chart: explicit, so jsdom renders it fully. */
export const VIEW_W = 640;
export const VIEW_H = 260;
export const PLOT = { top: 12, right: 12, bottom: 28, left: 44 } as const;
export const PLOT_W = VIEW_W - PLOT.left - PLOT.right;
export const PLOT_H = VIEW_H - PLOT.top - PLOT.bottom;

export function ChartShell({
  title,
  description,
  columns,
  rows,
  children,
  footnote,
  readout,
  legend,
  imgProps,
}: {
  /** The accessible name of the chart. */
  title: string;
  /** One sentence for the sr-only region, read before the data table. */
  description: string;
  /** Headers of the sr-only data table — THE queryable truth. */
  columns: string[];
  rows: (string | number)[][];
  /** The SVG (or the honest empty message). */
  children: ReactNode;
  /** Visible, muted — e.g. "History collected since …". */
  footnote?: string;
  /** Single-line hover/focus readout, announced politely. */
  readout?: ReactNode;
  /** The visible legend — the owning chart passes a `ChartLegend`. */
  legend?: ReactNode;
  /**
   * Interaction handlers owned by the chart component (`useChartReadout`),
   * spread onto the `role="img"` element so the focusable, keyboard-operable
   * element is the same one tests and screen readers find by accessible name.
   */
  imgProps?: HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto scrollbar-thin">
        <div role="img" aria-label={title} {...imgProps}>
          {children}
        </div>
      </div>
      {legend}
      {readout !== undefined && (
        <output aria-live="polite" className="block min-h-4 truncate text-xs text-muted-foreground">
          {readout}
        </output>
      )}
      {footnote !== undefined && <p className="text-xs text-muted-foreground">{footnote}</p>}
      <div className="sr-only">
        <p>{description}</p>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * Swatch + text label pairs — never colour alone (WCAG 1.4.1; the swatch is
 * decorative, the label carries the identity in `foreground` ink).
 */
export function ChartLegend({ items }: { items: { label: string; colorToken: number }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: chartColor(item.colorToken) }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The kit's whole interaction surface, per the ADR's ratchet: hover and
 * arrow-key readout of the nearest date, nothing more. Zoom, brushing or
 * animation reopens ADR-0021.
 */
export function useChartReadout(count: number): {
  /** The date index being read out, or null before any interaction. */
  active: number | null;
  imgProps: HTMLAttributes<HTMLDivElement>;
} {
  const [active, setActive] = useState<number | null>(null);
  const last = count - 1;

  const onFocus = () => setActive((current) => current ?? last);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = active ?? last;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = Math.min(current + 1, last);
    else if (event.key === 'ArrowLeft') next = Math.max(current - 1, 0);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  };
  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // jsdom (and an unpainted layout) report 0×0; there is no position to map.
    if (rect.width <= 0) return;
    const relX = ((event.clientX - rect.left) * VIEW_W) / rect.width - PLOT.left;
    setActive(nearestIndex(relX, PLOT_W, count));
  };

  return { active, imgProps: { tabIndex: 0, onFocus, onKeyDown, onMouseMove } };
}

/**
 * Grid lines, y tick labels and the sparse date axis — identical chrome for
 * both chart forms, in muted tokens so the data ink stays dominant.
 */
export function ChartAxes({
  xs,
  dates,
  yTicks,
  yScale,
  yFormat,
}: {
  xs: number[];
  dates: string[];
  yTicks: number[];
  yScale: (value: number) => number;
  yFormat: (value: number) => string;
}) {
  const anchor = (i: number): 'start' | 'middle' | 'end' => {
    if (dates.length === 1) return 'middle';
    if (i === 0) return 'start';
    return i === dates.length - 1 ? 'end' : 'middle';
  };
  return (
    <g>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={0}
            x2={PLOT_W}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
          <text
            x={-8}
            y={yScale(tick)}
            dy="0.32em"
            textAnchor="end"
            fontSize={10}
            fill="var(--color-muted-foreground)"
          >
            {yFormat(tick)}
          </text>
        </g>
      ))}
      <line x1={0} x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} stroke="var(--color-border)" strokeWidth={1} />
      {tickIndices(dates.length).map((i) => (
        <text
          key={dates[i]}
          x={xs[i]}
          y={PLOT_H + 16}
          textAnchor={anchor(i)}
          fontSize={10}
          fill="var(--color-muted-foreground)"
        >
          {dates[i].slice(5)}
        </text>
      ))}
    </g>
  );
}
