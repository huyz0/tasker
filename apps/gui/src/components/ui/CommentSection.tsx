import React, { useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
// Assuming Button is available in the UI library
import { Button } from "./button"; 

interface CommentData {
  id: string;
  author: string;
  content: string;
  isAgent?: boolean;
  createdAt: string;
}

interface CommentSectionProps {
  comments: CommentData[];
  onAddComment: (content: string) => Promise<void>;
  isLoading?: boolean;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ comments, onAddComment, isLoading }) => {
  const [newComment, setNewComment] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    await onAddComment(newComment);
    setNewComment("");
  };

  return (
    <div className="flex flex-col space-y-6">
      <h3 className="text-lg font-semibold tracking-tight">Comments</h3>
      
      <div className="flex flex-col space-y-4">
        {comments.map((c) => (
          <div 
            key={c.id} 
            className={`p-4 rounded-lg flex flex-col space-y-2 ${c.isAgent ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50 border border-border'}`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className={`font-semibold ${c.isAgent ? 'text-primary' : 'text-foreground'}`}>
                {c.isAgent ? '🤖 ' : ''}{c.author}
              </span>
              <span className="text-muted-foreground text-xs">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </div>
            {/* Render the comment content strictly securely using MarkdownRenderer */}
            <MarkdownRenderer content={c.content} />
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Start the conversation!</p>
        )}
      </div>

      <div className="pt-4 border-t border-border">
        <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Add your comment... (Markdown supported)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={isLoading}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading || !newComment.trim()}>
              {isLoading ? 'Posting...' : 'Post Comment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
