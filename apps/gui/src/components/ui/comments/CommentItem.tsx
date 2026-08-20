import { useState } from 'react';
import type { CommentData } from './CommentContext';
import { useComments } from './CommentContext';
import { useAuthSession } from '../../../hooks/useAuthSession';
import { LazyRichMarkdownEditor } from '../LazyRichMarkdownEditor';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Bot } from 'lucide-react';
import { useConfirm } from '../ConfirmDialog';

export function CommentItem({ comment }: { comment: CommentData }) {
  const { confirm, confirmDialog } = useConfirm();
  const { actions } = useComments();
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
          <span className="text-muted-foreground text-xs">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
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
                    actions.deleteComment(comment.id);
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
              actions.editComment(comment.id, editContent.trim()).then(() => setIsEditing(false));
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
          <div className="flex gap-2 self-end">
            <button type="submit" disabled={!editContent.trim()} className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium">Save</button>
            <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium">Cancel</button>
          </div>
        </form>
      ) : (
        <MarkdownRenderer content={comment.content} />
      )}
      {confirmDialog}
    </div>
  );
}
