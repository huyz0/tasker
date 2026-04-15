import { useComments } from './CommentContext';
import { CommentItem } from './CommentItem';

export function CommentList({ emptyMessage = "No comments yet. Start the conversation!" }: { emptyMessage?: string }) {
  const { state } = useComments();

  return (
    <div className="flex flex-col space-y-4">
      {state.comments.map((c) => (
        <CommentItem key={c.id} comment={c} />
      ))}
      {state.comments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
      )}
    </div>
  );
}
