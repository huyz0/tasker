import React from 'react';

export interface BuildBadgeProps {
  status: 'PENDING' | 'SUCCESS' | 'FAILURE';
  commitSha: string;
}

export const BuildBadge: React.FC<BuildBadgeProps> = ({ status, commitSha }) => {
  const shortSha = commitSha.substring(0, 7);
  let colorClass = 'bg-muted text-muted-foreground';
  if (status === 'SUCCESS') colorClass = 'bg-success-subtle text-success-subtle-foreground';
  if (status === 'FAILURE') colorClass = 'bg-destructive-subtle text-destructive-subtle-foreground';

  return (
    <span data-testid="build-badge" className={`px-2 py-1 rounded text-xs font-mono ${colorClass}`}>
      {shortSha} - {status}
    </span>
  );
};
