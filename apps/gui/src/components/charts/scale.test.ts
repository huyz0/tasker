import { describe, it, expect } from 'vitest';
import {
  linearScale,
  niceTicks,
  datePositions,
  linePath,
  areaPath,
  stackSeries,
  chartColor,
  tickIndices,
  nearestIndex,
} from './scale';

describe('linearScale', () => {
  it('maps the domain ends onto the range ends', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(0)).toBe(0);
    expect(s(10)).toBe(100);
  });

  it('interpolates linearly between the ends', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(2.5)).toBe(25);
    expect(s(5)).toBe(50);
  });

  it('supports an inverted range, which is how SVG y works', () => {
    const s = linearScale([0, 10], [200, 0]);
    expect(s(0)).toBe(200);
    expect(s(10)).toBe(0);
    expect(s(5)).toBe(100);
  });

  it('extrapolates outside the domain rather than clamping', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(20)).toBe(200);
    expect(s(-10)).toBe(-100);
  });

  it('maps a zero-span domain to the midpoint of the range', () => {
    // A chart whose every value is identical still needs *somewhere* to draw
    // the line; the vertical middle is the honest placement.
    const s = linearScale([5, 5], [0, 100]);
    expect(s(5)).toBe(50);
    expect(s(0)).toBe(50);
    expect(s(999)).toBe(50);
  });

  it('handles a negative domain', () => {
    const s = linearScale([-10, 10], [0, 100]);
    expect(s(-10)).toBe(0);
    expect(s(0)).toBe(50);
    expect(s(10)).toBe(100);
  });
});

describe('niceTicks', () => {
  it('produces round steps across a simple domain', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('snaps to 1/2/5 steps rather than awkward fractions', () => {
    expect(niceTicks(0, 7, 4)).toEqual([0, 2, 4, 6]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 45, 4)).toEqual([0, 10, 20, 30, 40]);
    // A cramped axis rounds all the way up to the next power of ten.
    expect(niceTicks(0, 40, 5)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0, 80, 1)).toEqual([0]);
  });

  it('keeps every tick inside the domain', () => {
    for (const t of niceTicks(3, 97, 5)) {
      expect(t).toBeGreaterThanOrEqual(3);
      expect(t).toBeLessThanOrEqual(97);
    }
  });

  it('handles a negative-to-positive domain', () => {
    expect(niceTicks(-10, 10, 4)).toEqual([-10, -5, 0, 5, 10]);
  });

  it('collapses a single-value domain to that one value', () => {
    expect(niceTicks(4, 4, 5)).toEqual([4]);
    expect(niceTicks(0, 0, 5)).toEqual([0]);
  });

  it('returns nothing for an empty or unusable domain', () => {
    expect(niceTicks(10, 0, 5)).toEqual([]);
    expect(niceTicks(NaN, 10, 5)).toEqual([]);
    expect(niceTicks(0, Infinity, 5)).toEqual([]);
    expect(niceTicks(0, 10, 0)).toEqual([]);
  });

  it('avoids floating-point crumbs on fractional steps', () => {
    // 3 * 0.2 is 0.6000000000000001 in IEEE754; a tick label must not show it.
    expect(niceTicks(0, 1, 4)).toContain(0.6);
  });
});

describe('datePositions', () => {
  it('spaces daily dates evenly across the width', () => {
    expect(datePositions(['2026-08-01', '2026-08-02', '2026-08-03'], 200)).toEqual([0, 100, 200]);
  });

  it('spans the full width, first at 0 and last at the width', () => {
    const xs = datePositions(['a', 'b', 'c', 'd', 'e'], 640);
    expect(xs[0]).toBe(0);
    expect(xs[4]).toBe(640);
    expect(xs).toHaveLength(5);
  });

  it('centres a single date', () => {
    expect(datePositions(['2026-08-01'], 200)).toEqual([100]);
  });

  it('returns nothing for no dates', () => {
    expect(datePositions([], 200)).toEqual([]);
  });

  it('collapses to zero positions at zero width', () => {
    expect(datePositions(['a', 'b'], 0)).toEqual([0, 0]);
  });
});

describe('linePath', () => {
  it('is empty for no points', () => {
    expect(linePath([])).toBe('');
  });

  it('is a bare move for a single point', () => {
    expect(linePath([{ x: 10, y: 20 }])).toBe('M 10 20');
  });

  it('joins points with line segments', () => {
    expect(
      linePath([
        { x: 0, y: 100 },
        { x: 50, y: 50 },
        { x: 100, y: 75 },
      ]),
    ).toBe('M 0 100 L 50 50 L 100 75');
  });

  it('rounds coordinates to two decimals', () => {
    expect(linePath([{ x: 1 / 3, y: 2 / 3 }])).toBe('M 0.33 0.67');
  });

  it('handles all-zero values', () => {
    expect(
      linePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M 0 0 L 10 0');
  });
});

describe('areaPath', () => {
  it('is empty when either edge is empty', () => {
    expect(areaPath([], [])).toBe('');
    expect(areaPath([{ x: 0, y: 1 }], [])).toBe('');
    expect(areaPath([], [{ x: 0, y: 1 }])).toBe('');
  });

  it('walks the upper edge forward, the lower edge back, and closes', () => {
    const lower = [
      { x: 0, y: 50 },
      { x: 100, y: 60 },
    ];
    const upper = [
      { x: 0, y: 10 },
      { x: 100, y: 20 },
    ];
    expect(areaPath(lower, upper)).toBe('M 0 10 L 100 20 L 100 60 L 0 50 Z');
  });

  it('closes a single-point band into a vertical sliver', () => {
    expect(areaPath([{ x: 5, y: 40 }], [{ x: 5, y: 10 }])).toBe('M 5 10 L 5 40 Z');
  });
});

describe('stackSeries', () => {
  it('is empty for no bands', () => {
    expect(stackSeries([])).toEqual({ lower: [], upper: [] });
  });

  it('stacks a single band on the zero baseline', () => {
    expect(stackSeries([{ counts: [1, 2, 3] }])).toEqual({
      lower: [[0, 0, 0]],
      upper: [[1, 2, 3]],
    });
  });

  it('accumulates each band on top of the ones below it', () => {
    expect(stackSeries([{ counts: [1, 2] }, { counts: [3, 4] }])).toEqual({
      lower: [
        [0, 0],
        [1, 2],
      ],
      upper: [
        [1, 2],
        [4, 6],
      ],
    });
  });

  it('keeps all-zero bands flat without disturbing the stack', () => {
    expect(stackSeries([{ counts: [0, 0] }, { counts: [2, 2] }, { counts: [0, 0] }])).toEqual({
      lower: [
        [0, 0],
        [0, 0],
        [2, 2],
      ],
      upper: [
        [0, 0],
        [2, 2],
        [2, 2],
      ],
    });
  });

  it('handles bands with no points', () => {
    expect(stackSeries([{ counts: [] }, { counts: [] }])).toEqual({
      lower: [[], []],
      upper: [[], []],
    });
  });

  it('treats a missing count in a ragged band as zero rather than NaN', () => {
    expect(stackSeries([{ counts: [1] }, { counts: [2, 3] }])).toEqual({
      lower: [[0], [1]],
      upper: [[1], [3, 3]],
    });
  });
});

describe('chartColor', () => {
  it('resolves tokens 1 through 6 to their own variables', () => {
    expect(chartColor(1)).toBe('var(--color-chart-1)');
    expect(chartColor(6)).toBe('var(--color-chart-6)');
  });

  it('cycles the palette past 6, as ADR-0021 decides', () => {
    expect(chartColor(7)).toBe('var(--color-chart-1)');
    expect(chartColor(12)).toBe('var(--color-chart-6)');
    expect(chartColor(13)).toBe('var(--color-chart-1)');
  });
});

describe('tickIndices', () => {
  it('is empty for no points', () => {
    expect(tickIndices(0)).toEqual([]);
  });

  it('keeps every index when there are few points', () => {
    expect(tickIndices(1)).toEqual([0]);
    expect(tickIndices(3)).toEqual([0, 1, 2]);
    expect(tickIndices(4)).toEqual([0, 1, 2, 3]);
  });

  it('always includes the first and last, with a few between', () => {
    expect(tickIndices(14)).toEqual([0, 4, 9, 13]);
    expect(tickIndices(31)).toEqual([0, 10, 20, 30]);
  });

  it('never repeats an index', () => {
    const ticks = tickIndices(5);
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});

describe('nearestIndex', () => {
  it('finds nothing in an empty series', () => {
    expect(nearestIndex(50, 100, 0)).toBe(-1);
  });

  it('snaps to the closest point', () => {
    // 3 points across 100: positions 0, 50, 100.
    expect(nearestIndex(0, 100, 3)).toBe(0);
    expect(nearestIndex(30, 100, 3)).toBe(1);
    expect(nearestIndex(80, 100, 3)).toBe(2);
  });

  it('clamps positions outside the plot', () => {
    expect(nearestIndex(-20, 100, 3)).toBe(0);
    expect(nearestIndex(140, 100, 3)).toBe(2);
  });

  it('is safe at zero width and with a single point', () => {
    expect(nearestIndex(50, 0, 3)).toBe(0);
    expect(nearestIndex(50, 100, 1)).toBe(0);
  });
});
