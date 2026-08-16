import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamsManager } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';
import { expectNoA11yViolations } from '../../test/a11y';

const {
  mockCreateTeam, mockUpdateTeam, mockArchiveTeam, mockRestoreTeam, mockListTeams,
  mockAddTeamMember, mockRemoveTeamMember, mockListTeamMembers,
  mockListRoles, mockGrantRole, mockRevokeGrant, mockListGrants,
  mockListOrgMembers,
} = vi.hoisted(() => ({
  mockCreateTeam: vi.fn(),
  mockUpdateTeam: vi.fn(),
  mockArchiveTeam: vi.fn(),
  mockRestoreTeam: vi.fn(),
  mockListTeams: vi.fn(),
  mockAddTeamMember: vi.fn(),
  mockRemoveTeamMember: vi.fn(),
  mockListTeamMembers: vi.fn(),
  mockListRoles: vi.fn(),
  mockGrantRole: vi.fn(),
  mockRevokeGrant: vi.fn(),
  mockListGrants: vi.fn(),
  mockListOrgMembers: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: { name?: string }) => {
    // Three distinct clients are constructed from this one mocked factory
    // (`TeamService`, `RoleService`, `OrgService`) - dispatch on the
    // service's own name string (set by the contract mock below) rather
    // than object identity, since `vi.mock` factories are hoisted above
    // any top-level `const` this file could otherwise share between them.
    if (service?.name === 'TeamService') {
      return {
        createTeam: mockCreateTeam, updateTeam: mockUpdateTeam, archiveTeam: mockArchiveTeam,
        restoreTeam: mockRestoreTeam, listTeams: mockListTeams, addTeamMember: mockAddTeamMember,
        removeTeamMember: mockRemoveTeamMember, listTeamMembers: mockListTeamMembers,
      };
    }
    if (service?.name === 'RoleService') {
      return { listRoles: mockListRoles, grantRole: mockGrantRole, revokeGrant: mockRevokeGrant, listGrants: mockListGrants };
    }
    return { listOrgMembers: mockListOrgMembers };
  }),
}));

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TeamService: { name: 'TeamService' },
  RoleService: { name: 'RoleService' },
  OrgService: { name: 'OrgService' },
}));

let mockActiveOrgId = 'org-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({ get activeOrgId() { return mockActiveOrgId; } })),
}));

const TEAMS = [
  { id: 'team-1', orgId: 'org-1', name: 'Platform', createdAt: '', deletedAt: undefined },
  { id: 'team-2', orgId: 'org-1', name: 'QA', createdAt: '', deletedAt: undefined },
];

const MEMBERS = [
  { userId: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace', joinedAt: '' },
  { userId: 'user-2', email: 'grace@example.com', name: '', joinedAt: '' },
];

const ROLES = [
  { id: 'role-owner', orgId: '', name: 'owner', isSystem: true, permissionKeys: [], createdAt: '' },
  { id: 'role-custom', orgId: 'org-1', name: 'QA Lead', isSystem: false, permissionKeys: [], createdAt: '' },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamsManager />
    </QueryClientProvider>
  );
}

describe('TeamsManager', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    for (const m of [
      mockCreateTeam, mockUpdateTeam, mockArchiveTeam, mockRestoreTeam, mockListTeams,
      mockAddTeamMember, mockRemoveTeamMember, mockListTeamMembers,
      mockListRoles, mockGrantRole, mockRevokeGrant, mockListGrants, mockListOrgMembers,
    ]) m.mockReset();

    mockListTeams.mockResolvedValue({ teams: TEAMS, page: {} });
    mockListTeamMembers.mockResolvedValue({ members: MEMBERS, page: {} });
    mockListRoles.mockResolvedValue({ roles: ROLES });
    mockListGrants.mockResolvedValue({ grants: [], page: {} });
    mockListOrgMembers.mockResolvedValue({ members: [], page: {} });
  });

  it('renders the header and the team list', async () => {
    renderPage();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(await screen.findByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
  });

  it('shows a prompt instead of a request when no organization is selected', () => {
    mockActiveOrgId = '';
    renderPage();
    expect(screen.getByText('Select an organization to manage its teams.')).toBeInTheDocument();
    expect(mockListTeams).not.toHaveBeenCalled();
  });

  it('surfaces a failed team list as a retryable error, not a false empty state', async () => {
    mockListTeams.mockRejectedValue(new Error('backend unreachable'));
    renderPage();
    expect(await screen.findByText(/Could not load this list: backend unreachable/)).toBeInTheDocument();
  });

  it('prompts to select a team before showing a roster', async () => {
    renderPage();
    await screen.findByText('Platform');
    expect(screen.getByText('Select a team to see its roster and role grants.')).toBeInTheDocument();
  });

  it('creates a team', async () => {
    mockCreateTeam.mockResolvedValue({ team: { id: 'team-new', orgId: 'org-1', name: 'Growth', createdAt: '' } });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Growth' } });
    // Radix marks the page behind an open dialog `aria-hidden`, so the
    // header's own "Create team" button drops out of the accessibility
    // tree while this one is open - only the dialog's submit button
    // matches by role here, the same pattern `Roles/index.test.tsx` uses.
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() => expect(mockCreateTeam).toHaveBeenCalledWith({ orgId: 'org-1', name: 'Growth' }));
  });

  it('does not create a team when the form is submitted with a blank name', async () => {
    renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    await screen.findByLabelText('Name');
    const submit = screen.getByRole('button', { name: 'Create team' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(mockCreateTeam).not.toHaveBeenCalled();
  });

  it('renames a team through its row-actions menu', async () => {
    mockUpdateTeam.mockResolvedValue({ team: { id: 'team-1', orgId: 'org-1', name: 'Infra', createdAt: '' } });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Infra' } });
    fireEvent.blur(input);

    await waitFor(() => expect(mockUpdateTeam).toHaveBeenCalledWith({ teamId: 'team-1', name: 'Infra' }));
  });

  it('archives a team after confirmation, and clears the selection if it was selected', async () => {
    mockArchiveTeam.mockResolvedValue({ success: true });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Members');
    expect(screen.queryByText('Select a team to see its roster and role grants.')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveTeam).toHaveBeenCalledWith({ teamId: 'team-1' }));
    expect(screen.getByText('Select a team to see its roster and role grants.')).toBeInTheDocument();
  });

  it('does not archive when confirmation is cancelled', async () => {
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await cancelAction();
    expect(mockArchiveTeam).not.toHaveBeenCalled();
  });

  it('toggles to the archived list and restores a team from it', async () => {
    mockListTeams.mockImplementation(async ({ onlyDeleted }: { onlyDeleted?: boolean }) =>
      onlyDeleted
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Retired', createdAt: '', deletedAt: '2026-01-01T00:00:00Z' }], page: {} }
        : { teams: TEAMS, page: {} });
    mockRestoreTeam.mockResolvedValue({ success: true });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.click(screen.getByRole('button', { name: 'Show archived teams' }));
    expect(await screen.findByText('Retired')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Retired' }), { button: 0 });
    fireEvent.click(await screen.findByText('Restore'));

    await waitFor(() => expect(mockRestoreTeam).toHaveBeenCalledWith({ teamId: 'team-3' }));
  });

  it("shows a team's roster and lets a search remove candidates that are already members", async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));

    expect(await screen.findByText('Ada Lovelace', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('grace@example.com', { selector: 'span' })).toBeInTheDocument();
  });

  it('adds a member found via search', async () => {
    mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-9', email: 'new@example.com', name: 'New Person', role: 'member' }], page: {} });
    mockAddTeamMember.mockResolvedValue({ success: true });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });

    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'new' } });
    fireEvent.click(await screen.findByText('New Person'));

    await waitFor(() => expect(mockAddTeamMember).toHaveBeenCalledWith({ teamId: 'team-1', userId: 'user-9' }));
  });

  it('removes a member after confirmation', async () => {
    mockRemoveTeamMember.mockResolvedValue({ success: true });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Lovelace from this team' }));
    await confirmAction();

    await waitFor(() => expect(mockRemoveTeamMember).toHaveBeenCalledWith({ teamId: 'team-1', userId: 'user-1' }));
  });

  it('grants a role to a team member, and it appears in the grants list', async () => {
    mockGrantRole.mockResolvedValue({
      grant: { id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' },
    });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });

    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant role' }));

    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledWith({
      subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom',
    }));
  });

  it('lists existing grants and revokes one', async () => {
    mockListGrants.mockResolvedValue({
      grants: [{ id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' }],
      page: {},
    });
    mockRevokeGrant.mockResolvedValue({ success: true });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));

    expect(await screen.findByText('QA Lead', { selector: 'span' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke QA Lead from Ada Lovelace' }));

    await waitFor(() => expect(mockRevokeGrant).toHaveBeenCalledWith({ grantId: 'grant-1' }));
  });

  it('surfaces a failed rename as an alert', async () => {
    mockUpdateTeam.mockRejectedValue(new Error('name already taken'));
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Infra' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to rename: name already taken');
  });

  it('surfaces a failed archive as an alert', async () => {
    mockArchiveTeam.mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await confirmAction();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to archive: boom');
  });

  it('surfaces a failed grant as an alert', async () => {
    mockGrantRole.mockRejectedValue(new Error('org:admin required'));
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant role' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to grant role: org:admin required');
  });

  it('pages to more teams with the load-more control', async () => {
    mockListTeams
      .mockResolvedValueOnce({ teams: TEAMS, page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ teams: [{ id: 'team-3', orgId: 'org-1', name: 'Growth', createdAt: '' }], page: {} });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.click(screen.getByRole('button', { name: 'Load more teams' }));
    expect(await screen.findByText('Growth')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    await expectNoA11yViolations(container);
  });

  it('retries the team list from the error state', async () => {
    mockListTeams.mockRejectedValueOnce(new Error('backend unreachable')).mockResolvedValueOnce({ teams: TEAMS, page: {} });
    renderPage();
    await screen.findByText(/Could not load this list/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Platform')).toBeInTheDocument();
  });

  it('submitting the create form with no name typed does not call createTeam', async () => {
    renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    const nameInput = await screen.findByLabelText('Name');
    fireEvent.submit(nameInput.closest('form')!);
    expect(mockCreateTeam).not.toHaveBeenCalled();
  });

  it('surfaces a failed create as an inline error', async () => {
    mockCreateTeam.mockRejectedValue(new Error('name already taken'));
    renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('Failed to create team: name already taken')).toBeInTheDocument();
  });

  it('commits a rename via Enter, and Escape cancels without saving', async () => {
    renderPage();
    await screen.findByText('Platform');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    let input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Rename team Platform')).not.toBeInTheDocument();
    expect(mockUpdateTeam).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Via Enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mockUpdateTeam).toHaveBeenCalledWith({ teamId: 'team-1', name: 'Via Enter' }));
  });

  it('committing a rename with the name unchanged does not call updateTeam', async () => {
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByLabelText('Rename team Platform');
    fireEvent.blur(input);
    expect(mockUpdateTeam).not.toHaveBeenCalled();
  });

  it('surfaces a failed member-search as a retryable error inside the picker', async () => {
    mockListOrgMembers.mockRejectedValueOnce(new Error('search unavailable')).mockResolvedValueOnce({ members: [], page: {} });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'x' } });
    expect(await screen.findByText(/Could not load this list: search unavailable/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
  });

  it('surfaces a failed member roster as a retryable error', async () => {
    mockListTeamMembers.mockRejectedValueOnce(new Error('roster unavailable')).mockResolvedValueOnce({ members: MEMBERS, page: {} });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    expect(await screen.findByText(/Could not load this list: roster unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ada Lovelace', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows a fallback message and a narrowing hint in the add-member picker', async () => {
    mockListOrgMembers.mockResolvedValue({
      members: [{ userId: 'user-9', email: 'nameless@example.com', name: '', role: 'member' }],
      page: { totalCount: 5 },
    });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));

    // No search typed yet: the candidate list is whatever the server sends
    // for an empty filter, so an unmatched empty search reads differently
    // from a search that came back empty.
    expect(await screen.findByText('nameless@example.com')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 5 — keep typing to narrow it down.');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Search people')).not.toBeInTheDocument();
  });

  it('says every member is already on the team when a candidate-less search is untyped', async () => {
    mockListOrgMembers.mockResolvedValue({ members: [], page: {} });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));
    expect(await screen.findByText('Every org member is already on this team.')).toBeInTheDocument();
  });

  it('paginates the member roster and the grants list independently', async () => {
    // Keyed on the requested cursor, not call order: a paginated query can
    // legitimately re-fetch its first page (a cache invalidation, a second
    // mount) before this test ever reaches "load more", and a plain
    // `mockResolvedValueOnce` chain would hand that extra call the second
    // page's data, leaving `hasNextPage` false and the button never
    // rendered - keying on `page.cursor` makes the mock correct regardless
    // of how many times the first page happens to be requested.
    mockListTeamMembers.mockImplementation(async ({ page }: { page?: { cursor?: string } }) =>
      page?.cursor === 'members-2'
        ? { members: [{ userId: 'user-3', email: 'more@example.com', name: 'More Person', joinedAt: '' }], page: {} }
        : { members: MEMBERS, page: { nextCursor: 'members-2' } });
    mockListGrants.mockImplementation(async ({ page }: { page?: { cursor?: string } }) =>
      page?.cursor === 'grants-2'
        ? { grants: [{ id: 'grant-2', subjectType: 'user', subjectId: 'user-2', scopeType: 'team', scopeId: 'team-1', roleId: 'role-owner', roleName: 'owner', createdAt: '' }], page: {} }
        : { grants: [{ id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' }], page: { nextCursor: 'grants-2' } });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Members');

    fireEvent.click(await screen.findByRole('button', { name: 'Load more members' }));
    expect(await screen.findByText('More Person', { selector: 'span' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more grants' }));
    expect(await screen.findByText('owner', { selector: 'span' })).toBeInTheDocument();
  });

  it('surfaces a failed grants list as a retryable error', async () => {
    mockListGrants.mockRejectedValueOnce(new Error('grants unavailable')).mockResolvedValueOnce({ grants: [], page: {} });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    expect(await screen.findByText(/Could not load this list: grants unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText("No roles granted at this team's scope yet.")).toBeInTheDocument();
  });

  it('does not grant a role when the form is submitted with only one field chosen', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'user-1' } });
    fireEvent.submit(screen.getByLabelText('Member').closest('form')!);
    expect(mockGrantRole).not.toHaveBeenCalled();
  });

  it('shows a restored team\'s archived badge in its own detail header, and labels a team-subject grant', async () => {
    mockListTeams.mockImplementation(async ({ onlyDeleted }: { onlyDeleted?: boolean }) =>
      onlyDeleted
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Retired', createdAt: '', deletedAt: '2026-01-01T00:00:00Z' }], page: {} }
        : { teams: TEAMS, page: {} });
    mockListGrants.mockResolvedValue({
      grants: [
        { id: 'grant-1', subjectType: 'team', subjectId: 'team-3', scopeType: 'team', scopeId: 'team-3', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' },
        { id: 'grant-2', subjectType: 'team', subjectId: 'team-other', scopeType: 'team', scopeId: 'team-3', roleId: 'role-owner', roleName: 'owner', createdAt: '' },
        { id: 'grant-3', subjectType: 'user', subjectId: 'user-unknown', scopeType: 'team', scopeId: 'team-3', roleId: 'role-owner', roleName: 'owner', createdAt: '' },
      ],
      page: {},
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show archived teams' }));
    fireEvent.click(await screen.findByText('Retired'));

    const heading = await screen.findByRole('heading', { name: /Retired/ });
    expect(within(heading).getByText('Archived')).toBeInTheDocument();
    expect(await screen.findByText('Retired', { selector: 'span.min-w-0' })).toBeInTheDocument();
    expect(screen.getByText('Team: team-other')).toBeInTheDocument();
    expect(screen.getByText('user-unknown')).toBeInTheDocument();
  });

  it('surfaces a failed remove-member as an alert', async () => {
    mockRemoveTeamMember.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Lovelace from this team' }));
    await confirmAction();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to remove member: boom');
  });

  it('surfaces a failed revoke as an alert', async () => {
    mockListGrants.mockResolvedValue({
      grants: [{ id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' }],
      page: {},
    });
    mockRevokeGrant.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke QA Lead from Ada Lovelace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to revoke grant: boom');
  });

  it('surfaces a failed restore as an alert', async () => {
    mockListTeams.mockImplementation(async ({ onlyDeleted }: { onlyDeleted?: boolean }) =>
      onlyDeleted
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Retired', createdAt: '', deletedAt: '2026-01-01T00:00:00Z' }], page: {} }
        : { teams: TEAMS, page: {} });
    mockRestoreTeam.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show archived teams' }));
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions for Retired' }), { button: 0 });
    fireEvent.click(await screen.findByText('Restore'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to restore: boom');
  });
});
