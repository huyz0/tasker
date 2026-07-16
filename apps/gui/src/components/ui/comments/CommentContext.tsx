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

export interface CommentState {
  comments: CommentData[];
  isLoadingComments: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface CommentActions {
  addComment: (content: string) => Promise<void>;
  editComment: (commentId: string, content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
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

  const { data, isLoading: isLoadingList } = useQuery({
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
      const resp = await commentClient.createComment({ entityId, entityType, content, userId: '', agentId: '' });
      return resp.comment;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const editCommentMutation = useMutation({
    mutationFn: async (variables: { commentId: string; content: string }) => {
      const resp = await commentClient.updateComment({ ...variables, userId: '', agentId: '' });
      return resp.comment;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await commentClient.deleteComment({ commentId, userId: '', agentId: '' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const value = useMemo<CommentContextValue>(() => ({
    state: {
      comments: data ?? [],
      isLoadingComments: isLoadingList,
      isLoading: addCommentMutation.isPending,
      isError: addCommentMutation.isError || editCommentMutation.isError || deleteCommentMutation.isError,
      error: (addCommentMutation.error || editCommentMutation.error || deleteCommentMutation.error) as Error | null,
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
    },
  }), [data, isLoadingList, addCommentMutation, editCommentMutation, deleteCommentMutation]);

  return (
    <CommentContext.Provider value={value}>
      {children}
    </CommentContext.Provider>
  );
}
