import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { ReportService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

// Module-level clients, like every other screen (see Handoffs, Dashboard).
export const reportClient = createClient(ReportService, transport);

// The stalled-work card's Unassign action goes through the same existing
// `unassignTask` RPC the task view uses — reports add no write surface of
// their own, they only put the release where the stalled queue is visible.
export const reportTaskClient = createClient(TaskService, transport);

/** The selectable report windows, in days. T09's trend query shares them. */
export const REPORT_WINDOWS = [7, 30, 90] as const;

/**
 * "5h ago" / "3d ago" — compact relative time for exception rows.
 *
 * Deliberately not `lib/sinceLabel.ts`: that one answers "is this agent still
 * alive" (with a silence verdict and "never called"); this one stamps a plain
 * age on an event that definitely happened.
 */
export function agoLabel(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return 'under an hour ago';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
