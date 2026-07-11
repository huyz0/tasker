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
  content: string;
  createdAt: string;
}

export interface CommentState {
  comments: CommentData[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface CommentActions {
  addComment: (content: string) => Promise<void>;
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
      const resp = await commentClient.listComments({ entityId, entityType });
      return resp.comments;
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const resp = await commentClient.createComment({ entityId, entityType, content, userId: '', agentId: '' });
      return resp.comment;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const value = useMemo<CommentContextValue>(() => ({
    state: {
      comments: data ?? [],
      isLoading: isLoadingList || addCommentMutation.isPending,
      isError: addCommentMutation.isError,
      error: addCommentMutation.error as Error | null,
    },
    actions: {
      addComment: async (content: string) => {
        await addCommentMutation.mutateAsync(content);
      },
    },
  }), [data, isLoadingList, addCommentMutation]);

  return (
    <CommentContext.Provider value={value}>
      {children}
    </CommentContext.Provider>
  );
}
