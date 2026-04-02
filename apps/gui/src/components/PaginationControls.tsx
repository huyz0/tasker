import React from 'react';

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

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
      <div className="flex justify-center p-4 text-sm text-gray-500">
        No more items to load
      </div>
    );
  }

  return (
    <div className="flex justify-center p-4">
      <button 
        onClick={() => onNextPage(nextCursor)}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Loading..." : "Load More"}
      </button>
    </div>
  );
};
