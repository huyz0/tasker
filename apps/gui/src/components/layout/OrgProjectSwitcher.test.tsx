import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrgService, ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';

let mockActiveOrgId = '';
let mockActiveProjectId = '';
const mockSetActiveOrgId = vi.fn((id: string) => { mockActiveOrgId = id; });
const mockSetActiveProjectId = vi.fn((id: string) => { mockActiveProjectId = id; });
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
    setActiveOrgId: mockSetActiveOrgId,
    setActiveProjectId: mockSetActiveProjectId,
  })),
}));

import { OrgProjectSwitcher } from './OrgProjectSwitcher';

function renderSwitcher() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <OrgProjectSwitcher />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

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
    mockActiveOrgId = '';
    mockActiveProjectId = '';
    mockSetActiveOrgId.mockReset();
    mockSetActiveProjectId.mockReset();
  });

  it('auto-selects the first org when none is active', async () => {
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    withListProjects({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-1'));
  });

  it('auto-selects the first project once an org is active', async () => {
    mockActiveOrgId = 'org-1';
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }] });

    renderSwitcher();

    await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-1'));
  });

  it('asks the server for one bounded page, not every page', async () => {
    mockActiveOrgId = 'org-1';
    const requests = withListOrgs({
      organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }],
      page: { totalCount: 2000, nextCursor: 'cursor-2' },
    });
    withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();

    // The old switcher followed nextCursor until it ran out, so 2,000 projects
    // meant 200 requests before the primary navigation control was usable
    // (M06-T09). One page, and the rest reached by searching.
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests).toContainEqual({ page: { limit: 10 } });
    expect(requests).not.toContainEqual(expect.objectContaining({ page: expect.objectContaining({ cursor: 'cursor-2' }) }));
  });

  it('searches the server as you type, rather than filtering the page it has', async () => {
    mockActiveOrgId = 'org-1';
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 2000 } });
    const requests = withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();
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
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
    withListProjects((body: { page?: { filter?: string } }) =>
      body.page?.filter === 'Bulk'
        ? { projects: [{ id: 'proj-1234', name: 'Bulk Project 1234' }], page: { totalCount: 1 } }
        : { projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();
    fireEvent.click(await screen.findByLabelText('Active project'));
    fireEvent.change(await screen.findByLabelText('Search active project'), { target: { value: 'Bulk' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Bulk Project 1234' }));

    // Closing resets the search, so page one comes back without the chosen
    // project on it. The old auto-select read that as "gone" and re-picked
    // projects[0] — choosing project 1234 of 2000 put the switcher back on 0999.
    await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-1234'));
    expect(mockSetActiveProjectId).not.toHaveBeenCalledWith('proj-1');
    expect(await screen.findByLabelText('Active project')).toHaveTextContent('Bulk Project 1234');
  });

  // M20-T05: the displayed label used to be set once (gated on `!label`)
  // and never updated again - renaming the active project (or org) from
  // elsewhere in the app left the sidebar showing the old name for the
  // rest of the session, since nothing here ever re-synced from fresh
  // query data once a label was set.
  it('picks up a renamed project once its list query refetches', async () => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    let renamed = false;
    withListProjects(() => {
      const wasRenamed = renamed;
      renamed = true;
      return wasRenamed
        ? { projects: [{ id: 'proj-1', name: 'Renamed Project' }] }
        : { projects: [{ id: 'proj-1', name: 'Old Project Name' }] };
    });

    const { queryClient } = renderSwitcher();
    await waitFor(() => expect(screen.getByLabelText('Active project')).toHaveTextContent('Old Project Name'));

    await queryClient.invalidateQueries({ queryKey: ['projects'] });

    await waitFor(() => expect(screen.getByLabelText('Active project')).toHaveTextContent('Renamed Project'));
  });

  it('picks up a renamed organization once its list query refetches', async () => {
    mockActiveOrgId = 'org-1';
    let renamed = false;
    withListOrgs(() => {
      const wasRenamed = renamed;
      renamed = true;
      return wasRenamed
        ? { organizations: [{ id: 'org-1', name: 'Renamed Org', slug: 'org-one' }] }
        : { organizations: [{ id: 'org-1', name: 'Old Org Name', slug: 'org-one' }] };
    });
    withListProjects({ projects: [] });

    const { queryClient } = renderSwitcher();
    await waitFor(() => expect(screen.getByLabelText('Active organization')).toHaveTextContent('Old Org Name'));

    await queryClient.invalidateQueries({ queryKey: ['orgs'] });

    await waitFor(() => expect(screen.getByLabelText('Active organization')).toHaveTextContent('Renamed Org'));
  });

  it('says how many it is not showing', async () => {
    mockActiveOrgId = 'org-1';
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
    withListProjects({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();
    fireEvent.click(await screen.findByLabelText('Active project'));

    expect(await screen.findByText(/Showing 1 of 2000/)).toBeInTheDocument();
  });

  it('indents an organization under its parent', async () => {
    mockActiveOrgId = 'org-1';
    withListOrgs({
      organizations: [
        { id: 'org-1', name: 'Root Co', slug: 'root' },
        { id: 'org-2', name: 'Sub Co', slug: 'sub', parentOrgId: 'org-1' },
      ],
      page: { totalCount: 2 },
    });
    withListProjects({ projects: [] });

    renderSwitcher();
    fireEvent.click(await screen.findByLabelText('Active organization'));

    const child = await screen.findByRole('option', { name: 'Sub Co' });
    const root = screen.getByRole('option', { name: 'Root Co' });
    // A flat list of names cannot tell "Support" in one company from "Support"
    // in another.
    expect(parseInt(child.style.paddingLeft)).toBeGreaterThan(parseInt(root.style.paddingLeft));
  });

  it('lets the user switch the active organization', async () => {
    mockActiveOrgId = 'org-1';
    withListOrgs({
      organizations: [
        { id: 'org-1', name: 'Org One', slug: 'org-one' },
        { id: 'org-2', name: 'Org Two', slug: 'org-two' },
      ],
    });
    withListProjects({ projects: [] });

    renderSwitcher();

    fireEvent.click(await screen.findByLabelText('Active organization'));
    fireEvent.click(await screen.findByRole('option', { name: 'Org Two' }));

    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-2');
    // The old organization's projects are not this one's, and a stale id leaves
    // every list empty with no explanation.
    expect(mockSetActiveProjectId).toHaveBeenCalledWith('');
  });

  it('shows a "No organizations" option once the query resolves with zero orgs, not a perpetual loading label', async () => {
    withListOrgs({ organizations: [] });
    withListProjects({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(screen.getByText('No organizations')).toBeDefined());
    expect(screen.queryByText('Loading organizations...')).toBeNull();
  });

  it('lets the user switch the active project', async () => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    withListProjects({
      projects: [
        { id: 'proj-1', name: 'Project One' },
        { id: 'proj-2', name: 'Project Two' },
      ],
    });

    renderSwitcher();

    fireEvent.click(await screen.findByLabelText('Active project'));
    fireEvent.click(await screen.findByRole('option', { name: 'Project Two' }));

    expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-2');
  });

  describe('keyboard and dismissal', () => {
    const openWithThree = async () => {
      mockActiveOrgId = 'org-1';
      withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      withListProjects({
        projects: [
          { id: 'proj-1', name: 'Alpha' },
          { id: 'proj-2', name: 'Beta' },
          { id: 'proj-3', name: 'Gamma' },
        ],
        page: { totalCount: 3 },
      });
      renderSwitcher();
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
      await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-3'));
    });

    it('moves back up, and does not run off the top', async () => {
      const input = await openWithThree();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-1'));
    });

    it('does not run off the bottom either', async () => {
      const input = await openWithThree();
      for (let i = 0; i < 10; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-3'));
    });

    it('closes on Escape without choosing anything', async () => {
      const input = await openWithThree();
      // Mounting with nothing selected legitimately picks the first project, so
      // the question is whether Escape adds a call — not whether any exist.
      const before = mockSetActiveProjectId.mock.calls.length;
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      expect(mockSetActiveProjectId.mock.calls.length).toBe(before);
    });

    it('ignores Enter when the search matched nothing', async () => {
      mockActiveOrgId = 'org-1';
      withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      withListProjects({ projects: [], page: { totalCount: 0 } });
      renderSwitcher();
      fireEvent.click(await screen.findByLabelText('Active project'));

      const before = mockSetActiveProjectId.mock.calls.length;
      fireEvent.keyDown(await screen.findByLabelText('Search active project'), { key: 'Enter' });
      expect(mockSetActiveProjectId.mock.calls.length).toBe(before);
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
      await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-2'));
    });

    it('says nothing matches, rather than showing an empty box', async () => {
      mockActiveOrgId = 'org-1';
      withListOrgs({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      withListProjects((body: { page?: { filter?: string } }) =>
        body.page?.filter
          ? { projects: [], page: { totalCount: 0 } }
          : { projects: [{ id: 'proj-1', name: 'Alpha' }], page: { totalCount: 1 } });
      renderSwitcher();
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
