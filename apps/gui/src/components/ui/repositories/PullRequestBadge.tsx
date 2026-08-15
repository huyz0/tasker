import { GitPullRequest, GitPullRequestClosed, CircleDot, AlertCircle } from 'lucide-react';


interface PullRequestBadgeProps {
  pr: {
    remotePrId: string;
    title: string;
    status: string;
    url: string;
  };
}

export function PullRequestBadge({ pr }: PullRequestBadgeProps) {
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'merged':
        return <GitPullRequest className="w-4 h-4 text-info" aria-label="merged" />;
      case 'closed':
        // Was a CircleCheck — a tick — for a pull request that was closed
        // without merging. The colour said "bad" and the shape said "done",
        // which is the failure mode the "never by colour alone" rule exists to
        // prevent: a reader who cannot see the red reads a success (M06-T01).
        return <GitPullRequestClosed className="w-4 h-4 text-destructive" aria-label="closed" />;
      case 'open':
        return <CircleDot className="w-4 h-4 text-success" aria-label="open" />;
      default:
         return <AlertCircle className="w-4 h-4 text-neutral" aria-label={status} />;
    }
  };

  return (
    <a 
      href={pr.url} 
      target="_blank" 
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full hover:bg-muted/50 transition-colors bg-background text-foreground"
      title={pr.title}
    >
      {getStatusIcon(pr.status)}
      <span className="truncate max-w-[120px]">{pr.remotePrId}</span>
    </a>
  );
}
