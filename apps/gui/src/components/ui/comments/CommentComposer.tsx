import React, { useState } from 'react';
import { useComments } from './CommentContext';
import { Button } from '../button';
import { LazyRichMarkdownEditor } from '../LazyRichMarkdownEditor';

export function CommentComposer() {
  const { state, actions } = useComments();
  const [newComment, setNewComment] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await actions.addComment(newComment);
      setNewComment("");
    } catch {
      // Already surfaced via state.isError/state.error from the mutation
      // itself - this catch only prevents an unhandled promise rejection.
    }
  };

  return (
    <div className="pt-4 border-t border-border mt-4">
      {state.isError && (
        <p className="text-sm text-destructive mb-3">Failed to post comment: {state.error?.message}</p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
        {/* M23's named follow-up: comments were the second surface the rich
            editor was always meant to reach once the task-description pilot
            proved out. The value is still a plain markdown string on the way
            in and out, so `addComment` is unchanged. */}
        <LazyRichMarkdownEditor
          value={newComment}
          onChange={setNewComment}
          placeholder="Add your comment…"
          readOnly={state.isLoading}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={state.isLoading || !newComment.trim()}>
            {state.isLoading ? 'Posting...' : 'Post Comment'}
          </Button>
        </div>
      </form>
    </div>
  );
}
