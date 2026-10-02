import React from 'react';
import { Button } from './ui/button';

export interface PaginationControlsProps {
  nextCursor?: string;
  onNextPage: (cursor: string) => void;
  isLoading?: boolean;
  /**
   * How many pages the list has loaded so far. The end-of-list line only
   * appears once this is above one: under a list that fitted on its first
   * page, "No more items to load" reads as an apology for pagination that
   * never happened. Omitted, it is treated as one page.
   */
  pagesLoaded?: number;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  nextCursor,
  onNextPage,
  isLoading,
  pagesLoaded = 1,
}) => {
  if (!nextCursor) {
    if (pagesLoaded <= 1) return null;
    return (
      <div className="flex justify-center p-4 text-sm text-muted-foreground">
        No more items to load
      </div>
    );
  }

  return (
    <div className="flex justify-center p-4">
      <Button variant="outline" onClick={() => onNextPage(nextCursor)} disabled={isLoading}>
        {isLoading ? 'Loading…' : 'Load More'}
      </Button>
    </div>
  );
};
