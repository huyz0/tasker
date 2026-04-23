import { GitPullRequest, CircleCheck, CircleDot, AlertCircle } from 'lucide-react';


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
        return <GitPullRequest className="w-4 h-4 text-purple-500" />;
      case 'closed':
        return <CircleCheck className="w-4 h-4 text-red-500" />;
      case 'open':
        return <CircleDot className="w-4 h-4 text-green-500" />;
      default:
         return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
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
