import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListOrgs, mockListProjects } = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockListProjects: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'ProjectService') return { listProjects: mockListProjects };
    return { listOrgs: mockListOrgs };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  OrgService: 'OrgService',
  ProjectService: 'ProjectService',
}));

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
  return render(
    <QueryClientProvider client={queryClient}>
      <OrgProjectSwitcher />
    </QueryClientProvider>
  );
}

describe('OrgProjectSwitcher', () => {
  beforeEach(() => {
    mockActiveOrgId = '';
    mockActiveProjectId = '';
    mockListOrgs.mockReset();
    mockListProjects.mockReset();
    mockSetActiveOrgId.mockReset();
    mockSetActiveProjectId.mockReset();
  });

  it('auto-selects the first org when none is active', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    mockListProjects.mockResolvedValue({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-1'));
  });

  it('auto-selects the first project once an org is active', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Project One' }] });

    renderSwitcher();

    await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-1'));
  });

  it('asks the server for one bounded page, not every page', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }],
      page: { totalCount: 2000, nextCursor: 'cursor-2' },
    });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();

    // The old switcher followed nextCursor until it ran out, so 2,000 projects
    // meant 200 requests before the primary navigation control was usable
    // (M06-T09). One page, and the rest reached by searching.
    await waitFor(() => expect(mockListOrgs).toHaveBeenCalledTimes(1));
    expect(mockListOrgs).toHaveBeenCalledWith({ page: { limit: 10, filter: undefined } });
    expect(mockListOrgs).not.toHaveBeenCalledWith(expect.objectContaining({ page: expect.objectContaining({ cursor: 'cursor-2' }) }));
  });

  it('searches the server as you type, rather than filtering the page it has', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 2000 } });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();
    fireEvent.click(await screen.findByLabelText('Active project'));
    fireEvent.change(await screen.findByLabelText('Search active project'), { target: { value: 'Alpha' } });

    // Filtering in the browser can only ever find what is already on the page —
    // ten of two thousand.
    await waitFor(() => expect(mockListProjects).toHaveBeenCalledWith({
      orgId: 'org-1',
      page: { limit: 10, filter: 'Alpha' },
    }));
  });

  it('keeps a project chosen from a later page instead of snapping back', async () => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
    mockListProjects
      .mockResolvedValueOnce({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } })
      .mockResolvedValueOnce({ projects: [{ id: 'proj-1234', name: 'Bulk Project 1234' }], page: { totalCount: 1 } })
      .mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

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

  it('says how many it is not showing', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Project One' }], page: { totalCount: 2000 } });

    renderSwitcher();
    fireEvent.click(await screen.findByLabelText('Active project'));

    expect(await screen.findByText(/Showing 1 of 2000/)).toBeInTheDocument();
  });

  it('indents an organization under its parent', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-1', name: 'Root Co', slug: 'root' },
        { id: 'org-2', name: 'Sub Co', slug: 'sub', parentOrgId: 'org-1' },
      ],
      page: { totalCount: 2 },
    });
    mockListProjects.mockResolvedValue({ projects: [] });

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
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-1', name: 'Org One', slug: 'org-one' },
        { id: 'org-2', name: 'Org Two', slug: 'org-two' },
      ],
    });
    mockListProjects.mockResolvedValue({ projects: [] });

    renderSwitcher();

    fireEvent.click(await screen.findByLabelText('Active organization'));
    fireEvent.click(await screen.findByRole('option', { name: 'Org Two' }));

    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-2');
    // The old organization's projects are not this one's, and a stale id leaves
    // every list empty with no explanation.
    expect(mockSetActiveProjectId).toHaveBeenCalledWith('');
  });

  it('shows a "No organizations" option once the query resolves with zero orgs, not a perpetual loading label', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListProjects.mockResolvedValue({ projects: [] });

    renderSwitcher();

    await waitFor(() => expect(screen.getByText('No organizations')).toBeDefined());
    expect(screen.queryByText('Loading organizations...')).toBeNull();
  });

  it('lets the user switch the active project', async () => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }] });
    mockListProjects.mockResolvedValue({
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
      mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      mockListProjects.mockResolvedValue({
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
      mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      mockListProjects.mockResolvedValue({ projects: [], page: { totalCount: 0 } });
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
      mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Org One', slug: 'org-one' }], page: { totalCount: 1 } });
      mockListProjects
        .mockResolvedValueOnce({ projects: [{ id: 'proj-1', name: 'Alpha' }], page: { totalCount: 1 } })
        .mockResolvedValue({ projects: [], page: { totalCount: 0 } });
      renderSwitcher();
      fireEvent.click(await screen.findByLabelText('Active project'));
      fireEvent.change(await screen.findByLabelText('Search active project'), { target: { value: 'zzz' } });

      expect(await screen.findByText('Nothing matches that.')).toBeInTheDocument();
    });

    it('does not claim there are no organizations when the request failed', async () => {
      // The switcher sits on every page, so this was the most persistent
      // instance of the M06-T11 defect: a failed `listOrgs` rendered
      // "No organizations", the same words as an account that has none.
      mockListOrgs.mockRejectedValue(new Error('unavailable'));
      mockListProjects.mockResolvedValue({ projects: [], page: { totalCount: 0 } });
      renderSwitcher();

      fireEvent.click(await screen.findByLabelText('Active organization'));
      expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
      expect(screen.queryByText('No organizations')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
});
