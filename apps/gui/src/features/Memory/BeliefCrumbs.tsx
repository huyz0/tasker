import { Breadcrumbs } from '../../components/layout/Breadcrumbs';
import { useScopedTo } from '../../hooks/useScope';
import { useScopeLabels } from '../../hooks/useScopeLabels';

/**
 * How long a belief gets to be in a trail.
 *
 * A statement is a sentence — "Every migration is replayed against MySQL
 * before it is merged" — and a breadcrumb is one line of small text next to
 * two other crumbs. The CSS `truncate` on the crumb itself only hides the
 * overflow; the accessible name would still be the whole sentence, read out
 * in full. Short enough to sit beside its parents, long enough that two
 * beliefs starting the same way are still told apart.
 */
const EXCERPT_LENGTH = 24;

function excerpt(statement: string): string {
  if (statement.length <= EXCERPT_LENGTH) return statement;
  const clipped = statement.slice(0, EXCERPT_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  // Cut at the last word that fits, unless nothing in reach is a word break —
  // a single long token has no better place to stop than the limit.
  return `${lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped}…`;
}

/**
 * The way out of an open belief (M28-T07).
 *
 * `/memory/:beliefId` is deep-linkable and had no trail at all, so a pasted
 * belief link opened a screen whose only exit was the browser's Back button —
 * which, on a fresh tab, leaves the application.
 *
 * No organization crumb, here or anywhere: `useScopeLabels` records why (no
 * `getOrg`-by-id RPC exists, so an organization's name cannot be resolved
 * from the id a deep link carries).
 */
export function BeliefCrumbs({ scopeType, statement }: { scopeType: 'project' | 'organization'; statement: string }) {
  const scopedTo = useScopedTo();
  const { projectName, hasProject } = useScopeLabels();

  // `useScopedTo` carries org and project — it deliberately does not carry a
  // screen's own parameters. The tier is one of those, and it decides which
  // list `/memory` shows, so the crumb restates it: a belief read under
  // organization scope has to return to the organization list.
  const [path, query = ''] = scopedTo('/memory').split('?');
  const listParams = new URLSearchParams(query);
  listParams.set('scope', scopeType);

  return (
    <Breadcrumbs
      className="mb-3"
      items={[
        // Organization memory is not the project's, so the project crumb would
        // be describing something the belief does not belong to.
        ...(scopeType === 'project' && hasProject ? [{ label: projectName, to: scopedTo('/projects') }] : []),
        { label: 'Memory', to: `${path}?${listParams.toString()}` },
        { label: excerpt(statement) },
      ]}
    />
  );
}
