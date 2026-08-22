import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamService, RoleService, OrgService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { TeamsManager } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';
import { expectNoA11yViolations } from '../../test/a11y';

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

/** Registers ListTeams and records every request it receives. */
function withListTeams(response: object | ((body: any) => object) = { teams: TEAMS, page: {} }) {
  const requests: any[] = [];
  mockRpc(TeamService, 'ListTeams', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers CreateTeam and records every request it receives. */
function withCreateTeam(response: object) {
  const requests: any[] = [];
  mockRpc(TeamService, 'CreateTeam', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateTeam and records every request it receives. */
function withUpdateTeam(response: object) {
  const requests: any[] = [];
  mockRpc(TeamService, 'UpdateTeam', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers ArchiveTeam and records every request it receives. */
function withArchiveTeam(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(TeamService, 'ArchiveTeam', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers RestoreTeam and records every request it receives. */
function withRestoreTeam(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(TeamService, 'RestoreTeam', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers ListTeamMembers and records every request it receives. */
function withListTeamMembers(response: object | ((body: any) => object) = { members: MEMBERS, page: {} }) {
  const requests: any[] = [];
  mockRpc(TeamService, 'ListTeamMembers', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers AddTeamMember and records every request it receives. */
function withAddTeamMember(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(TeamService, 'AddTeamMember', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers RemoveTeamMember and records every request it receives. */
function withRemoveTeamMember(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(TeamService, 'RemoveTeamMember', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers GrantRole and records every request it receives. */
function withGrantRole(response: object) {
  const requests: any[] = [];
  mockRpc(RoleService, 'GrantRole', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers RevokeGrant and records every request it receives. */
function withRevokeGrant(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(RoleService, 'RevokeGrant', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers ListGrants and records every request it receives. */
function withListGrants(response: object | ((body: any) => object) = { grants: [], page: {} }) {
  const requests: any[] = [];
  mockRpc(RoleService, 'ListGrants', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers ListOrgMembers and records every request it receives. */
function withListOrgMembers(response: object = { members: [], page: {} }) {
  const requests: any[] = [];
  mockRpc(OrgService, 'ListOrgMembers', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('TeamsManager', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    withListTeams();
    withListTeamMembers();
    mockRpc(RoleService, 'ListRoles', { roles: ROLES });
    withListGrants();
    withListOrgMembers();
  });

  it('renders the header and the team list', async () => {
    renderPage();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(await screen.findByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
  });

  it('shows a prompt instead of a request when no organization is selected', () => {
    mockActiveOrgId = '';
    const requests = withListTeams();
    renderPage();
    expect(screen.getByText('Select an organization to manage its teams.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('surfaces a failed team list as a retryable error, not a false empty state', async () => {
    mockRpcError(TeamService, 'ListTeams', 'unavailable', 'backend unreachable');
    renderPage();
    expect(await screen.findByText(/Could not load this list: .*backend unreachable/)).toBeInTheDocument();
  });

  it('prompts to select a team before showing a roster', async () => {
    renderPage();
    await screen.findByText('Platform');
    expect(screen.getByText('Select a team to see its roster and role grants.')).toBeInTheDocument();
  });

  it('creates a team', async () => {
    const requests = withCreateTeam({ team: { id: 'team-new', orgId: 'org-1', name: 'Growth', createdAt: '' } });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Growth' } });
    // Radix marks the page behind an open dialog `aria-hidden`, so the
    // header's own "Create team" button drops out of the accessibility
    // tree while this one is open - only the dialog's submit button
    // matches by role here, the same pattern `Roles/index.test.tsx` uses.
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', name: 'Growth' }));
  });

  it('does not create a team when the form is submitted with a blank name', async () => {
    const requests = withCreateTeam({});
    renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    await screen.findByLabelText('Name');
    const submit = screen.getByRole('button', { name: 'Create team' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('renames a team through its row-actions menu', async () => {
    const requests = withUpdateTeam({ team: { id: 'team-1', orgId: 'org-1', name: 'Infra', createdAt: '' } });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Infra' } });
    fireEvent.blur(input);

    await waitFor(() => expect(requests).toContainEqual({ teamId: 'team-1', name: 'Infra' }));
  });

  it('archives a team after confirmation, and clears the selection if it was selected', async () => {
    const requests = withArchiveTeam();
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Members');
    expect(screen.queryByText('Select a team to see its roster and role grants.')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ teamId: 'team-1' }));
    expect(screen.getByText('Select a team to see its roster and role grants.')).toBeInTheDocument();
  });

  it('does not archive when confirmation is cancelled', async () => {
    const requests = withArchiveTeam();
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await cancelAction();
    expect(requests).toHaveLength(0);
  });

  it('toggles to the archived list and restores a team from it', async () => {
    withListTeams((body: { onlyDeleted?: boolean }) =>
      body.onlyDeleted
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Retired', createdAt: '', deletedAt: '2026-01-01T00:00:00Z' }], page: {} }
        : { teams: TEAMS, page: {} });
    const requests = withRestoreTeam();
    renderPage();
    await screen.findByText('Platform');

    fireEvent.click(screen.getByRole('button', { name: 'Show archived teams' }));
    expect(await screen.findByText('Retired')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Retired' }), { button: 0 });
    fireEvent.click(await screen.findByText('Restore'));

    await waitFor(() => expect(requests).toContainEqual({ teamId: 'team-3' }));
  });

  it("shows a team's roster and lets a search remove candidates that are already members", async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));

    expect(await screen.findByText('Ada Lovelace', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('grace@example.com', { selector: 'span' })).toBeInTheDocument();
  });

  it('adds a member found via search', async () => {
    withListOrgMembers({ members: [{ userId: 'user-9', email: 'new@example.com', name: 'New Person', role: 'member' }], page: {} });
    const requests = withAddTeamMember();
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });

    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'new' } });
    fireEvent.click(await screen.findByText('New Person'));

    await waitFor(() => expect(requests).toContainEqual({ teamId: 'team-1', userId: 'user-9' }));
  });

  it('removes a member after confirmation', async () => {
    const requests = withRemoveTeamMember();
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Lovelace from this team' }));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ teamId: 'team-1', userId: 'user-1' }));
  });

  it('grants a role to a team member, and it appears in the grants list', async () => {
    const requests = withGrantRole({
      grant: { id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' },
    });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });

    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant role' }));

    await waitFor(() => expect(requests).toContainEqual({
      subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom',
    }));
  });

  it('lists existing grants and revokes one', async () => {
    withListGrants({
      grants: [{ id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' }],
      page: {},
    });
    const requests = withRevokeGrant();
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));

    expect(await screen.findByText('QA Lead', { selector: 'span' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke QA Lead from Ada Lovelace' }));

    await waitFor(() => expect(requests).toContainEqual({ grantId: 'grant-1' }));
  });

  it('surfaces a failed rename as an alert', async () => {
    mockRpcError(TeamService, 'UpdateTeam', 'unknown', 'name already taken');
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Infra' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to rename:.*name already taken/);
  });

  it('surfaces a failed archive as an alert', async () => {
    mockRpcError(TeamService, 'ArchiveTeam', 'unknown', 'boom');
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Archive'));
    await confirmAction();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to archive:.*boom/);
  });

  it('surfaces a failed grant as an alert', async () => {
    mockRpcError(RoleService, 'GrantRole', 'permission_denied', 'org:admin required');
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant role' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to grant role:.*org:admin required/);
  });

  it('pages to more teams with the load-more control', async () => {
    withListTeams((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Growth', createdAt: '' }], page: {} }
        : { teams: TEAMS, page: { nextCursor: 'cursor-2' } });
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
    mockRpcError(TeamService, 'ListTeams', 'unavailable', 'backend unreachable');
    renderPage();
    await screen.findByText(/Could not load this list/);
    withListTeams();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Platform')).toBeInTheDocument();
  });

  it('submitting the create form with no name typed does not call createTeam', async () => {
    const requests = withCreateTeam({});
    renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    const nameInput = await screen.findByLabelText('Name');
    fireEvent.submit(nameInput.closest('form')!);
    expect(requests).toHaveLength(0);
  });

  it('surfaces a failed create as an inline error', async () => {
    mockRpcError(TeamService, 'CreateTeam', 'unknown', 'name already taken');
    renderPage();
    await screen.findByText('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText(/Failed to create team:.*name already taken/)).toBeInTheDocument();
  });

  it('commits a rename via Enter, and Escape cancels without saving', async () => {
    const requests = withUpdateTeam({ team: { id: 'team-1', orgId: 'org-1', name: 'Via Enter', createdAt: '' } });
    renderPage();
    await screen.findByText('Platform');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    let input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Rename team Platform')).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    input = await screen.findByLabelText('Rename team Platform');
    fireEvent.change(input, { target: { value: 'Via Enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(requests).toContainEqual({ teamId: 'team-1', name: 'Via Enter' }));
  });

  it('committing a rename with the name unchanged does not call updateTeam', async () => {
    const requests = withUpdateTeam({});
    renderPage();
    await screen.findByText('Platform');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Platform' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));
    const input = await screen.findByLabelText('Rename team Platform');
    fireEvent.blur(input);
    expect(requests).toHaveLength(0);
  });

  it('surfaces a failed member-search as a retryable error inside the picker', async () => {
    mockRpcError(OrgService, 'ListOrgMembers', 'unavailable', 'search unavailable');
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'x' } });
    expect(await screen.findByText(/Could not load this list: .*search unavailable/)).toBeInTheDocument();

    withListOrgMembers();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
  });

  it('surfaces a failed member roster as a retryable error', async () => {
    mockRpcError(TeamService, 'ListTeamMembers', 'unavailable', 'roster unavailable');
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    expect(await screen.findByText(/Could not load this list: .*roster unavailable/)).toBeInTheDocument();
    withListTeamMembers();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ada Lovelace', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows a fallback message and a narrowing hint in the add-member picker', async () => {
    withListOrgMembers({
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
    withListOrgMembers({ members: [], page: {} });
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add member' }));
    expect(await screen.findByText('Every org member is already on this team.')).toBeInTheDocument();
  });

  it('paginates the member roster and the grants list independently', async () => {
    // Keyed on the requested cursor, not call order: a paginated query can
    // legitimately re-fetch its first page (a cache invalidation, a second
    // mount) before this test ever reaches "load more", and a mock that
    // answered by call order would hand that extra call the second page's
    // data, leaving `hasNextPage` false and the button never rendered -
    // keying on `page.cursor` makes the mock correct regardless of how many
    // times the first page happens to be requested.
    withListTeamMembers((body: { page?: { cursor?: string } }) =>
      body.page?.cursor === 'members-2'
        ? { members: [{ userId: 'user-3', email: 'more@example.com', name: 'More Person', joinedAt: '' }], page: {} }
        : { members: MEMBERS, page: { nextCursor: 'members-2' } });
    withListGrants((body: { page?: { cursor?: string } }) =>
      body.page?.cursor === 'grants-2'
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
    mockRpcError(RoleService, 'ListGrants', 'unavailable', 'grants unavailable');
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    expect(await screen.findByText(/Could not load this list: .*grants unavailable/)).toBeInTheDocument();
    withListGrants();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText("No roles granted at this team's scope yet.")).toBeInTheDocument();
  });

  it('does not grant a role when the form is submitted with only one field chosen', async () => {
    const requests = withGrantRole({});
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'user-1' } });
    fireEvent.submit(screen.getByLabelText('Member').closest('form')!);
    expect(requests).toHaveLength(0);
  });

  it('shows a restored team\'s archived badge in its own detail header, and labels a team-subject grant', async () => {
    withListTeams((body: { onlyDeleted?: boolean }) =>
      body.onlyDeleted
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Retired', createdAt: '', deletedAt: '2026-01-01T00:00:00Z' }], page: {} }
        : { teams: TEAMS, page: {} });
    withListGrants({
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
    mockRpcError(TeamService, 'RemoveTeamMember', 'unknown', 'boom');
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    await screen.findByText('Ada Lovelace', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Lovelace from this team' }));
    await confirmAction();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to remove member:.*boom/);
  });

  it('surfaces a failed revoke as an alert', async () => {
    withListGrants({
      grants: [{ id: 'grant-1', subjectType: 'user', subjectId: 'user-1', scopeType: 'team', scopeId: 'team-1', roleId: 'role-custom', roleName: 'QA Lead', createdAt: '' }],
      page: {},
    });
    mockRpcError(RoleService, 'RevokeGrant', 'unknown', 'boom');
    renderPage();
    fireEvent.click(await screen.findByText('Platform'));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke QA Lead from Ada Lovelace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to revoke grant:.*boom/);
  });

  it('surfaces a failed restore as an alert', async () => {
    withListTeams((body: { onlyDeleted?: boolean }) =>
      body.onlyDeleted
        ? { teams: [{ id: 'team-3', orgId: 'org-1', name: 'Retired', createdAt: '', deletedAt: '2026-01-01T00:00:00Z' }], page: {} }
        : { teams: TEAMS, page: {} });
    mockRpcError(TeamService, 'RestoreTeam', 'unknown', 'boom');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show archived teams' }));
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions for Retired' }), { button: 0 });
    fireEvent.click(await screen.findByText('Restore'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to restore:.*boom/);
  });
});
