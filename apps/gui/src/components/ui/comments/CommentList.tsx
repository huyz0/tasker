import { useComments } from './CommentContext';
import { CommentItem } from './CommentItem';
import { ListState } from '../ListState';

export function CommentList({ emptyMessage = "No comments yet. Start the conversation!" }: { emptyMessage?: string }) {
  const { state, actions } = useComments();

  if (state.isLoadingComments) {
    return <p className="text-sm text-muted-foreground text-center py-4">Loading comments…</p>;
  }
  // A thread that failed to load is not an empty one (M32-T04).
  if (state.listError) {
    return <ListState isLoading={false} error={state.listError} isEmpty={false} emptyMessage="" errorLabel="Could not load comments" onRetry={actions.retryLoad} />;
  }

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
