/**
 * The documented status scale, in one place.
 *
 * Three components rendered the same three build states in three different
 * ways before M06-T01: `BuildBadge` used the subtle token pairs,
 * `RepositoryIntegrationConfig` used `bg-success/10 text-success`, and
 * `PullRequestBadge` used a bare icon colour. Two of those are not the scale —
 * an alpha tint is a fourth colour the contrast gate cannot check, because it
 * reads token pairs and not arbitrary utilities.
 *
 * Mapping a state to a tone here rather than in each component is what makes
 * them agree: a component chooses *what state this is*, never *what colour that
 * is*.
 */
export type StatusTone = 'success' | 'warning' | 'info' | 'neutral' | 'destructive';

/**
 * Written out in full rather than composed as `bg-${tone}-subtle`: Tailwind
 * scans source text, so a class name assembled at runtime is a class name that
 * never gets generated.
 */
export const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-subtle text-success-subtle-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
  info: 'bg-info-subtle text-info-subtle-foreground',
  neutral: 'bg-neutral-subtle text-neutral-subtle-foreground',
  destructive: 'bg-destructive-subtle text-destructive-subtle-foreground',
};

/** CI build/check states. */
export function buildTone(status: string): StatusTone {
  switch (status.toUpperCase()) {
    case 'SUCCESS': return 'success';
    case 'FAILURE': return 'destructive';
    case 'PENDING': return 'warning';
    // Unknown is a state, not an absence — an unrecognised value from a
    // provider should look deliberately grey, not unstyled.
    default: return 'neutral';
  }
}

/** Pull request states. */
export function pullRequestTone(status: string): StatusTone {
  switch (status.toLowerCase()) {
    case 'open': return 'success';
    case 'merged': return 'info';
    case 'closed': return 'destructive';
    // A draft is not de-emphasised — it is reporting a real state that happens
    // to be uneventful, which is `neutral` and not `muted`.
    case 'draft': return 'neutral';
    default: return 'neutral';
  }
}
