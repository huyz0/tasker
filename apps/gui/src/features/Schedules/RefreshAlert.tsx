import { TONE_CLASSES } from '../../components/ui/statusStyles';

interface ScheduleRefreshAlertProps {
  onRetry: () => void;
}

export function ScheduleRefreshAlert({ onRetry }: ScheduleRefreshAlertProps) {
  return (
    <p className={`rounded-md p-3 type-body ${TONE_CLASSES.destructive}`} role="alert">
      Could not refresh this schedule. Your draft is kept.{' '}
      <button type="button" onClick={onRetry} className="type-label text-primary underline">Try again</button>
    </p>
  );
}
