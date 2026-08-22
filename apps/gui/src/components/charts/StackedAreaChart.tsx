import {
  ChartAxes,
  ChartLegend,
  ChartShell,
  PLOT,
  PLOT_H,
  PLOT_W,
  VIEW_H,
  VIEW_W,
  useChartReadout,
} from './ChartShell';
import { areaPath, chartColor, datePositions, linearScale, niceTicks, stackSeries } from './scale';

export interface StackedAreaBand {
  label: string;
  /** Past 6 the palette cycles (ADR-0021) — labels carry the identity. */
  colorToken: number;
  /** One point per day, every band aligned — the backend guarantees both. */
  points: { date: string; value: number }[];
}

/**
 * Stacked area chart — the CFD form (ADR-0021). Bands arrive already ordered,
 * first at the bottom of the stack. The sr-only table (with a Total column)
 * is the accessible and testable contract; the SVG is decoration over it.
 */
export function StackedAreaChart({
  bands,
  title,
  description,
  yFormat = String,
  footnote,
}: {
  bands: StackedAreaBand[];
  title: string;
  description: string;
  /** Renders a value for the y axis, the readout and the sr-only table. */
  yFormat?: (value: number) => string;
  /** Visible, muted — e.g. "History collected since …". */
  footnote?: string;
}) {
  const dates = bands[0]?.points.map((point) => point.date) ?? [];
  const { active, imgProps } = useChartReadout(dates.length);
  const columns = ['Date', ...bands.map((band) => band.label), 'Total'];

  if (dates.length === 0) {
    return (
      <ChartShell title={title} description={description} columns={columns} rows={[]} footnote={footnote}>
        <p className="p-6 text-center text-sm text-muted-foreground">No data for this period yet.</p>
      </ChartShell>
    );
  }

  const counts = bands.map((band) => band.points.map((point) => point.value));
  const totals = dates.map((_, j) => counts.reduce((sum, c) => sum + c[j], 0));
  const stack = stackSeries(counts.map((c) => ({ counts: c })));

  const xs = datePositions(dates, PLOT_W);
  // An all-zero history still deserves an axis; [0, 1] keeps the scale finite.
  const yMax = Math.max(...totals) > 0 ? Math.max(...totals) : 1;
  const yScale = linearScale([0, yMax], [PLOT_H, 0]);

  const rows = dates.map((date, j) => [
    date,
    ...bands.map((_, i) => yFormat(counts[i][j])),
    yFormat(totals[j]),
  ]);
  const readout =
    active === null
      ? ''
      : `${dates[active]} · ${bands
          .map((band, i) => `${band.label} ${yFormat(counts[i][active])}`)
          .join(', ')} · total ${yFormat(totals[active])}`;

  return (
    <ChartShell
      title={title}
      description={description}
      columns={columns}
      rows={rows}
      footnote={footnote}
      readout={readout}
      legend={<ChartLegend items={bands.map(({ label, colorToken }) => ({ label, colorToken }))} />}
      imgProps={imgProps}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full min-w-[32rem] aspect-[640/260]" aria-hidden="true">
        <g transform={`translate(${PLOT.left} ${PLOT.top})`}>
          <ChartAxes xs={xs} dates={dates} yTicks={niceTicks(0, yMax, 4)} yScale={yScale} yFormat={yFormat} />
          {bands.map((band, i) => {
            // A single day has no span to sweep; a narrow bar is the honest mark.
            if (dates.length === 1) {
              const top = yScale(stack.upper[i][0]);
              return (
                <rect
                  key={band.label}
                  x={xs[0] - 8}
                  width={16}
                  y={top}
                  height={yScale(stack.lower[i][0]) - top}
                  fill={chartColor(band.colorToken)}
                />
              );
            }
            const lower = xs.map((x, j) => ({ x, y: yScale(stack.lower[i][j]) }));
            const upper = xs.map((x, j) => ({ x, y: yScale(stack.upper[i][j]) }));
            return <path key={band.label} d={areaPath(lower, upper)} fill={chartColor(band.colorToken)} />;
          })}
          {active !== null && (
            <line
              x1={xs[active]}
              x2={xs[active]}
              y1={0}
              y2={PLOT_H}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}
        </g>
      </svg>
    </ChartShell>
  );
}
