import React from 'react';
import { TONE_CLASSES, buildTone } from './ui/statusStyles';

export interface BuildBadgeProps {
  status: 'PENDING' | 'SUCCESS' | 'FAILURE';
  commitSha: string;
}

export const BuildBadge: React.FC<BuildBadgeProps> = ({ status, commitSha }) => {
  const shortSha = commitSha.substring(0, 7);
  // The tone comes from the shared map, so this badge and the one in
  // RepositoryIntegrationConfig cannot drift apart again — they disagreed until
  // M06-T01, this using the subtle pairs and that using `bg-success/10`.
  const colorClass = TONE_CLASSES[buildTone(status)];

  return (
    <span data-testid="build-badge" className={`px-2 py-1 rounded text-xs font-mono ${colorClass}`}>
      {shortSha} - {status}
    </span>
  );
};
