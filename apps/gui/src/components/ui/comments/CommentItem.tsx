import { useState } from 'react';
import type { CommentData } from './CommentContext';
import { useComments } from './CommentContext';
import { useAuthSession } from '../../../hooks/useAuthSession';
import { LazyRichMarkdownEditor } from '../LazyRichMarkdownEditor';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Bot } from 'lucide-react';
import { useConfirm } from '../ConfirmDialog';
import { formatDateTime } from '../../../lib/format';


export function CommentItem({ comment }: { comment: CommentData }) {
  const { confirm, confirmDialog } = useConfirm();
  const { state, actions } = useComments();
  const editFailed = state.editFailure?.commentId === comment.id ? state.editFailure.error : null;
  const deleteFailed = state.deleteFailure?.commentId === comment.id ? state.deleteFailure.error : null;
  const { userId: currentUserId } = useAuthSession();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const isAgent = Boolean(comment.agentId);
  const author = comment.authorName
    ? comment.authorName
    : isAgent
      ? `Agent ${comment.agentId}`
      : comment.userId
        ? `User ${comment.userId}`
        : 'Unknown';
  const isOwnComment = !isAgent && !!currentUserId && comment.userId === currentUserId;

  return (
    <div
      className={`p-4 rounded-lg flex flex-col space-y-2 ${isAgent ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50 border border-border'}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold flex items-center gap-1.5 ${isAgent ? 'text-primary' : 'text-foreground'}`}>
          {isAgent && <Bot className="w-3.5 h-3.5" />}{author}
        </span>
        <span className="flex items-center gap-2">
          <time dateTime={comment.createdAt} className="text-muted-foreground text-xs tabular-nums">
            {formatDateTime(comment.createdAt)}
          </time>
          {isOwnComment && !isEditing && (
            <>
              <button
                onClick={() => { setIsEditing(true); setEditContent(comment.content); }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  if (await confirm({
                    title: 'Delete this comment?',
                    consequence: 'The comment is removed for everyone who can see this item.',
                    undo: null,
                    confirmLabel: 'Delete',
                  })) {
                    // Reported below via deleteFailure; caught so a refusal is
                    // not also an unhandled rejection.
                    actions.deleteComment(comment.id).catch(() => {});
                  }
                }}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                Delete
              </button>
            </>
          )}
        </span>
      </div>
      {isEditing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editContent.trim()) {
              // On failure the editor stays open with the user's text, and the
              // error shows below it (M32-T04).
              actions.editComment(comment.id, editContent.trim()).then(() => setIsEditing(false), () => {});
            }
          }}
          className="flex flex-col gap-2"
        >
          {/* Same editor the composer uses, so a comment reads back the way
              it was written. Remounted per edit session (isEditing gates it),
              which is what RichMarkdownEditor's mount-once `markdown` prop
              requires. */}
          <LazyRichMarkdownEditor
            value={editContent}
            onChange={setEditContent}
            placeholder="Edit your comment…"
          />
          {editFailed && <p className="text-xs text-destructive">Failed to save this comment: {editFailed.message}</p>}
          <div className="flex gap-2 self-end">
            <button type="submit" disabled={!editContent.trim()} className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary-subtle disabled:text-primary-subtle-foreground rounded-md text-xs font-medium">Save</button>
            <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium">Cancel</button>
          </div>
        </form>
      ) : (
        <MarkdownRenderer content={comment.content} />
      )}
      {deleteFailed && <p className="text-xs text-destructive">Failed to delete this comment: {deleteFailed.message}</p>}
      {confirmDialog}
    </div>
  );
}
