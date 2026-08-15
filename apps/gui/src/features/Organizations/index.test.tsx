import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrganizationsDashboard } from './index';

const { mockListOrgs, mockSeedOrg, mockArchiveOrg, mockSetOrgRetentionDays, mockUpdateOrg, mockListOrgMembers, mockRemoveOrgMember, mockUpdateOrgMemberRole } = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockSeedOrg: vi.fn(),
  mockArchiveOrg: vi.fn(),
  mockSetOrgRetentionDays: vi.fn(),
  mockUpdateOrg: vi.fn(),
  mockListOrgMembers: vi.fn(),
  mockRemoveOrgMember: vi.fn(),
  mockUpdateOrgMemberRole: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    listOrgs: mockListOrgs,
    seedOrg: mockSeedOrg,
    archiveOrg: mockArchiveOrg,
    setOrgRetentionDays: mockSetOrgRetentionDays,
    updateOrg: mockUpdateOrg,
    listOrgMembers: mockListOrgMembers,
    removeOrgMember: mockRemoveOrgMember,
    updateOrgMemberRole: mockUpdateOrgMemberRole,
  })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ OrgService: {} }));

let mockActiveOrgId = 'org-1';
const mockSetActiveOrgId = vi.fn((id: string) => { mockActiveOrgId = id; });
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeOrgId() { return mockActiveOrgId; },
    setActiveOrgId: mockSetActiveOrgId,
  })),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsDashboard />
    </QueryClientProvider>
  );
}

describe('OrganizationsDashboard', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockReset();
    mockSeedOrg.mockReset();
    mockArchiveOrg.mockReset();
    mockSetOrgRetentionDays.mockReset();
    mockSetActiveOrgId.mockReset();
    mockUpdateOrg.mockReset();
    mockListOrgMembers.mockReset();
    mockListOrgMembers.mockResolvedValue({ members: [] });
    mockRemoveOrgMember.mockReset();
    mockUpdateOrgMemberRole.mockReset();
  });

  it('renders the header correctly', () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    expect(screen.getByText('Organizations & Settings')).toBeDefined();
    expect(screen.getByText('Manage hierarchical organizational structure and teams.')).toBeDefined();
  });

  it('switches to the Roles & Permissions section and back to Organizations', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeInTheDocument());
    expect(screen.getByText('Your Organizations')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Roles & Permissions'));
    await waitFor(() => expect(screen.getByText('No members found.')).toBeInTheDocument());
    expect(screen.queryByText('Your Organizations')).toBeNull();

    fireEvent.click(screen.getByText('Organizations'));
    expect(screen.getByText('Your Organizations')).toBeInTheDocument();
  });

  it('renders loading state for orgs', () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    expect(screen.getByText('Loading organizations...')).toBeDefined();
  });

  it('auto-selects the first real org when the current selection does not exist', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-real-1', name: 'Real Org', slug: 'real-org' }],
    });
    renderPage();

    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-real-1'));
  });

  it('does not re-select when the current org already exists in the list', async () => {
    mockActiveOrgId = 'org-real-1';
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-real-1', name: 'Real Org', slug: 'real-org' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Real Org')).toBeDefined());
    expect(mockSetActiveOrgId).not.toHaveBeenCalled();
  });

  it('creates a new organization via the form and selects it', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockSeedOrg.mockResolvedValue({ organization: { id: 'org-new', name: 'New Co', slug: 'new-co' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'New Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSeedOrg).toHaveBeenCalledWith({ name: 'New Co', slug: 'new-co' }));
    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-new'));
  });

  it('shows an error message when organization creation fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockSeedOrg.mockRejectedValue(new Error('slug already taken'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText(/Failed to create organization/)).toBeDefined());
  });

  it('creates a child org under a selected parent and renders it nested', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-root', name: 'Root Co', slug: 'root-co' }],
    });
    mockSeedOrg.mockResolvedValue({ organization: { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Child Co' } });
    fireEvent.change(screen.getByLabelText('Parent organization'), { target: { value: 'org-root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSeedOrg).toHaveBeenCalledWith({ name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' }));
  });

  it('renders child orgs nested beneath their parent', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    expect(screen.getByText('Child Co')).toBeDefined();
  });

  it('loads the next page of organizations when Load More is clicked', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs
      .mockResolvedValueOnce({ organizations: [{ id: 'org-1', name: 'Page One Org', slug: 'page-one' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ organizations: [{ id: 'org-2', name: 'Page Two Org', slug: 'page-two' }], page: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => expect(screen.getByText('Page Two Org')).toBeDefined());
    expect(mockListOrgs).toHaveBeenCalledWith({ page: { cursor: 'cursor-2' } });
    await waitFor(() => expect(screen.getByText('No more items to load')).toBeDefined());
  });

  it('auto-loads later pages so a root org past the first page is selectable as a new org\'s parent', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs
      .mockResolvedValueOnce({ organizations: [{ id: 'org-1', name: 'Page One Root', slug: 'page-one' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ organizations: [{ id: 'org-2', name: 'Page Two Root', slug: 'page-two' }], page: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Root')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));

    await waitFor(() => expect(screen.getByText('Under Page Two Root')).toBeDefined());
    expect(screen.getByText('Under Page One Root')).toBeDefined();
  });

  it('shows and saves bin retention for the active org', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org', binRetentionDays: 45 }] });
    mockSetOrgRetentionDays.mockResolvedValue({ success: true });

    renderPage();

    const input = await screen.findByDisplayValue('45');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSetOrgRetentionDays).toHaveBeenCalledWith({ orgId: 'org-1', binRetentionDays: 10 }));
  });

  it('shows an error message when updating retention fails', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org' }] });
    mockSetOrgRetentionDays.mockRejectedValue(new Error('not an admin'));

    renderPage();

    const input = await screen.findByDisplayValue('30');
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Failed to update retention/)).toBeDefined());
  });

  it('shows validation feedback instead of silently no-opping on an invalid retention value', async () => {
    mockActiveOrgId = 'org-1';
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org', binRetentionDays: 30 }] });

    renderPage();

    const input = await screen.findByDisplayValue('30');
    fireEvent.change(input, { target: { value: '0' } });

    await waitFor(() => expect(screen.getByText('Enter a number of days greater than 0.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSetOrgRetentionDays).not.toHaveBeenCalled();
  });

  it('shows a message when there are no organizations', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No organizations found - create one above.')).toBeDefined());
  });

  it('archives a root org after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockArchiveOrg.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockArchiveOrg).toHaveBeenCalledWith({ orgId: 'org-1' }));
  });

  it('does not archive an org when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockArchiveOrg).not.toHaveBeenCalled();
  });

  it('shows an error message when archiving an org fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockArchiveOrg.mockRejectedValue(new Error('cannot delete'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText(/Failed to delete organization/)).toBeDefined());
  });

  it('archives a child org after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    mockArchiveOrg.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByText('Child Co')).toBeDefined());
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    await waitFor(() => expect(mockArchiveOrg).toHaveBeenCalledWith({ orgId: 'org-child' }));
  });

  it('collapses and expands a parent org, hiding and reshowing its children', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Child Co')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Collapse Root Co'));
    expect(screen.queryByText('Child Co')).toBeNull();

    fireEvent.click(screen.getByLabelText('Expand Root Co'));
    expect(screen.getByText('Child Co')).toBeInTheDocument();
  });

  it('selects a root org via click and via keyboard', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-other', name: 'Other Co', slug: 'other-co' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Other Co')).toBeDefined());
    fireEvent.click(screen.getByText('Other Co'));
    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-other');

    fireEvent.keyDown(screen.getByText('Root Co'), { key: 'Enter' });
    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-root');
  });

  it('falls back to a generated slug when the org name has no alphanumeric characters', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockSeedOrg.mockResolvedValue({ organization: { id: 'org-new', name: '!!!', slug: 'org-123' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: '!!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSeedOrg).toHaveBeenCalled());
    const call = mockSeedOrg.mock.calls[0][0];
    expect(call.slug).toMatch(/^org-\d+$/);
  });

  it('shows a pending label while creating an organization', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    let resolveSeed: (v: any) => void = () => {};
    mockSeedOrg.mockReturnValue(new Promise((resolve) => { resolveSeed = resolve; }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Pending Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    resolveSeed({ organization: { id: 'org-new', name: 'Pending Co', slug: 'pending-co' } });
  });

  it('does not select an org when an unrelated key is pressed', async () => {
    mockActiveOrgId = 'org-root';
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Child Co')).toBeDefined());
    mockSetActiveOrgId.mockClear();
    fireEvent.keyDown(screen.getByText('Root Co'), { key: 'Tab' });
    fireEvent.keyDown(screen.getByText('Child Co'), { key: 'Tab' });

    expect(mockSetActiveOrgId).not.toHaveBeenCalled();
  });

  it('does not create an organization when the form is submitted with a blank name', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.submit(screen.getByPlaceholderText('Organization name').closest('form')!);

    expect(mockSeedOrg).not.toHaveBeenCalled();
  });

  it('does not switch the active org when the seeded organization is not returned', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockSeedOrg.mockResolvedValue({ organization: undefined });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'No Org Back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSeedOrg).toHaveBeenCalled());
    expect(mockSetActiveOrgId).not.toHaveBeenCalled();
  });

  it('highlights the active root and child org with an "Active" badge', async () => {
    mockActiveOrgId = 'org-child';
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(1));
  });

  it('selects a child org via keyboard', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Child Co')).toBeDefined());
    fireEvent.keyDown(screen.getByText('Child Co'), { key: ' ' });
    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-child');
  });

  it('renames an org through the GUI', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockUpdateOrg.mockResolvedValue({ organization: { id: 'org-1', name: 'Renamed Co', slug: 'renamed-co' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('Root Co');
    const slugInput = screen.getByDisplayValue('root-co');
    fireEvent.change(nameInput, { target: { value: 'Renamed Co' } });
    fireEvent.change(slugInput, { target: { value: 'renamed-co' } });
    fireEvent.click(screen.getAllByText('Save')[0]);

    await waitFor(() => expect(mockUpdateOrg).toHaveBeenCalledWith({ orgId: 'org-1', name: 'Renamed Co', slug: 'renamed-co' }));
  });

  it('cancels editing an org without saving', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Root Co')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Root Co')).toBeInTheDocument();
    expect(mockUpdateOrg).not.toHaveBeenCalled();
  });

  it('shows an error message when renaming an org fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockUpdateOrg.mockRejectedValue(new Error('slug already exists'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getAllByText('Save')[0]);

    await waitFor(() => expect(screen.getByText(/Failed to update organization/)).toBeInTheDocument());
  });

  it('lists org members and removes one after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    mockRemoveOrgMember.mockResolvedValue({ success: true });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(mockRemoveOrgMember).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'user-1' }));
  });

  it('shows "No members found." when the org has no members', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [] });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText('No members found.')).toBeInTheDocument());
  });

  it('does not remove a member when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));

    expect(mockRemoveOrgMember).not.toHaveBeenCalled();
  });

  it('shows an error message when removing a member fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    mockRemoveOrgMember.mockRejectedValue(new Error("cannot remove the organization's last owner"));

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(screen.getByText(/Failed to remove member/)).toBeInTheDocument());
  });

  // M03-T07: the server caps a page at 100 rows, so reading one response would
  // show the first page and silently drop the rest. This mock returns two
  // pages; a component that ignores the cursor renders only Alice.
  it('follows the cursor until every member is loaded', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers
      .mockResolvedValueOnce({
        members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
        page: { nextCursor: 'cursor-2', totalCount: 2 },
      })
      .mockResolvedValueOnce({
        members: [{ userId: 'user-2', email: 'b@b.com', name: 'Bob', role: 'member' }],
        page: { totalCount: 2 },
      });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Bob/)).toBeInTheDocument());
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(mockListOrgMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ orgId: 'org-1', page: expect.objectContaining({ cursor: 'cursor-2' }) }),
    );
  });

  // M03-T08: search and the role facet are server-side. A client-side filter
  // over the loaded window would report "3 admins" for an org with 200 of them,
  // which reads as an answer rather than as a truncation.
  it('sends the search term to the server, debounced', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 1 },
    });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'ali' } });

    await waitFor(
      () =>
        expect(mockListOrgMembers).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: expect.objectContaining({ filter: 'ali' }) }),
        ),
      { timeout: 2000 },
    );
  });

  it('sends the role facet to the server', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 1 },
    });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } });

    await waitFor(() =>
      expect(mockListOrgMembers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'viewer' })),
    );
  });

  it('reports the filtered total, not the page size', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 100001 },
    });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByTestId('member-count')).toHaveTextContent('Showing 1 of 100001'));
  });

  it('names the query when a search matches nothing, and offers a way back', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers
      .mockResolvedValueOnce({
        members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
        page: { totalCount: 1 },
      })
      .mockResolvedValue({ members: [], page: { totalCount: 0 } });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'zzz' } });

    await waitFor(() => expect(screen.getByText(/No members match/)).toBeInTheDocument(), { timeout: 2000 });
    // "No members found." would say the organization is empty. It is not — the
    // search is.
    expect(screen.getByText('zzz')).toBeInTheDocument();
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('exposes the true row count to assistive technology, not the windowed count', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 100001 },
    });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByRole('rowgroup')).toHaveAttribute('aria-rowcount', '100001'));
  });

  // The verify line for M03-T08 is a frame budget, which no jsdom test can
  // measure. What is testable is the mechanism behind it: the number of rows in
  // the DOM must not grow with the number of members. If windowing regresses,
  // this fails long before anyone opens a profiler.
  it('keeps the DOM bounded as the member count grows', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      userId: `user-${i}`,
      email: `m${i}@b.com`,
      name: `Member ${String(i).padStart(4, '0')}`,
      role: 'member',
    }));
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: many, page: { totalCount: 1000 } });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByTestId('member-count')).toHaveTextContent('Showing 1000 of 1000'));

    const rendered = screen.getByRole('rowgroup').querySelectorAll('[data-index]').length;
    expect(rendered).toBeGreaterThan(0);
    // Measured: 9 rows in the DOM for 1000 members. Without windowing it is
    // 1000, so this bound is not decorative.
    expect(rendered).toBeLessThan(100);
  });

  // M03-T09: a child whose parent is on a later page arrives with a
  // parentOrgId that matches nothing loaded, so the tree never draws it. The
  // server sends the missing parent as an ancestor; this asserts the client
  // uses it rather than dropping the child.
  it('draws a sub-organization whose parent arrived as an ancestor', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [{ id: 'org-child', name: 'Alpha Child', slug: 'alpha-child', parentOrgId: 'org-parent' }],
      ancestors: [{ id: 'org-parent', name: 'Zeta Parent', slug: 'zeta-parent' }],
      page: {},
    });
    mockListOrgMembers.mockResolvedValue({ members: [], page: { totalCount: 0 } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Zeta Parent')).toBeInTheDocument());
    expect(screen.getByText('Alpha Child')).toBeInTheDocument();
  });

  it('does not duplicate an organization that arrives as both a row and an ancestor', async () => {
    mockListOrgs.mockResolvedValue({
      organizations: [
        { id: 'org-parent', name: 'Zeta Parent', slug: 'zeta-parent' },
        { id: 'org-child', name: 'Alpha Child', slug: 'alpha-child', parentOrgId: 'org-parent' },
      ],
      ancestors: [{ id: 'org-parent', name: 'Zeta Parent', slug: 'zeta-parent' }],
      page: {},
    });
    mockListOrgMembers.mockResolvedValue({ members: [], page: { totalCount: 0 } });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Zeta Parent')).toHaveLength(1));
  });

  // M03-T04: the server refuses to remove a member who still owns projects and
  // names them in the refusal. The ids are the actionable part, so this asserts
  // they reach the screen rather than just that "something failed" was shown.
  it('shows which projects block a member removal', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    mockRemoveOrgMember.mockRejectedValue(
      new Error('user still owns 2 project(s) in this organization - reassign them first: proj-alpha, proj-beta'),
    );

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(screen.getByText(/proj-alpha/)).toBeInTheDocument());
    expect(screen.getByText(/proj-beta/)).toBeInTheDocument();
  });

  it('changes a member\'s role via the role dropdown', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'member' }] });
    mockUpdateOrgMemberRole.mockResolvedValue({ member: { userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' } });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Role for Alice'), { target: { value: 'admin' } });

    await waitFor(() => expect(mockUpdateOrgMemberRole).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'user-1', role: 'admin' }));
  });

  it('shows a plain "Owner" label instead of a role dropdown for an owner', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'owner' }] });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    expect(screen.getByText('Owner', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Alice')).toBeNull();
  });

  it('falls back to email, then userId, when a member has no name', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [
      { userId: 'user-2', email: 'noname@b.com', role: 'member' },
      { userId: 'user-3', role: 'viewer' },
    ] });

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText('noname@b.com')).toBeInTheDocument());
    expect(screen.getByText('user-3')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for noname@b.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for user-3')).toBeInTheDocument();
  });

  it('shows an error message when updating a member role fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'member' }] });
    mockUpdateOrgMemberRole.mockRejectedValue(new Error('owner role required'));

    renderPage();
    fireEvent.click(screen.getByText('Roles & Permissions'));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Role for Alice'), { target: { value: 'viewer' } });

    await waitFor(() => expect(screen.getByText(/Failed to update role/)).toBeInTheDocument());
  });
});
