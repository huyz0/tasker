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
import { chartColor, datePositions, linearScale, linePath, niceTicks } from './scale';

type ChartColorToken = 1 | 2 | 3 | 4 | 5 | 6;

export interface LineChartSeries {
  label: string;
  colorToken: ChartColorToken;
  /** One point per day, every series aligned — the backend guarantees both. */
  points: { date: string; value: number }[];
}

/**
 * Multi-series line chart (ADR-0021). The sr-only table in the shell is the
 * accessible and testable contract; the SVG is decoration over it.
 */
export function LineChart({
  series,
  title,
  description,
  yFormat = String,
  footnote,
}: {
  series: LineChartSeries[];
  title: string;
  description: string;
  /** Renders a value for the y axis, the readout and the sr-only table. */
  yFormat?: (value: number) => string;
  /** Visible, muted — e.g. "History collected since …". */
  footnote?: string;
}) {
  const dates = series[0]?.points.map((point) => point.date) ?? [];
  const { active, imgProps } = useChartReadout(dates.length);
  const columns = ['Date', ...series.map((s) => s.label)];

  if (dates.length === 0) {
    return (
      <ChartShell title={title} description={description} columns={columns} rows={[]} footnote={footnote}>
        <p className="p-6 text-center text-sm text-muted-foreground">No data for this period yet.</p>
      </ChartShell>
    );
  }

  const xs = datePositions(dates, PLOT_W);
  const maxValue = Math.max(...series.flatMap((s) => s.points.map((point) => point.value)));
  // An all-zero week still deserves an axis; [0, 1] keeps the scale finite.
  const yMax = maxValue > 0 ? maxValue : 1;
  const yScale = linearScale([0, yMax], [PLOT_H, 0]);

  const rows = dates.map((date, i) => [date, ...series.map((s) => yFormat(s.points[i].value))]);
  const readout =
    active === null
      ? ''
      : `${dates[active]} · ${series
          .map((s) => `${s.label} ${yFormat(s.points[active].value)}`)
          .join(', ')}`;

  return (
    <ChartShell
      title={title}
      description={description}
      columns={columns}
      rows={rows}
      footnote={footnote}
      readout={readout}
      legend={<ChartLegend items={series.map(({ label, colorToken }) => ({ label, colorToken }))} />}
      imgProps={imgProps}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full min-w-[32rem] aspect-[640/260]" aria-hidden="true">
        <g transform={`translate(${PLOT.left} ${PLOT.top})`}>
          <ChartAxes xs={xs} dates={dates} yTicks={niceTicks(0, yMax, 4)} yScale={yScale} yFormat={yFormat} />
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
          {series.map((s) => {
            const points = s.points.map((point, i) => ({ x: xs[i], y: yScale(point.value) }));
            // A single day has no segment to draw; a dot is the honest mark.
            return points.length === 1 ? (
              <circle key={s.label} cx={points[0].x} cy={points[0].y} r={4} fill={chartColor(s.colorToken)} />
            ) : (
              <path
                key={s.label}
                d={linePath(points)}
                fill="none"
                stroke={chartColor(s.colorToken)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
        </g>
      </svg>
    </ChartShell>
  );
}
