import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { useLayoutStore } from '../../store/layout';
import { BeliefCrumbs } from './BeliefCrumbs';

/**
 * Memory's way out (M28-T07). `/memory/:beliefId` is deep-linkable and had no
 * trail at all, so a pasted belief link was a screen with no parent.
 */

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: 'org-1', activeProjectId: 'proj-1' });
  mockRpc(ProjectService, 'GetProject', { project: { id: 'proj-1', name: 'Seed Project' } });
});

const renderCrumbs = (
  props: Parameters<typeof BeliefCrumbs>[0],
  initialEntry = '/memory/blf-1?org=org-1&project=proj-1',
) => renderScoped(<BeliefCrumbs {...props} />, { paths: ['/memory/:beliefId'], initialEntry });

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

describe('BeliefCrumbs', () => {
  it('runs from the project through Memory to the belief', async () => {
    renderCrumbs({ scopeType: 'project', statement: 'Tests must pass' });

    expect(await within(trail()).findByRole('link', { name: 'Seed Project' })).toHaveAttribute(
      'href', '/projects?org=org-1&project=proj-1',
    );
    expect(within(trail()).getByRole('link', { name: 'Memory' })).toHaveAttribute(
      'href', '/memory?org=org-1&project=proj-1&scope=project',
    );
    // The belief itself is the page, not a link to itself.
    expect(within(trail()).getByText('Tests must pass')).toHaveAttribute('aria-current', 'page');
  });

  it('omits the project when the screen is reading organization memory', () => {
    renderCrumbs({ scopeType: 'organization', statement: 'Tests must pass' });

    expect(within(trail()).queryByRole('link', { name: 'Seed Project' })).toBeNull();
    // The tier travels with the crumb: a belief read under organization scope
    // must return to the organization list, not to the project one.
    expect(within(trail()).getByRole('link', { name: 'Memory' })).toHaveAttribute(
      'href', '/memory?org=org-1&project=proj-1&scope=organization',
    );
  });

  it('omits the project crumb when no project is in scope', () => {
    useLayoutStore.setState({ activeProjectId: '' });
    renderCrumbs({ scopeType: 'project', statement: 'Tests must pass' }, '/memory/blf-1?org=org-1');

    expect(within(trail()).queryByRole('link', { name: /Project/ })).toBeNull();
    expect(within(trail()).getByRole('link', { name: 'Memory' })).toHaveAttribute(
      'href', '/memory?org=org-1&scope=project',
    );
  });

  it('states the tier even when the URL carries no scope at all', () => {
    useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
    renderCrumbs({ scopeType: 'organization', statement: 'Tests must pass' }, '/memory/blf-1');

    expect(within(trail()).getByRole('link', { name: 'Memory' })).toHaveAttribute('href', '/memory?scope=organization');
  });

  it('shortens a long statement at a word boundary', () => {
    renderCrumbs({
      scopeType: 'organization',
      statement: 'Every migration is replayed against MySQL before it is merged',
    });

    // A belief statement is a sentence; a trail is one line. The excerpt has
    // to end somewhere a reader can stop.
    expect(within(trail()).getByText('Every migration is…')).toBeInTheDocument();
  });

  it('shortens a long unbroken token rather than showing all of it', () => {
    renderCrumbs({ scopeType: 'organization', statement: 'Supercalifragilisticexpialidocious' });

    expect(within(trail()).getByText('Supercalifragilisticexpi…')).toBeInTheDocument();
  });
});
