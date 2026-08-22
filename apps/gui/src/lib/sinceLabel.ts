/** Beyond this an agent has stopped rather than paused. */
const SILENT_AFTER_HOURS = 24;

/**
 * "9 days ago", or "never" — the distinction the fleet panels exist to draw.
 *
 * Lived as an identical private copy in `pages/Dashboard.tsx` and
 * `features/Agents/index.tsx`; the Reports screen (M24-T08) would have been
 * the third copy, which is the extraction trigger. One definition here, so
 * "when did this agent last call in" reads the same everywhere it appears.
 */
export function sinceLabel(iso?: string): { text: string; silent: boolean } {
  if (!iso) return { text: 'never called', silent: true };
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  const silent = hours > SILENT_AFTER_HOURS;
  if (hours < 1) return { text: 'active in the last hour', silent };
  if (hours < 24) return { text: `${Math.floor(hours)}h ago`, silent };
  return { text: `${Math.floor(hours / 24)}d ago`, silent };
}
