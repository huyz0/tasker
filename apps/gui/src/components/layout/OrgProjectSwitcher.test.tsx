import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useLocation } from 'react-router-dom';
import { OrgService, ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';

import { OrgProjectSwitcher } from './OrgProjectSwitcher';
import { useScopeSync } from '../../hooks/useScope';
import { renderScoped } from '../../test/renderScoped';
import { useLayoutStore } from '../../store/layout';

// M28-T03: the switcher no longer writes the store; it writes `?org=`/`?project=`
// and `AppShell`'s `useScopeSync` reads them back in (ADR-0025). So these tests
// use the *real* store with the same one-directional URL → store flow the
// application gives the component, and assert on the URL — the observable
// outcome — rather than on a setter call that is no longer the mechanism.
function ScopeSync() {
  useScopeSync();
  return null;
}

/**
 * `initialEntry` lets a test start with a scope already chosen — the way the
 * application arrives at one, and the replacement for the old mocked
 * `activeOrgId`/`activeProjectId`. The default is the scopeless URL a first
 * visit actually has.
 */
function renderSwitcher(initialEntry = '/tasks') {
  /**
   * Every distinct query string the router has been at, oldest first. Needed
   * where a test asserts scope never went somewhere, not merely where it
   * ended up.
   */
  const visited: string[] = [];
  function Probe() {
    const { search } = useLocation();
    if (visited[visited.length - 1] !== search) visited.push(search);
    return <ScopeSync />;
  }
  const result = renderScoped(<><Probe /><OrgProjectSwitcher /></>, { paths: ['/tasks'], initialEntry });
  return { ...result, visited };
}

/** The `project` id the URL carried at each point it changed. */
const projectIds = (visited: string[]) => visited.map((s) => new URLSearchParams(s).get('project') ?? '');

/** The `project` id the URL carries right now. */
const projectId = (search: string) => new URLSearchParams(search).get('project');

/** Registers ListOrgs and records every request it receives. */
function withListOrgs(response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(OrgService, 'ListOrgs', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers ListProjects and records every request it receives. */
function withListProjects(response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(ProjectService, 'ListProjects', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

describe('OrgProjectSwitcher', () => {
  beforeEach(() => {
    useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
  });

  it('auto-selects the first org when none is active', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    withListProjects({ projects: [] });

    const { location } = renderSwitcher();

    await waitFor(() => expect(location.search).toContain('org=org-1'));
  });

  it('auto-selects the first project once an org is active', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }] });

    const { location } = renderSwitcher('/tasks?org=org-1');

    await waitFor(() => expect(location.search).toContain('project=proj-1'));
  });

  it('asks the server for one bounded page, not every page', async () => {
    const requests = withListOrgs({
      organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }],
      page: { totalCount: 2000, nextCursor: 'cursor-2' },
    });
    withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher('/tasks?org=org-1');

    // The old switcher followed nextCursor until it ran out, so 2,000 projects
    // meant 200 requests before the primary navigation control was usable
    // (M06-T09). One page, and the rest reached by searching.
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests).toContainEqual({ page: { limit: 10 } });
    expect(requests).not.toContainEqual(expect.objectContaining({ page: expect.objectContaining({ cursor: 'cursor-2' }) }));
  });

  it('searches the server as you type, rather than filtering the page it has', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 2000 } });
    const requests = withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher('/tasks?org=org-1');
    fireEvent.click(await screen.findByLabelText('Active project'));
    fireEvent.change(await screen.findByLabelText('Search active project'), { target: { value: 'Alpha' } });

    // Filtering in the browser can only ever find what is already on the page —
    // ten of two thousand.
    await waitFor(() => expect(requests).toContainEqual({
      orgId: 'org-1',
      page: { limit: 10, filter: 'Alpha' },
    }));
  });

  it('keeps a project chosen from a later page instead of snapping back', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
    const requests = withListProjects((body: { page?: { filter?: string } }) =>
      body.page?.filter === 'Bulk'
        ? { projects: [{ id: 'proj-1234', name: 'Bulk Project 1234' }], page: { totalCount: 1 } }
        : { projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    const { location, visited } = renderSwitcher('/tasks?org=org-1&project=proj-1');
    fireEvent.click(await screen.findByLabelText('Active project'));
    fireEvent.change(await screen.findByLabelText('Search active project'), { target: { value: 'Bulk' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Bulk Project 1234' }));

    await waitFor(() => expect(location.search).toContain('project=proj-1234'));

    // Closing resets the search, so page one comes back without the chosen
    // project on it. The old auto-select read that as "gone" and re-picked
    // projects[0] — choosing project 1234 of 2000 put the switcher back on 0999.
    await waitFor(() => expect(requests.filter((r) => !r.page?.filter).length).toBeGreaterThan(1));
    const ids = projectIds(visited);
    expect(ids.slice(ids.indexOf('proj-1234'))).toEqual(['proj-1234']);
    expect(await screen.findByLabelText('Active project')).toHaveTextContent('Bulk Project 1234');
  });

  // M20-T05: the displayed label used to be set once (gated on `!label`)
  // and never updated again - renaming the active project (or org) from
  // elsewhere in the app left the sidebar showing the old name for the
  // rest of the session, since nothing here ever re-synced from fresh
  // query data once a label was set.
  it('picks up a renamed project once its list query refetches', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    let renamed = false;
    withListProjects(() => {
      const wasRenamed = renamed;
      renamed = true;
      return wasRenamed
        ? { projects: [{ id: 'proj-1', name: 'Renamed Project' }] }
        : { projects: [{ id: 'proj-1', name: 'Old Project Name' }] };
    });

    const { queryClient } = renderSwitcher('/tasks?org=org-1&project=proj-1');
    await waitFor(() => expect(screen.getByLabelText('Active project')).toHaveTextContent('Old Project Name'));

    await queryClient.invalidateQueries({ queryKey: ['projects'] });

    await waitFor(() => expect(screen.getByLabelText('Active project')).toHaveTextContent('Renamed Project'));
  });

  it('picks up a renamed organization once its list query refetches', async () => {
    let renamed = false;
    withListOrgs(() => {
      const wasRenamed = renamed;
      renamed = true;
      return wasRenamed
        ? { organizations: [{ id: 'org-1', name: 'Renamed Org', slug: 'org-one' }] }
        : { organizations: [{ id: 'org-1', name: 'Old Org Name', slug: 'org-one' }] };
    });
    withListProjects({ projects: [] });

    const { queryClient } = renderSwitcher('/tasks?org=org-1');
    await waitFor(() => expect(screen.getByLabelText('Active organization')).toHaveTextContent('Old Org Name'));

    await queryClient.invalidateQueries({ queryKey: ['orgs'] });

    await waitFor(() => expect(screen.getByLabelText('Active organization')).toHaveTextContent('Renamed Org'));
  });

  it('says how many it is not showing', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
    withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher('/tasks?org=org-1');
    fireEvent.click(await screen.findByLabelText('Active project'));

    expect(await screen.findByText(/Showing 1 of 2000/)).toBeInTheDocument();
  });

  it('indents an organization under its parent', async () => {
    withListOrgs({
      organizations: [
        { id: 'org-1', name: 'Root Co', slug: 'root' },
        { id: 'org-2', name: 'Sub Co', slug: 'sub', parentOrgId: 'org-1' },
      ],
      page: { totalCount: 2 },
    });
    withListProjects({ projects: [] });

    renderSwitcher('/tasks?org=org-1');
    fireEvent.click(await screen.findByLabelText('Active organization'));

    const child = await screen.findByRole('option', { name: 'Sub Co' });
    const root = screen.getByRole('option', { name: 'Root Co' });
    // A flat list of names cannot tell "Support" in one company from "Support"
    // in another.
    expect(parseInt(child.style.paddingLeft)).toBeGreaterThan(parseInt(root.style.paddingLeft));
  });

  it('lets the user switch the active organization', async () => {
    withListOrgs({
      organizations: [
        { id: 'org-1', name: 'Org One', slug: 'org-one' },
        { id: 'org-2', name: 'Org Two', slug: 'org-two' },
      ],
    });
    withListProjects({ projects: [] });

    // Starting with a project in scope is what makes the clearing observable.
    const { location } = renderSwitcher('/tasks?org=org-1&project=proj-1');

    fireEvent.click(await screen.findByLabelText('Active organization'));
    fireEvent.click(await screen.findByRole('option', { name: 'Org Two' }));

    await waitFor(() => expect(location.search).toContain('org=org-2'));
    // The old organization's projects are not this one's, and a stale id leaves
    // every list empty with no explanation. An empty value is *removed* from
    // the URL rather than written blank, so the absence is the assertion.
    expect(location.search).not.toContain('project=');
  });

  it('shows a "No organizations" option once the query resolves with zero orgs, not a perpetual loading label', async () => {
    withListOrgs({ organizations: [] });
    withListProjects({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(screen.getByText('No organizations')).toBeDefined());
    expect(screen.queryByText('Loading organizations…')).toBeNull();
  });

  it('lets the user switch the active project', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    withListProjects({
      projects: [
        { id: 'proj-1', name: 'Project One' },
        { id: 'proj-2', name: 'Project Two' },
      ],
    });

    const { location } = renderSwitcher('/tasks?org=org-1&project=proj-1');

    fireEvent.click(await screen.findByLabelText('Active project'));
    fireEvent.click(await screen.findByRole('option', { name: 'Project Two' }));

    await waitFor(() => expect(location.search).toContain('project=proj-2'));
  });

  describe('keyboard and dismissal', () => {
    let location: { search: string };

    const openWithThree = async (initialEntry = '/tasks?org=org-1') => {
      withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      withListProjects({
        projects: [
          { id: 'proj-1', name: 'Alpha' },
          { id: 'proj-2', name: 'Beta' },
          { id: 'proj-3', name: 'Gamma' },
        ],
        page: { totalCount: 3 },
      });
      location = renderSwitcher(initialEntry).location;
      fireEvent.click(await screen.findByLabelText('Active project'));
      return screen.findByLabelText('Search active project');
    };

    it('moves down the list and picks with Enter', async () => {
      const input = await openWithThree();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      // A combobox nobody can drive from the keyboard is a mouse-only control
      // wearing the right ARIA roles.
      await waitFor(() => expect(projectId(location.search)).toBe('proj-3'));
    });

    it('moves back up, and does not run off the top', async () => {
      // Beta is already in scope, so landing on Alpha is a change the URL can
      // show. Mounting with nothing selected would auto-select Alpha anyway,
      // which would make the assertion true whatever the arrow keys did.
      const input = await openWithThree('/tasks?org=org-1&project=proj-2');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(projectId(location.search)).toBe('proj-1'));
    });

    it('does not run off the bottom either', async () => {
      const input = await openWithThree();
      for (let i = 0; i < 10; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(projectId(location.search)).toBe('proj-3'));
    });

    it('closes on Escape without choosing anything', async () => {
      const input = await openWithThree();
      // Mounting with nothing selected legitimately picks the first project, so
      // the question is whether Escape moves scope on — not whether it moved at
      // all. Wait for the auto-select to settle, then hold the URL still.
      await waitFor(() => expect(projectId(location.search)).toBe('proj-1'));
      const before = location.search;
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      expect(location.search).toBe(before);
    });

    it('ignores Enter when the search matched nothing', async () => {
      withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      withListProjects({ projects: [], page: { totalCount: 0 } });
      const { location: loc } = renderSwitcher('/tasks?org=org-1');
      fireEvent.click(await screen.findByLabelText('Active project'));

      const before = loc.search;
      fireEvent.keyDown(await screen.findByLabelText('Search active project'), { key: 'Enter' });
      expect(loc.search).toBe(before);
    });

    it('closes when the user clicks elsewhere', async () => {
      await openWithThree();
      fireEvent.mouseDown(document.body);
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    });

    it('stays open when the click is inside it', async () => {
      const input = await openWithThree();
      fireEvent.mouseDown(input);
      expect(screen.getByRole('listbox', { name: 'Active project' })).toBeInTheDocument();
    });

    it('follows the mouse, so hovering then pressing Enter picks what is under the cursor', async () => {
      const input = await openWithThree();
      fireEvent.mouseEnter(await screen.findByRole('option', { name: 'Beta' }));
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(projectId(location.search)).toBe('proj-2'));
    });

    it('says nothing matches, rather than showing an empty box', async () => {
      withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      withListProjects((body: { page?: { filter?: string } }) =>
        body.page?.filter
          ? { projects: [], page: { totalCount: 0 } }
          : { projects: [{ id: 'proj-1', name: 'Alpha' }], page: { totalCount: 1 } });
      renderSwitcher('/tasks?org=org-1');
      fireEvent.click(await screen.findByLabelText('Active project'));
      fireEvent.change(await screen.findByLabelText('Search active project'), { target: { value: 'zzz' } });

      expect(await screen.findByText('Nothing matches that.')).toBeInTheDocument();
    });

    it('does not claim there are no organizations when the request failed', async () => {
      // The switcher sits on every page, so this was the most persistent
      // instance of the M06-T11 defect: a failed `listOrgs` rendered
      // "No organizations", the same words as an account that has none.
      mockRpcError(OrgService, 'ListOrgs', 'unavailable', 'unavailable');
      withListProjects({ projects: [], page: { totalCount: 0 } });
      renderSwitcher();

      fireEvent.click(await screen.findByLabelText('Active organization'));
      expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
      expect(screen.queryByText('No organizations')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
});
