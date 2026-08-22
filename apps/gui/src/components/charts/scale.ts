/**
 * Pure geometry for the hand-rolled chart kit (ADR-0021).
 *
 * Everything here is arithmetic on plain data — no DOM, no React — so the
 * degenerate cases the ADR makes ours to own (empty series, a single point,
 * all-zero values) are exhaustively unit-testable in isolation, which is how
 * the 95% coverage gate stays a formality rather than a fight.
 */

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * A linear mapping from a data domain onto a pixel range. A zero-span domain
 * (every value identical) maps everything to the midpoint of the range: the
 * chart still needs somewhere to draw the line, and the middle is the honest
 * placement — neither pinned to the floor nor the ceiling.
 */
export function linearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * "Nice" tick values inside [min, max]: steps snap to 1, 2 or 5 times a power
 * of ten. A single-value domain yields that one value; an unusable domain
 * (reversed, non-finite, or no ticks wanted) yields none.
 */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || targetCount <= 0 || max < min) return [];
  if (min === max) return [min];
  const raw = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = magnitude * (normalized >= 7 ? 10 : normalized >= 3 ? 5 : normalized >= 1.5 ? 2 : 1);
  const ticks: number[] = [];
  for (let i = Math.ceil(min / step); i <= Math.floor(max / step); i += 1) {
    // i * step accumulates IEEE754 crumbs (3 * 0.2 = 0.6000000000000001);
    // 12 significant digits is far beyond any real tick and clips the noise.
    ticks.push(Number((i * step).toPrecision(12)));
  }
  return ticks;
}

/**
 * Evenly spaced x positions for a daily date axis — the backend guarantees one
 * point per day, so position is a function of index alone. A single date sits
 * in the middle rather than pinned to the left edge.
 */
export function datePositions(dates: string[], width: number): number[] {
  if (dates.length === 1) return [width / 2];
  return dates.map((_, i) => (i * width) / Math.max(dates.length - 1, 1));
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/** An SVG path through the points. Empty input yields ''; one point, a bare move. */
export function linePath(points: ChartPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
}

/**
 * A closed SVG region between two edges: the upper edge walked forward, the
 * lower edge walked back, then closed. Empty on either edge yields ''.
 */
export function areaPath(lower: ChartPoint[], upper: ChartPoint[]): string {
  if (lower.length === 0 || upper.length === 0) return '';
  const forward = upper.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`);
  const back = [...lower].reverse().map((p) => `L ${fmt(p.x)} ${fmt(p.y)}`);
  return [...forward, ...back, 'Z'].join(' ');
}

/**
 * Cumulative stacking: band i sits on the sum of bands 0..i-1. Returns, per
 * band, the lower and upper edge values at each date index.
 */
export function stackSeries(bands: { counts: number[] }[]): {
  lower: number[][];
  upper: number[][];
} {
  const lower: number[][] = [];
  const upper: number[][] = [];
  let running: number[] = bands[0]?.counts.map(() => 0) ?? [];
  for (const band of bands) {
    lower.push(running);
    running = band.counts.map((c, i) => (running[i] ?? 0) + c);
    upper.push(running);
  }
  return { lower, upper };
}

/**
 * The CSS variable for a series token. Past 6 the palette cycles (ADR-0021):
 * a CFD with more statuses than tokens stays distinguishable by its labels and
 * the sr-only table, which is the accessible contract anyway.
 */
export function chartColor(token: number): string {
  return `var(--color-chart-${((token - 1) % 6) + 1})`;
}

/**
 * Which date indices get an x-axis label: always the first and last, with at
 * most `target` in total, evenly spread. Fewer points than slots label
 * every point.
 */
export function tickIndices(count: number, target = 4): number[] {
  if (count <= 0) return [];
  if (count <= target) return Array.from({ length: count }, (_, i) => i);
  const picked = new Set<number>();
  for (let i = 0; i < target; i += 1) {
    picked.add(Math.round((i * (count - 1)) / (target - 1)));
  }
  return [...picked].sort((a, b) => a - b);
}

/**
 * The date index nearest a pointer x position inside the plot, clamped to the
 * series — the inverse of `datePositions`. -1 when there is nothing to find.
 */
export function nearestIndex(relX: number, width: number, count: number): number {
  if (count <= 0) return -1;
  if (width <= 0 || count === 1) return 0;
  const i = Math.round((relX / width) * (count - 1));
  return Math.min(Math.max(i, 0), count - 1);
}
