import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../lib/connectTransport';
import { ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../store/layout';

const projectClient = createClient(ProjectService, transport);

/**
 * Shown while the name is in flight, and when there is no project at all. A
 * crumb that renders nothing until its label arrives makes the trail grow an
 * item at a time as the screen settles.
 */
const PROJECT_FALLBACK_LABEL = 'Project';

export interface ScopeLabels {
  /** The active project's name, or the generic fallback above. */
  projectName: string;
  /** Whether there is an active project for that name to describe. */
  hasProject: boolean;
}

/**
 * The human-readable names a breadcrumb trail needs, resolved from the ids
 * that scope is actually made of (M28-T07).
 *
 * `Tasks` ran exactly this query inline for its own crumb; Memory needs it
 * too, so it lives here once rather than twice. The query key is the same
 * `['project', id]` `Tasks` used, so two trails on one screen share a cache
 * entry rather than issuing two requests.
 *
 * **No organization name, deliberately.** There is no `getOrg`-by-id RPC in
 * the contract — only `getProject` — so an organization's name is not
 * resolvable from an id anywhere in the GUI. The switcher shows one only
 * because it happens to sync a label out of whatever `listOrgs` page it
 * loaded, which a deep link into a detail view has not loaded. Rather than
 * put an id (or a stale label) in a trail, no trail carries an organization
 * crumb. Adding `getOrg` is a contract change and belongs to its own
 * milestone.
 */
export function useScopeLabels(): ScopeLabels {
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);

  // `getProject` is the right call when all you hold is an id — the
  // alternative is listing every project to find one.
  const { data } = useQuery({
    queryKey: ['project', activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => (await projectClient.getProject({ id: activeProjectId })).project,
  });

  return {
    projectName: data?.name || PROJECT_FALLBACK_LABEL,
    hasProject: !!activeProjectId,
  };
}
