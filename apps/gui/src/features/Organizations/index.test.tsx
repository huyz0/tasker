import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrgService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { OrganizationsDashboard } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';

// The audit panel is a sibling tab with its own query; these tests are about
// the Organizations and Roles sections, so it stands in as a marker rather
// than pulling a second RPC surface into every case here. AuditTrail.test.tsx
// covers it directly.
vi.mock('./AuditTrail', () => ({
  AuditTrail: ({ orgId }: { orgId: string }) => <div data-testid="audit-trail">audit for {orgId}</div>,
}));

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

/** Registers one RPC and returns an array of every request it receives. */
function withRpc(method: string, response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(OrgService, method, (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

describe('OrganizationsDashboard', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockSetActiveOrgId.mockReset();
    withRpc('ListInvitations', { invitations: [] });
    withRpc('InviteUser', { success: true });
    withRpc('RevokeInvitation', { success: true });
    withRpc('ListOrgMembers', { members: [] });
  });

  it('renders the header correctly', () => {
    withRpc('ListOrgs', { organizations: [] });
    renderPage();
    expect(screen.getByText('Organizations & Settings')).toBeDefined();
    expect(screen.getByText('Manage hierarchical organizational structure and teams.')).toBeDefined();
  });

  it('switches to the Roles & Permissions section and back to Organizations', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeInTheDocument());
    expect(screen.getByText('Your Organizations')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });
    await waitFor(() => expect(screen.getByText('No members found.')).toBeInTheDocument());
    expect(screen.queryByText('Your Organizations')).toBeNull();

    fireEvent.mouseDown(screen.getByText('Organizations'), { button: 0 });
    expect(screen.getByText('Your Organizations')).toBeInTheDocument();
  });

  it('renders loading state for orgs', () => {
    withRpc('ListOrgs', { organizations: [] });
    renderPage();
    expect(screen.getByText('Loading organizations…')).toBeDefined();
  });

  it('auto-selects the first real org when the current selection does not exist', async () => {
    withRpc('ListOrgs', {
      organizations: [{ id: 'org-real-1', name: 'Real Org', slug: 'real-org' }],
    });
    renderPage();

    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-real-1'));
  });

  it('does not re-select when the current org already exists in the list', async () => {
    mockActiveOrgId = 'org-real-1';
    withRpc('ListOrgs', {
      organizations: [{ id: 'org-real-1', name: 'Real Org', slug: 'real-org' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Real Org')).toBeDefined());
    expect(mockSetActiveOrgId).not.toHaveBeenCalled();
  });

  it('creates a new organization via the form and selects it', async () => {
    withRpc('ListOrgs', { organizations: [] });
    const requests = withRpc('SeedOrg', { organization: { id: 'org-new', name: 'New Co', slug: 'new-co' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'New Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(requests).toContainEqual({ name: 'New Co', slug: 'new-co' }));
    await waitFor(() => expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-new'));
  });

  it('shows an error message when organization creation fails', async () => {
    withRpc('ListOrgs', { organizations: [] });
    mockRpcError(OrgService, 'SeedOrg', 'unknown', 'slug already taken');
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText(/Failed to create organization/)).toBeDefined());
  });

  it('creates a child org under a selected parent and renders it nested', async () => {
    withRpc('ListOrgs', {
      organizations: [{ id: 'org-root', name: 'Root Co', slug: 'root-co' }],
    });
    const requests = withRpc('SeedOrg', { organization: { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Child Co' } });
    fireEvent.change(screen.getByLabelText('Parent organization'), { target: { value: 'org-root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(requests).toContainEqual({ name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' }));
  });

  it('renders child orgs nested beneath their parent', async () => {
    withRpc('ListOrgs', {
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
    const requests = withRpc('ListOrgs', (body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { organizations: [{ id: 'org-2', name: 'Page Two Org', slug: 'page-two' }], page: {} }
        : { organizations: [{ id: 'org-1', name: 'Page One Org', slug: 'page-one' }], page: { nextCursor: 'cursor-2' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => expect(screen.getByText('Page Two Org')).toBeDefined());
    expect(requests).toContainEqual({ page: { cursor: 'cursor-2' } });
    await waitFor(() => expect(screen.getByText('No more items to load')).toBeDefined());
  });

  it('auto-loads later pages so a root org past the first page is selectable as a new org\'s parent', async () => {
    mockActiveOrgId = 'org-1';
    withRpc('ListOrgs', (body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { organizations: [{ id: 'org-2', name: 'Page Two Root', slug: 'page-two' }], page: {} }
        : { organizations: [{ id: 'org-1', name: 'Page One Root', slug: 'page-one' }], page: { nextCursor: 'cursor-2' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Root')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));

    await waitFor(() => expect(screen.getByText('Under Page Two Root')).toBeDefined());
    expect(screen.getByText('Under Page One Root')).toBeDefined();
  });

  it('shows and saves bin retention for the active org', async () => {
    mockActiveOrgId = 'org-1';
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org', binRetentionDays: 45 }] });
    const requests = withRpc('SetOrgRetentionDays', { success: true });

    renderPage();

    const input = await screen.findByDisplayValue('45');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', binRetentionDays: 10 }));
  });

  it('shows a pending label while saving retention', async () => {
    mockActiveOrgId = 'org-1';
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org', binRetentionDays: 45 }] });
    const pending = mockRpcPending(OrgService, 'SetOrgRetentionDays');

    renderPage();

    const input = await screen.findByDisplayValue('45');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    pending.resolve({ success: true });
  });

  it('shows an error message when updating retention fails', async () => {
    mockActiveOrgId = 'org-1';
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org' }] });
    mockRpcError(OrgService, 'SetOrgRetentionDays', 'permission_denied', 'not an admin');

    renderPage();

    const input = await screen.findByDisplayValue('30');
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Failed to update retention/)).toBeDefined());
  });

  it('shows validation feedback instead of silently no-opping on an invalid retention value', async () => {
    mockActiveOrgId = 'org-1';
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Active Org', slug: 'active-org', binRetentionDays: 30 }] });
    const requests = withRpc('SetOrgRetentionDays', {});

    renderPage();

    const input = await screen.findByDisplayValue('30');
    fireEvent.change(input, { target: { value: '0' } });

    await waitFor(() => expect(screen.getByText('Enter a number of days greater than 0.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(requests).toHaveLength(0);
  });

  it('surfaces a failed orgs list as a retryable error, and recovers', async () => {
    mockRpcError(OrgService, 'ListOrgs', 'unavailable', 'backend unreachable');
    renderPage();

    await waitFor(() => expect(screen.getByText(/Could not load this list: .*backend unreachable/)).toBeInTheDocument());
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Root Co')).toBeInTheDocument());
  });

  it('surfaces a failed members list as a retryable error, and recovers', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockRpcError(OrgService, 'ListOrgMembers', 'unavailable', 'backend unreachable');
    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Could not load this list: .*backend unreachable/)).toBeInTheDocument());
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
  });

  it('shows a message when there are no organizations', async () => {
    withRpc('ListOrgs', { organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No organizations yet.')).toBeDefined());
  });

  it('archives a root org after confirmation', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('ArchiveOrg', {});
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1' }));
  });

  it('does not archive an org when confirmation is cancelled', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('ArchiveOrg', {});
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('shows an error message when archiving an org fails', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockRpcError(OrgService, 'ArchiveOrg', 'unknown', 'cannot delete');
    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete organization/)).toBeDefined());
  });

  it('archives a child org after confirmation', async () => {
    withRpc('ListOrgs', {
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    const requests = withRpc('ArchiveOrg', {});
    renderPage();

    await waitFor(() => expect(screen.getByText('Child Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Child Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-child' }));
  });

  it('collapses and expands a parent org, hiding and reshowing its children', async () => {
    withRpc('ListOrgs', {
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
    withRpc('ListOrgs', {
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
    withRpc('ListOrgs', { organizations: [] });
    const requests = withRpc('SeedOrg', { organization: { id: 'org-new', name: '!!!', slug: 'org-123' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: '!!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0].slug).toMatch(/^org-\d+$/);
  });

  it('shows a pending label while creating an organization', async () => {
    withRpc('ListOrgs', { organizations: [] });
    const pending = mockRpcPending(OrgService, 'SeedOrg');
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'Pending Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    pending.resolve({ organization: { id: 'org-new', name: 'Pending Co', slug: 'pending-co' } });
  });

  it('does not select an org when an unrelated key is pressed', async () => {
    mockActiveOrgId = 'org-root';
    withRpc('ListOrgs', {
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
    withRpc('ListOrgs', { organizations: [] });
    const requests = withRpc('SeedOrg', {});
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.submit(screen.getByPlaceholderText('Organization name').closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('does not switch the active org when the seeded organization is not returned', async () => {
    withRpc('ListOrgs', { organizations: [] });
    const requests = withRpc('SeedOrg', {});
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New Organization' }));
    fireEvent.change(screen.getByPlaceholderText('Organization name'), { target: { value: 'No Org Back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(mockSetActiveOrgId).not.toHaveBeenCalled();
  });

  it('highlights the active root and child org with an "Active" badge', async () => {
    mockActiveOrgId = 'org-child';
    withRpc('ListOrgs', {
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(1));
  });

  it('selects a child org from the keyboard, because its name is a real button', async () => {
    withRpc('ListOrgs', {
      organizations: [
        { id: 'org-root', name: 'Root Co', slug: 'root-co' },
        { id: 'org-child', name: 'Child Co', slug: 'child-co', parentOrgId: 'org-root' },
      ],
    });
    renderPage();

    // The row used to be `role="button"` with Expand/Edit/Delete buttons inside
    // it, which is `nested-interactive` and had undefined activation behaviour.
    // The name carries the action now, so Enter and Space are the browser's job
    // rather than a hand-written keydown handler (M06-T14).
    const child = await screen.findByRole('button', { name: 'Child Co' });
    fireEvent.click(child);
    expect(mockSetActiveOrgId).toHaveBeenCalledWith('org-child');
  });

  it('does not nest the row action inside another button', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }] });
    renderPage();

    const name = await screen.findByRole('button', { name: 'Root Co' });
    // A native <button> carries no role *attribute*, so check the ancestry for
    // both spellings — the row's old `role="button"` wrapper is what this pins.
    expect(name.parentElement?.closest('button, [role="button"]')).toBeNull();
  });

  it('renames an org through the GUI', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('UpdateOrg', { organization: { id: 'org-1', name: 'Renamed Co', slug: 'renamed-co' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const nameInput = screen.getByDisplayValue('Root Co');
    const slugInput = screen.getByDisplayValue('root-co');
    fireEvent.change(nameInput, { target: { value: 'Renamed Co' } });
    fireEvent.change(slugInput, { target: { value: 'renamed-co' } });
    fireEvent.click(screen.getAllByText('Save')[0]);

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', name: 'Renamed Co', slug: 'renamed-co' }));
  });

  it('shows a pending label while saving a rename', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const pending = mockRpcPending(OrgService, 'UpdateOrg');

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    fireEvent.click(screen.getAllByText('Save')[0]);

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    pending.resolve({ organization: { id: 'org-1', name: 'Root Co', slug: 'root-co' } });
  });

  it('cancels editing an org without saving', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('UpdateOrg', {});

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByDisplayValue('Root Co')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Root Co')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when renaming an org fails', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    mockRpcError(OrgService, 'UpdateOrg', 'unknown', 'slug already exists');

    renderPage();

    await waitFor(() => expect(screen.getByText('Root Co')).toBeDefined());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Root Co' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    fireEvent.click(screen.getAllByText('Save')[0]);

    await waitFor(() => expect(screen.getByText(/Failed to update organization/)).toBeInTheDocument());
  });

  it('lists org members and removes one after confirmation', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    const requests = withRpc('RemoveOrgMember', { success: true });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', userId: 'user-1' }));
  });

  it('shows "No members found." when the org has no members', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [] });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText('No members found.')).toBeInTheDocument());
  });

  it('does not remove a member when confirmation is cancelled', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    const requests = withRpc('RemoveOrgMember', {});

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('shows an error message when removing a member fails', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    mockRpcError(OrgService, 'RemoveOrgMember', 'unknown', "cannot remove the organization's last owner");

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to remove member/)).toBeInTheDocument());
  });

  // M03-T07: the server caps a page at 100 rows, so reading one response would
  // show the first page and silently drop the rest. This mock returns two
  // pages; a component that ignores the cursor renders only Alice.
  it('follows the cursor until every member is loaded', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('ListOrgMembers', (body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { members: [{ userId: 'user-2', email: 'b@b.com', name: 'Bob', role: 'member' }], page: { totalCount: 2 } }
        : { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }], page: { nextCursor: 'cursor-2', totalCount: 2 } });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Bob/)).toBeInTheDocument());
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(requests[requests.length - 1]).toEqual(
      expect.objectContaining({ orgId: 'org-1', page: expect.objectContaining({ cursor: 'cursor-2' }) }),
    );
  });

  // M03-T08: search and the role facet are server-side. A client-side filter
  // over the loaded window would report "3 admins" for an org with 200 of them,
  // which reads as an answer rather than as a truncation.
  it('sends the search term to the server, debounced', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('ListOrgMembers', {
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 1 },
    });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'ali' } });

    await waitFor(
      () =>
        expect(requests).toContainEqual(
          expect.objectContaining({ page: expect.objectContaining({ filter: 'ali' }) }),
        ),
      { timeout: 2000 },
    );
  });

  it('sends the role facet to the server', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    const requests = withRpc('ListOrgMembers', {
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 1 },
    });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'viewer' } });

    await waitFor(() =>
      expect(requests).toContainEqual(expect.objectContaining({ role: 'viewer' })),
    );
  });

  it('reports the filtered total, not the page size', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', {
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 100001 },
    });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByTestId('member-count')).toHaveTextContent('Showing 1 of 100001'));
  });

  it('names the query when a search matches nothing, and offers a way back', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', (body: { page?: { filter?: string } }) =>
      body.page?.filter
        ? { members: [], page: { totalCount: 0 } }
        : { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }], page: { totalCount: 1 } });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'zzz' } });

    await waitFor(() => expect(screen.getByText(/No members match/)).toBeInTheDocument(), { timeout: 2000 });
    // "No members found." would say the organization is empty. It is not — the
    // search is.
    expect(screen.getByText('zzz')).toBeInTheDocument();
    expect(screen.getByText('Clear filters')).toBeInTheDocument();

    // The button is the way out of an empty search; leaving it untested means a
    // dead end nobody notices.
    fireEvent.click(screen.getByText('Clear filters'));
    await waitFor(() => expect((screen.getByLabelText('Search members') as HTMLInputElement).value).toBe(''));
  });

  it('exposes the true row count to assistive technology, not the windowed count', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', {
      members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
      page: { totalCount: 100001 },
    });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

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
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: many, page: { totalCount: 1000 } });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

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
    withRpc('ListOrgs', {
      organizations: [{ id: 'org-child', name: 'Alpha Child', slug: 'alpha-child', parentOrgId: 'org-parent' }],
      ancestors: [{ id: 'org-parent', name: 'Zeta Parent', slug: 'zeta-parent' }],
      page: {},
    });
    withRpc('ListOrgMembers', { members: [], page: { totalCount: 0 } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Zeta Parent')).toBeInTheDocument());
    expect(screen.getByText('Alpha Child')).toBeInTheDocument();
  });

  it('does not duplicate an organization that arrives as both a row and an ancestor', async () => {
    withRpc('ListOrgs', {
      organizations: [
        { id: 'org-parent', name: 'Zeta Parent', slug: 'zeta-parent' },
        { id: 'org-child', name: 'Alpha Child', slug: 'alpha-child', parentOrgId: 'org-parent' },
      ],
      ancestors: [{ id: 'org-parent', name: 'Zeta Parent', slug: 'zeta-parent' }],
      page: {},
    });
    withRpc('ListOrgMembers', { members: [], page: { totalCount: 0 } });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Zeta Parent')).toHaveLength(1));
  });

  // M03-T13: the whole invite loop must be reachable without the CLI.
  const openRoles = async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [], page: { totalCount: 0 } });
    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });
  };

  it('sends an invitation with the chosen role and clears the field', async () => {
    const requests = withRpc('InviteUser', { success: true });
    await openRoles();
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByText('Send invite'));

    await waitFor(() =>
      expect(requests).toContainEqual({ orgId: 'org-1', email: 'ada@example.com', role: 'viewer' }),
    );
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue(''));
  });

  it('keeps what was typed when sending fails', async () => {
    mockRpcError(OrgService, 'InviteUser', 'permission_denied', 'Admin role required in this organization');
    await openRoles();
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByText('Send invite'));

    await waitFor(() => expect(screen.getByText(/Failed to send invite/)).toBeInTheDocument());
    // Wiping the field on failure makes the user retype an address they typed.
    expect(screen.getByLabelText('Email address')).toHaveValue('ada@example.com');
  });

  it('marks a lapsed invitation as expired rather than showing a date to decode', async () => {
    withRpc('ListInvitations', {
      invitations: [
        { id: 'inv-1', email: 'live@example.com', role: 'member', expired: false },
        { id: 'inv-2', email: 'old@example.com', role: 'viewer', expired: true },
      ],
    });
    await openRoles();

    await waitFor(() => expect(screen.getByText('Pending invitations (2)')).toBeInTheDocument());
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('revokes an invitation after confirmation', async () => {
    withRpc('ListInvitations', {
      invitations: [{ id: 'inv-1', email: 'ada@example.com', role: 'member', expired: false }],
    });
    const requests = withRpc('RevokeInvitation', { success: true });
    await openRoles();

    await waitFor(() => expect(screen.getByLabelText('Revoke invitation for ada@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Revoke invitation for ada@example.com'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ invitationId: 'inv-1' }));
  });

  it('does not revoke when confirmation is cancelled', async () => {
    withRpc('ListInvitations', {
      invitations: [{ id: 'inv-1', email: 'ada@example.com', role: 'member', expired: false }],
    });
    const requests = withRpc('RevokeInvitation', {});
    await openRoles();

    await waitFor(() => expect(screen.getByLabelText('Revoke invitation for ada@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Revoke invitation for ada@example.com'));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('shows an error when revoking fails, and keeps the row', async () => {
    withRpc('ListInvitations', {
      invitations: [{ id: 'inv-1', email: 'ada@example.com', role: 'member', expired: false }],
    });
    mockRpcError(OrgService, 'RevokeInvitation', 'unknown', 'invitation not found');
    await openRoles();

    await waitFor(() => expect(screen.getByLabelText('Revoke invitation for ada@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Revoke invitation for ada@example.com'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to revoke/)).toBeInTheDocument());
    // The row stays, because the invitation still exists.
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('hides the whole section from someone who may not manage invitations', async () => {
    // listInvitations is admin-gated, so a denial is how the client learns the
    // caller is not an admin — rather than a role table copied into the client.
    mockRpcError(OrgService, 'ListInvitations', 'permission_denied', 'Admin role required in this organization');
    await openRoles();

    // The rest of the view still renders — only the invite section is absent.
    await waitFor(() => expect(screen.getByLabelText('Search members')).toBeInTheDocument());
    expect(screen.queryByText('Invite someone')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  // M03-T04: the server refuses to remove a member who still owns projects and
  // names them in the refusal. The ids are the actionable part, so this asserts
  // they reach the screen rather than just that "something failed" was shown.
  it('shows which projects block a member removal', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' }] });
    mockRpcError(OrgService, 'RemoveOrgMember', 'unknown', 'user still owns 2 project(s) in this organization - reassign them first: proj-alpha, proj-beta');

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/proj-alpha/)).toBeInTheDocument());
    expect(screen.getByText(/proj-beta/)).toBeInTheDocument();
  });

  it('changes a member\'s role via the role dropdown', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'member' }] });
    const requests = withRpc('UpdateOrgMemberRole', { member: { userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'admin' } });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Role for Alice'), { target: { value: 'admin' } });

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', userId: 'user-1', role: 'admin' }));
  });

  it('shows a plain "Owner" label instead of a role dropdown for an owner', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'owner' }] });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    expect(screen.getByText('Owner', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Alice')).toBeNull();
  });

  it('falls back to email, then userId, when a member has no name', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [
      { userId: 'user-2', email: 'noname@b.com', role: 'member' },
      { userId: 'user-3', role: 'viewer' },
    ] });

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText('noname@b.com')).toBeInTheDocument());
    expect(screen.getByText('user-3')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for noname@b.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for user-3')).toBeInTheDocument();
  });

  it('shows an error message when updating a member role fails', async () => {
    withRpc('ListOrgs', { organizations: [{ id: 'org-1', name: 'Root Co', slug: 'root-co' }], ancestors: [] });
    withRpc('ListOrgMembers', { members: [{ userId: 'user-1', email: 'a@b.com', name: 'Alice', role: 'member' }] });
    mockRpcError(OrgService, 'UpdateOrgMemberRole', 'unknown', 'owner role required');

    renderPage();
    fireEvent.mouseDown(screen.getByText('Roles & Permissions'), { button: 0 });

    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Role for Alice'), { target: { value: 'viewer' } });

    await waitFor(() => expect(screen.getByText(/Failed to update role/)).toBeInTheDocument());
  });
});
