import type { CommentData } from './CommentContext';
import { MarkdownRenderer } from '../MarkdownRenderer';

export function CommentItem({ comment }: { comment: CommentData }) {
  const isAgent = Boolean(comment.agentId);
  const author = isAgent ? `Agent ${comment.agentId}` : comment.userId ? `User ${comment.userId}` : 'Unknown';

  return (
    <div
      className={`p-4 rounded-lg flex flex-col space-y-2 ${isAgent ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50 border border-border'}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${isAgent ? 'text-primary' : 'text-foreground'}`}>
          {isAgent ? '🤖 ' : ''}{author}
        </span>
        <span className="text-muted-foreground text-xs">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <MarkdownRenderer content={comment.content} />
    </div>
  );
}
