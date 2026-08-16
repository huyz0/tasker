import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RolesManager } from './index';
import { confirmAction } from '../../test/confirm';
import { expectNoA11yViolations } from '../../test/a11y';

const { mockListPermissions, mockListRoles, mockCreateRole, mockUpdateRole, mockDeleteRole } = vi.hoisted(() => ({
  mockListPermissions: vi.fn(),
  mockListRoles: vi.fn(),
  mockCreateRole: vi.fn(),
  mockUpdateRole: vi.fn(),
  mockDeleteRole: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    listPermissions: mockListPermissions,
    listRoles: mockListRoles,
    createRole: mockCreateRole,
    updateRole: mockUpdateRole,
    deleteRole: mockDeleteRole,
  })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ RoleService: {} }));

let mockActiveOrgId = 'org-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
  })),
}));

const SYSTEM_ROLES = [
  { id: 'role-owner', orgId: '', name: 'owner', isSystem: true, permissionKeys: ['org:owner', 'org:read'], createdAt: '' },
  { id: 'role-admin', orgId: '', name: 'admin', isSystem: true, permissionKeys: ['org:admin', 'org:read'], createdAt: '' },
  { id: 'role-member', orgId: '', name: 'member', isSystem: true, permissionKeys: ['task:write', 'task:read'], createdAt: '' },
  { id: 'role-viewer', orgId: '', name: 'viewer', isSystem: true, permissionKeys: ['task:read'], createdAt: '' },
];

const PERMISSIONS = [
  { key: 'task:read', description: 'View tasks' },
  { key: 'task:write', description: 'Create and edit tasks' },
  { key: 'org:read', description: 'View organization details' },
  { key: 'org:admin', description: 'Manage organization settings' },
  { key: 'org:owner', description: 'Transfer or delete the organization' },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RolesManager />
    </QueryClientProvider>
  );
}

describe('RolesManager', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockListPermissions.mockReset();
    mockListRoles.mockReset();
    mockCreateRole.mockReset();
    mockUpdateRole.mockReset();
    mockDeleteRole.mockReset();
    mockListPermissions.mockResolvedValue({ permissions: PERMISSIONS });
    mockListRoles.mockResolvedValue({ roles: SYSTEM_ROLES, page: {} });
  });

  it('renders the header and the system roles', async () => {
    renderPage();
    expect(screen.getByText('Roles')).toBeInTheDocument();
    // jsdom gives the virtualized list's scroll container no height, so only
    // the first row (plus overscan) actually renders - the first system role
    // returned is enough to prove the list reached the DOM.
    expect(await screen.findByText('owner')).toBeInTheDocument();
  });

  it('shows a prompt instead of a request when no organization is selected', () => {
    mockActiveOrgId = '';
    renderPage();
    expect(screen.getByText('Select an organization to manage its roles.')).toBeInTheDocument();
    expect(mockListRoles).not.toHaveBeenCalled();
  });

  it('surfaces a failed roles list as a retryable error, not a false empty state', async () => {
    mockListRoles.mockRejectedValue(new Error('backend unreachable'));
    renderPage();
    expect(await screen.findByText(/Could not load this list: backend unreachable/)).toBeInTheDocument();
  });

  it('creates a custom role with the selected permissions', async () => {
    mockCreateRole.mockResolvedValue({
      role: { id: 'role-new', orgId: 'org-1', name: 'QA Lead', isSystem: false, permissionKeys: ['task:write'], createdAt: '' },
    });
    renderPage();
    await screen.findByText('owner');

    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'QA Lead' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /task:write$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(mockCreateRole).toHaveBeenCalledWith({
      orgId: 'org-1', name: 'QA Lead', permissionKeys: ['task:write'],
    }));
  });

  it('renames a custom role inline', async () => {
    mockListRoles.mockResolvedValue({
      roles: [...SYSTEM_ROLES, { id: 'role-custom-1', orgId: 'org-1', name: 'Old Name', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockUpdateRole.mockResolvedValue({ role: { id: 'role-custom-1', orgId: 'org-1', name: 'New Name', isSystem: false, permissionKeys: [], createdAt: '' } });
    renderPage();

    const nameButton = await screen.findByRole('button', { name: 'Old Name' });
    fireEvent.click(nameButton);
    const input = screen.getByLabelText('Rename role Old Name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.blur(input);

    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalledWith({ roleId: 'role-custom-1', name: 'New Name' }));
  });

  it('deletes a custom role after confirmation', async () => {
    mockListRoles.mockResolvedValue({
      roles: [...SYSTEM_ROLES, { id: 'role-custom-2', orgId: 'org-1', name: 'Deletable', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockDeleteRole.mockResolvedValue({ success: true });
    renderPage();

    await screen.findByText('Deletable');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Deletable' }), { button: 0 });
    fireEvent.click(await screen.findByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(mockDeleteRole).toHaveBeenCalledWith({ roleId: 'role-custom-2' }));
  });

  it('a system role has no actions menu and its checkboxes are disabled', async () => {
    renderPage();
    await screen.findByText('owner');

    expect(screen.queryByRole('button', { name: 'Actions for owner' })).not.toBeInTheDocument();
    const ownerReadCheckbox = screen.getByRole('checkbox', { name: 'owner: org:read' }) as HTMLInputElement;
    expect(ownerReadCheckbox.disabled).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    await screen.findByText('owner');
    await expectNoA11yViolations(container);
  });

  it('toggling a permission checkbox directly on a custom role row saves it', async () => {
    mockListRoles.mockResolvedValue({
      roles: [{ id: 'role-custom-3', orgId: 'org-1', name: 'Direct Toggle', isSystem: false, permissionKeys: ['task:read'], createdAt: '' }],
      page: {},
    });
    mockUpdateRole.mockResolvedValue({ role: { id: 'role-custom-3', orgId: 'org-1', name: 'Direct Toggle', isSystem: false, permissionKeys: ['task:read', 'task:write'], createdAt: '' } });
    renderPage();

    await screen.findByText('Direct Toggle');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Direct Toggle: task:write' }));

    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalledWith({
      roleId: 'role-custom-3', permissionKeys: expect.arrayContaining(['task:read', 'task:write']),
    }));

    // Unchecking removes it from the set sent to the server.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Direct Toggle: task:read' }));
    await waitFor(() => expect(mockUpdateRole).toHaveBeenLastCalledWith({
      roleId: 'role-custom-3', permissionKeys: expect.not.arrayContaining(['task:read']),
    }));
  });

  it('committing a rename via Enter saves, and Escape cancels without saving', async () => {
    mockListRoles.mockResolvedValue({
      roles: [{ id: 'role-custom-4', orgId: 'org-1', name: 'Original', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockUpdateRole.mockResolvedValue({ role: { id: 'role-custom-4', orgId: 'org-1', name: 'Via Enter', isSystem: false, permissionKeys: [], createdAt: '' } });
    renderPage();

    // Escape: edits are discarded, nothing is saved.
    fireEvent.click(await screen.findByRole('button', { name: 'Original' }));
    let input = screen.getByLabelText('Rename role Original');
    fireEvent.change(input, { target: { value: 'Abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Original' })).toBeInTheDocument();
    expect(mockUpdateRole).not.toHaveBeenCalled();

    // Enter: commits the same way blur does.
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    input = screen.getByLabelText('Rename role Original');
    fireEvent.change(input, { target: { value: 'Via Enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalledWith({ roleId: 'role-custom-4', name: 'Via Enter' }));
  });

  it('committing a rename with the name unchanged does not call updateRole', async () => {
    mockListRoles.mockResolvedValue({
      roles: [{ id: 'role-custom-5', orgId: 'org-1', name: 'Unchanged', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Unchanged' }));
    const input = screen.getByLabelText('Rename role Unchanged');
    fireEvent.blur(input);

    expect(mockUpdateRole).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unchanged' })).toBeInTheDocument();
  });

  it('the Rename row action opens the same inline editor as clicking the name', async () => {
    mockListRoles.mockResolvedValue({
      roles: [{ id: 'role-custom-6', orgId: 'org-1', name: 'Via Menu', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    renderPage();

    await screen.findByText('Via Menu');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Via Menu' }), { button: 0 });
    fireEvent.click(await screen.findByText('Rename'));

    expect(await screen.findByLabelText('Rename role Via Menu')).toBeInTheDocument();
  });

  it('surfaces a failed create as an inline error and unchecking a permission removes it from the request', async () => {
    mockCreateRole.mockRejectedValue(new Error('name already taken'));
    renderPage();
    await screen.findByText('owner');

    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Dup' } });
    // Check then uncheck the same box - exercises both branches of the
    // dialog's own toggle handler, and proves the unchecked key is not sent.
    const checkbox = screen.getByRole('checkbox', { name: /task:write$/ });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(mockCreateRole).toHaveBeenCalledWith({ orgId: 'org-1', name: 'Dup', permissionKeys: [] }));
    expect(await screen.findByText(/Failed to create role: name already taken/)).toBeInTheDocument();
  });

  it('submitting the create form with no name typed does not call createRole', async () => {
    renderPage();
    await screen.findByText('owner');

    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    const nameInput = await screen.findByLabelText('Name');
    // The submit button is disabled with no name, so drive the form's own
    // submit handler directly - this is the "nothing to send" branch a
    // disabled button would otherwise make unreachable.
    fireEvent.submit(nameInput.closest('form')!);

    expect(mockCreateRole).not.toHaveBeenCalled();
  });

  it('surfaces a failed permission toggle as an alert', async () => {
    mockListRoles.mockResolvedValue({
      roles: [{ id: 'role-custom-7', orgId: 'org-1', name: 'Will Fail', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockUpdateRole.mockRejectedValue(new Error('server rejected it'));
    renderPage();

    await screen.findByText('Will Fail');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Will Fail: task:read' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save: server rejected it');
  });

  it('surfaces a failed delete as an alert', async () => {
    mockListRoles.mockResolvedValue({
      roles: [{ id: 'role-custom-8', orgId: 'org-1', name: 'Delete Fails', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockDeleteRole.mockRejectedValue(new Error('still in use'));
    renderPage();

    await screen.findByText('Delete Fails');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Delete Fails' }), { button: 0 });
    fireEvent.click(await screen.findByText('Delete'));
    await confirmAction();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete role: still in use');
  });

  it('retries the roles list from the error state', async () => {
    mockListRoles.mockRejectedValueOnce(new Error('timed out')).mockResolvedValue({ roles: SYSTEM_ROLES, page: {} });
    renderPage();

    await screen.findByText(/Could not load this list: timed out/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('owner');
    expect(mockListRoles).toHaveBeenCalledTimes(2);
  });

  it('pages to more roles with the load-more control', async () => {
    mockListRoles.mockResolvedValueOnce({
      roles: [{ id: 'role-page-1', orgId: 'org-1', name: 'Page One Role', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: { nextCursor: 'cursor-2' },
    }).mockResolvedValueOnce({
      roles: [{ id: 'role-page-2', orgId: 'org-1', name: 'Page Two Role', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    renderPage();

    await screen.findByText('Page One Role');
    fireEvent.click(screen.getByRole('button', { name: 'Load more roles' }));

    await waitFor(() => expect(mockListRoles).toHaveBeenCalledTimes(2));
    expect(mockListRoles).toHaveBeenLastCalledWith({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });
});
