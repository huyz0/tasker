import { TONE_CLASSES } from '../../components/ui/statusStyles';
import { priorityLabel, priorityTone } from './priority';

interface PriorityBadgeProps {
  priority: number;
}

/** A task's priority as a pill. Nothing at all for "no priority" - the common case says nothing. */
export function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (!priority) return null;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLASSES[priorityTone(priority)]}`}>
      {priorityLabel(priority)}
    </span>
  );
}

interface BlockedBadgeProps {
  count: number;
}

/** How many unfinished tasks block this one (M35). Nothing when none do. */
export function BlockedBadge({ count }: BlockedBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLASSES.warning}`}
      title={`Waiting on ${count} unfinished task${count === 1 ? '' : 's'}`}
    >
      Blocked{count > 1 ? ` · ${count}` : ''}
    </span>
  );
}

interface NeedsInputBadgeProps {
  count: number;
}

/** An agent on this task is waiting for a person's answer (M38). Nothing when none is. */
export function NeedsInputBadge({ count }: NeedsInputBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLASSES.info}`}
      title={`${count} open question${count === 1 ? '' : 's'} from an agent`}
    >
      Needs input{count > 1 ? ` · ${count}` : ''}
    </span>
  );
}

interface AwaitingApprovalBadgeProps {
  /** Pending approvals on the task (M39). Nothing renders at zero. */
  count: number;
}

/** An agent asked to move this task across a gated transition; a person must decide. */
export function AwaitingApprovalBadge({ count }: AwaitingApprovalBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLASSES.warning}`}
      title={`${count} status change${count === 1 ? '' : 's'} waiting for approval`}
    >
      Awaiting approval{count > 1 ? ` · ${count}` : ''}
    </span>
  );
}
