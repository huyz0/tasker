import React, { createContext, useContext, useState, useMemo } from 'react';

export interface CommentData {
  id: string;
  author: string;
  content: string;
  isAgent?: boolean;
  createdAt: string;
}

export interface CommentState {
  comments: CommentData[];
  isLoading: boolean;
}

export interface CommentActions {
  addComment: (content: string) => Promise<void>;
  addAgentComment: (content: string) => void;
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
  initialComments?: CommentData[];
  onAddComment?: (content: string) => Promise<void>;
  children: React.ReactNode;
}

export function CommentProvider({ initialComments = [], onAddComment, children }: CommentProviderProps) {
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [isLoading, setIsLoading] = useState(false);

  // We memoize handlers to avoid unnecessary re-renders in consumers
  const handleAddComment = useMemo(() => async (content: string) => {
    setIsLoading(true);
    try {
      if (onAddComment) {
        await onAddComment(content);
      } else {
        // Fallback simulate network delay if no external handler is provided
        await new Promise((r) => setTimeout(r, 200));
      }
      setComments(prev => [
        ...prev,
        {
          id: `cmt-${Date.now()}`,
          author: 'Human User',
          content,
          createdAt: new Date().toISOString(),
          isAgent: false
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [onAddComment]);

  const handleAddAgentComment = useMemo(() => (content: string) => {
    setComments(prev => [
      ...prev,
      {
        id: `cmt-ai-${Date.now()}`,
        author: 'Agent Alpha',
        content,
        isAgent: true,
        createdAt: new Date().toISOString()
      }
    ]);
  }, []);

  const value = useMemo(() => ({
    state: { comments, isLoading },
    actions: { addComment: handleAddComment, addAgentComment: handleAddAgentComment }
  }), [comments, isLoading, handleAddComment, handleAddAgentComment]);

  return (
    <CommentContext.Provider value={value}>
      {children}
    </CommentContext.Provider>
  );
}
