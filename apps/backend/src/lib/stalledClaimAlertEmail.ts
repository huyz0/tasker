import { escapeHtml, type RenderedEmail } from './inviteEmail';

/**
 * The stalled-claim digest email's contents (M25-T04, ADR-0022 Decision 2).
 * Mirrors `inviteEmail.ts`'s pure-template convention exactly: a template is
 * a pure function of its input, tested without a mail server anywhere near
 * it, and every interpolated field is escaped in the HTML part because a
 * task title and an agent name are both attacker-influenced in some
 * deployment.
 *
 * One digest per recipient per sweep, not one email per task (Decision 2) -
 * the task list is capped at `DIGEST_TASK_LIMIT` by the caller, with
 * `overflowCount` carrying how many more exist. No accept-link-style secret
 * anywhere: the only thing to click is a plain task URL the caller built.
 */

export interface StalledTaskItem {
  taskDisplayId: string;
  taskTitle: string;
  /** "(deleted agent)" already resolved by the caller when the agent was purged. */
  agentName: string;
  neverStarted: boolean;
  hoursSilent: number;
  taskUrl: string;
}

export interface StalledClaimAlertEmailInput {
  recipientName: string;
  /** Which tier resolved this recipient (ADR-0022 Decision 1) - every email states it. */
  reason: 'reviewer' | 'admin';
  /** Only used in the admin-reason wording. */
  orgName: string;
  tasks: StalledTaskItem[];
  /** 0 when nothing was capped. */
  overflowCount: number;
  appUrl: string;
}

function hoursLabel(hours: number): string {
  const h = Math.max(0, Math.round(hours));
  return `${h} hour${h === 1 ? '' : 's'}`;
}

function taskState(task: StalledTaskItem): string {
  return task.neverStarted ? 'claimed but never started' : 'went quiet after some work';
}

/** The "why you got this" line - reason-specific, singular/plural aware. */
function describeReason(input: StalledClaimAlertEmailInput): string {
  const multiple = input.tasks.length > 1;
  const firstDisplayId = input.tasks[0]?.taskDisplayId ?? '';
  if (input.reason === 'reviewer') {
    return multiple
      ? "You're receiving this because you're a reviewer on the tasks below."
      : `You're receiving this because you review ${firstDisplayId}.`;
  }
  return multiple
    ? `You're receiving this because the tasks below have no reviewer assigned, and you're an owner or admin of ${input.orgName}.`
    : `You're receiving this because ${firstDisplayId} has no reviewer assigned, and you're an owner or admin of ${input.orgName}.`;
}

function describeTaskText(task: StalledTaskItem): string {
  return `- ${task.taskDisplayId} — ${task.taskTitle} (held by ${task.agentName}): ${taskState(task)}, silent for ${hoursLabel(task.hoursSilent)}.\n  ${task.taskUrl}`;
}

function describeTaskHtml(task: StalledTaskItem): string {
  return `<li>
    <strong>${escapeHtml(task.taskDisplayId)}</strong> — ${escapeHtml(task.taskTitle)}
    (held by ${escapeHtml(task.agentName)}): ${escapeHtml(taskState(task))}, silent for ${escapeHtml(hoursLabel(task.hoursSilent))}.
    <br><a href="${escapeHtml(task.taskUrl)}">${escapeHtml(task.taskUrl)}</a>
  </li>`;
}

const ACTION_LINE =
  'Please unassign or reassign these tasks rather than commenting on them - a comment is itself read as new ' +
  'activity, which would clear the stalled condition without anyone actually being back on it.';

export function renderStalledClaimAlertEmail(
  input: StalledClaimAlertEmailInput,
  _now: Date = new Date(),
): RenderedEmail {
  const totalCount = input.tasks.length + input.overflowCount;
  const subject = totalCount === 1
    ? '1 stalled task needs your attention'
    : `${totalCount} stalled tasks need your attention`;

  const reasonLine = describeReason(input);
  const overflowLine = input.overflowCount > 0
    ? `…and ${input.overflowCount} more ${input.overflowCount === 1 ? 'task' : 'tasks'} not shown here.`
    : null;

  const lines = [
    `Hi ${input.recipientName},`,
    '',
    reasonLine,
    '',
    ...input.tasks.map(describeTaskText),
  ];
  if (overflowLine) lines.push('', overflowLine);
  lines.push('', ACTION_LINE, '', input.appUrl);

  const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111;">
    <p>Hi ${escapeHtml(input.recipientName)},</p>
    <p>${escapeHtml(reasonLine)}</p>
    <ul>
      ${input.tasks.map(describeTaskHtml).join('\n      ')}
    </ul>
    ${overflowLine ? `<p>${escapeHtml(overflowLine)}</p>` : ''}
    <p style="color: #666;">${escapeHtml(ACTION_LINE)}</p>
    <p><a href="${escapeHtml(input.appUrl)}">${escapeHtml(input.appUrl)}</a></p>
  </body>
</html>`;

  return { subject, text: lines.join('\n'), html };
}
