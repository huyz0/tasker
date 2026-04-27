import React from 'react';

export interface BuildBadgeProps {
  status: 'PENDING' | 'SUCCESS' | 'FAILURE';
  commitSha: string;
}

export const BuildBadge: React.FC<BuildBadgeProps> = ({ status, commitSha }) => {
  const shortSha = commitSha.substring(0, 7);
  let colorClass = 'bg-gray-200 text-gray-800';
  if (status === 'SUCCESS') colorClass = 'bg-green-100 text-green-800';
  if (status === 'FAILURE') colorClass = 'bg-red-100 text-red-800';

  return (
    <span data-testid="build-badge" className={`px-2 py-1 rounded text-xs font-mono ${colorClass}`}>
      {shortSha} - {status}
    </span>
  );
};
