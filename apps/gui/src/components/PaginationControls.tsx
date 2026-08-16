import React from 'react';

export interface PaginationControlsProps {
  nextCursor?: string;
  onNextPage: (cursor: string) => void;
  isLoading?: boolean;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({ 
  nextCursor, 
  onNextPage, 
  isLoading 
}) => {
  if (!nextCursor) {
    return (
      <div className="flex justify-center p-4 text-sm text-muted-foreground">
        No more items to load
      </div>
    );
  }

  return (
    <div className="flex justify-center p-4">
      <button 
        onClick={() => onNextPage(nextCursor)}
        disabled={isLoading}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
      >
        {isLoading ? "Loading…" : "Load More"}
      </button>
    </div>
  );
};
