import React, { useState } from 'react';
import { useComments } from './CommentContext';
import { Button } from '../button';

export function CommentComposer() {
  const { state, actions } = useComments();
  const [newComment, setNewComment] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    await actions.addComment(newComment);
    setNewComment("");
  };

  return (
    <div className="pt-4 border-t border-border mt-4">
      <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Add your comment... (Markdown supported)"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          disabled={state.isLoading}
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
