import type { StatusTone } from '../../components/ui/statusStyles';

/**
 * Task priority (M35, ADR-0028): 0 none, 1 urgent .. 4 low - lower is more
 * important, and "none" sorts after "low". The wire carries the number; these
 * are the words and tones the screens use for it.
 */
export const PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 0, label: 'No priority' },
];

export function priorityLabel(priority: number): string {
  return PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? `Priority ${priority}`;
}

export function priorityTone(priority: number): StatusTone {
  switch (priority) {
    case 1: return 'destructive';
    case 2: return 'warning';
    case 3: return 'info';
    default: return 'neutral';
  }
}
