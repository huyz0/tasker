import React, { createContext, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../../lib/connectTransport';
import { CommentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const commentClient = createClient(CommentService, transport);

export interface CommentData {
  id: string;
  userId?: string;
  agentId?: string;
  authorName?: string;
  content: string;
  createdAt: string;
}

/** A failed edit or delete, and the comment it happened to (M32-T04). */
interface CommentFailure {
  commentId: string;
  error: Error;
}

interface CommentState {
  comments: CommentData[];
  isLoadingComments: boolean;
  /** The thread could not be loaded - distinct from an empty one. */
  listError: Error | null;
  /** A post is in flight. */
  isLoading: boolean;
  /** The last post failed. Edits and deletes report separately, on their comment. */
  isError: boolean;
  error: Error | null;
  editFailure: CommentFailure | null;
  deleteFailure: CommentFailure | null;
}

interface CommentActions {
  addComment: (content: string) => Promise<void>;
  editComment: (commentId: string, content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  retryLoad: () => void;
}

export interface CommentContextValue {
  state: CommentState;
  actions: CommentActions;
}

const CommentContext = createContext<CommentContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useComments(): CommentContextValue {
  const context = useContext(CommentContext);
  if (!context) {
    throw new Error('useComments must be used within a CommentProvider');
  }
  return context;
}

interface CommentProviderProps {
  entityId: string;
  entityType: 'task' | 'artifact';
  children: React.ReactNode;
}

export function CommentProvider({ entityId, entityType, children }: CommentProviderProps) {
  const queryClient = useQueryClient();
  const queryKey = ['comments', entityType, entityId];

  const { data, isLoading: isLoadingList, error: listError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      // Every comment must be visible, not just the first page, or the
      // thread silently truncates once it grows past the default page size.
      const allComments: CommentData[] = [];
      let cursor: string | undefined;
      do {
        const resp = await commentClient.listComments({ entityId, entityType, page: cursor ? { cursor } : undefined });
        allComments.push(...resp.comments);
        cursor = resp.page?.nextCursor || undefined;
      } while (cursor);
      return allComments;
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const resp = await commentClient.createComment({ entityId, entityType, content });
      return resp.comment;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const editCommentMutation = useMutation({
    mutationFn: async (variables: { commentId: string; content: string }) => {
      const resp = await commentClient.updateComment(variables);
      return resp.comment;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await commentClient.deleteComment({ commentId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const value = useMemo<CommentContextValue>(() => ({
    // Each operation reports its own failure. They used to be merged, so a
    // failed edit or delete read "Failed to post comment" under the composer.
    state: {
      comments: data ?? [],
      isLoadingComments: isLoadingList,
      listError: (listError as Error | null) ?? null,
      isLoading: addCommentMutation.isPending,
      isError: addCommentMutation.isError,
      error: addCommentMutation.error as Error | null,
      editFailure: editCommentMutation.isError && editCommentMutation.variables
        ? { commentId: editCommentMutation.variables.commentId, error: editCommentMutation.error as Error }
        : null,
      deleteFailure: deleteCommentMutation.isError && deleteCommentMutation.variables
        ? { commentId: deleteCommentMutation.variables, error: deleteCommentMutation.error as Error }
        : null,
    },
    actions: {
      addComment: async (content: string) => {
        await addCommentMutation.mutateAsync(content);
      },
      editComment: async (commentId: string, content: string) => {
        await editCommentMutation.mutateAsync({ commentId, content });
      },
      deleteComment: async (commentId: string) => {
        await deleteCommentMutation.mutateAsync(commentId);
      },
      retryLoad: () => { void refetch(); },
    },
  }), [data, isLoadingList, listError, refetch, addCommentMutation, editCommentMutation, deleteCommentMutation]);

  return (
    <CommentContext.Provider value={value}>
      {children}
    </CommentContext.Provider>
  );
}
