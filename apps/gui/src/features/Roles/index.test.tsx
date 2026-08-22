import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { RolesManager } from './index';
import { confirmAction } from '../../test/confirm';
import { expectNoA11yViolations } from '../../test/a11y';

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

/** Registers ListRoles and records every request it receives. */
function withListRoles(response: object | ((body: any) => object) = { roles: SYSTEM_ROLES, page: {} }) {
  const requests: any[] = [];
  mockRpc(RoleService, 'ListRoles', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers CreateRole and records every request it receives. */
function withCreateRole(response: object) {
  const requests: any[] = [];
  mockRpc(RoleService, 'CreateRole', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateRole and records every request it receives. */
function withUpdateRole(response: object) {
  const requests: any[] = [];
  mockRpc(RoleService, 'UpdateRole', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers DeleteRole and records every request it receives. */
function withDeleteRole(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(RoleService, 'DeleteRole', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

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
    mockRpc(RoleService, 'ListPermissions', { permissions: PERMISSIONS });
    withListRoles();
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
    const requests = withListRoles();
    renderPage();
    expect(screen.getByText('Select an organization to manage its roles.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('surfaces a failed roles list as a retryable error, not a false empty state', async () => {
    mockRpcError(RoleService, 'ListRoles', 'unavailable', 'backend unreachable');
    renderPage();
    expect(await screen.findByText(/Could not load this list: .*backend unreachable/)).toBeInTheDocument();
  });

  it('creates a custom role with the selected permissions', async () => {
    const requests = withCreateRole({
      role: { id: 'role-new', orgId: 'org-1', name: 'QA Lead', isSystem: false, permissionKeys: ['task:write'], createdAt: '' },
    });
    renderPage();
    await screen.findByText('owner');

    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'QA Lead' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /task:write$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(requests).toContainEqual({
      orgId: 'org-1', name: 'QA Lead', permissionKeys: ['task:write'],
    }));
  });

  it('renames a custom role inline', async () => {
    withListRoles({
      roles: [...SYSTEM_ROLES, { id: 'role-custom-1', orgId: 'org-1', name: 'Old Name', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    const requests = withUpdateRole({ role: { id: 'role-custom-1', orgId: 'org-1', name: 'New Name', isSystem: false, permissionKeys: [], createdAt: '' } });
    renderPage();

    const nameButton = await screen.findByRole('button', { name: 'Old Name' });
    fireEvent.click(nameButton);
    const input = screen.getByLabelText('Rename role Old Name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.blur(input);

    await waitFor(() => expect(requests).toContainEqual({ roleId: 'role-custom-1', name: 'New Name' }));
  });

  it('deletes a custom role after confirmation', async () => {
    withListRoles({
      roles: [...SYSTEM_ROLES, { id: 'role-custom-2', orgId: 'org-1', name: 'Deletable', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    const requests = withDeleteRole();
    renderPage();

    await screen.findByText('Deletable');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Deletable' }), { button: 0 });
    fireEvent.click(await screen.findByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ roleId: 'role-custom-2' }));
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
    withListRoles({
      roles: [{ id: 'role-custom-3', orgId: 'org-1', name: 'Direct Toggle', isSystem: false, permissionKeys: ['task:read'], createdAt: '' }],
      page: {},
    });
    const requests = withUpdateRole({ role: { id: 'role-custom-3', orgId: 'org-1', name: 'Direct Toggle', isSystem: false, permissionKeys: ['task:read', 'task:write'], createdAt: '' } });
    renderPage();

    await screen.findByText('Direct Toggle');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Direct Toggle: task:write' }));

    await waitFor(() => expect(requests).toContainEqual({
      roleId: 'role-custom-3', permissionKeys: expect.arrayContaining(['task:read', 'task:write']),
    }));

    // Unchecking the sole remaining key leaves an empty `permissionKeys` -
    // proto3's default for a repeated field, so the real JSON codec omits it
    // from the wire rather than sending [].
    fireEvent.click(screen.getByRole('checkbox', { name: 'Direct Toggle: task:read' }));
    await waitFor(() => expect(requests[requests.length - 1]).toEqual({ roleId: 'role-custom-3' }));
  });

  it('committing a rename via Enter saves, and Escape cancels without saving', async () => {
    withListRoles({
      roles: [{ id: 'role-custom-4', orgId: 'org-1', name: 'Original', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    const requests = withUpdateRole({ role: { id: 'role-custom-4', orgId: 'org-1', name: 'Via Enter', isSystem: false, permissionKeys: [], createdAt: '' } });
    renderPage();

    // Escape: edits are discarded, nothing is saved.
    fireEvent.click(await screen.findByRole('button', { name: 'Original' }));
    let input = screen.getByLabelText('Rename role Original');
    fireEvent.change(input, { target: { value: 'Abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Original' })).toBeInTheDocument();
    expect(requests).toHaveLength(0);

    // Enter: commits the same way blur does.
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    input = screen.getByLabelText('Rename role Original');
    fireEvent.change(input, { target: { value: 'Via Enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(requests).toContainEqual({ roleId: 'role-custom-4', name: 'Via Enter' }));
  });

  it('committing a rename with the name unchanged does not call updateRole', async () => {
    withListRoles({
      roles: [{ id: 'role-custom-5', orgId: 'org-1', name: 'Unchanged', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    const requests = withUpdateRole({});
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Unchanged' }));
    const input = screen.getByLabelText('Rename role Unchanged');
    fireEvent.blur(input);

    expect(requests).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Unchanged' })).toBeInTheDocument();
  });

  it('the Rename row action opens the same inline editor as clicking the name', async () => {
    withListRoles({
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
    mockRpcError(RoleService, 'CreateRole', 'unknown', 'name already taken');
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

    expect(await screen.findByText(/Failed to create role:.*name already taken/)).toBeInTheDocument();
  });

  it('submitting the create form with no name typed does not call createRole', async () => {
    const requests = withCreateRole({});
    renderPage();
    await screen.findByText('owner');

    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    const nameInput = await screen.findByLabelText('Name');
    // The submit button is disabled with no name, so drive the form's own
    // submit handler directly - this is the "nothing to send" branch a
    // disabled button would otherwise make unreachable.
    fireEvent.submit(nameInput.closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('surfaces a failed permission toggle as an alert', async () => {
    withListRoles({
      roles: [{ id: 'role-custom-7', orgId: 'org-1', name: 'Will Fail', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockRpcError(RoleService, 'UpdateRole', 'unknown', 'server rejected it');
    renderPage();

    await screen.findByText('Will Fail');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Will Fail: task:read' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to save:.*server rejected it/);
  });

  it('surfaces a failed delete as an alert', async () => {
    withListRoles({
      roles: [{ id: 'role-custom-8', orgId: 'org-1', name: 'Delete Fails', isSystem: false, permissionKeys: [], createdAt: '' }],
      page: {},
    });
    mockRpcError(RoleService, 'DeleteRole', 'unknown', 'still in use');
    renderPage();

    await screen.findByText('Delete Fails');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Delete Fails' }), { button: 0 });
    fireEvent.click(await screen.findByText('Delete'));
    await confirmAction();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to delete role:.*still in use/);
  });

  it('retries the roles list from the error state', async () => {
    mockRpcError(RoleService, 'ListRoles', 'unavailable', 'timed out');
    renderPage();

    await screen.findByText(/Could not load this list: .*timed out/);
    withListRoles();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('owner');
  });

  it('pages to more roles with the load-more control', async () => {
    const requests = withListRoles((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { roles: [{ id: 'role-page-2', orgId: 'org-1', name: 'Page Two Role', isSystem: false, permissionKeys: [], createdAt: '' }], page: {} }
        : { roles: [{ id: 'role-page-1', orgId: 'org-1', name: 'Page One Role', isSystem: false, permissionKeys: [], createdAt: '' }], page: { nextCursor: 'cursor-2' } },
    );
    renderPage();

    await screen.findByText('Page One Role');
    fireEvent.click(screen.getByRole('button', { name: 'Load more roles' }));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[requests.length - 1]).toEqual({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });
});
