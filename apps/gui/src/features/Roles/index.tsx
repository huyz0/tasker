import { memo, useMemo, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { RoleService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { VirtualList } from '../../components/ui/VirtualList';
import { ListState } from '../../components/ui/ListState';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/button';

const roleClient = createClient(RoleService, transport);

// A fixed height (M07-T14's own rationale in VirtualList.tsx: measuring each
// row instead makes the scrollbar jump as rows are measured). Every row
// renders exactly one line of checkboxes, so this never varies.
const ROLE_ROW_HEIGHT = 44;

/** One permission column's toggle state for one role. Not persisted until the row's own save fires. */
type PermissionKeySet = ReadonlySet<string>;

function permissionSet(role: { permissionKeys: string[] }): PermissionKeySet {
  return new Set(role.permissionKeys);
}

/**
 * One role's row in the matrix: its name (editable inline for a custom
 * role), and one checkbox per permission column. Memoised for the same
 * reason `Organizations`' `MemberRow` is - the virtualizer re-renders this
 * screen on almost every scroll frame, and without memo every visible row
 * (each holding up to 32 checkboxes) re-renders for the one or two that
 * actually entered the viewport.
 */
const RoleRow = memo(function RoleRow({
  role, permissions, isBusy, onTogglePermission, onRename, onDelete,
}: {
  role: { id: string; name: string; isSystem: boolean; permissionKeys: string[] };
  permissions: { key: string; description: string }[];
  isBusy: boolean;
  onTogglePermission: (roleId: string, key: string, next: PermissionKeySet) => void;
  onRename: (roleId: string, name: string) => void;
  onDelete: (roleId: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(role.name);
  const held = permissionSet(role);

  const commitRename = () => {
    setEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== role.name) onRename(role.id, trimmed);
    else setDraftName(role.name);
  };

  return (
    <div className="grid items-center gap-2 border-b px-3 text-sm" style={{ gridTemplateColumns: `220px repeat(${permissions.length}, 84px) 40px` }}>
      <div className="min-w-0 truncate font-medium flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draftName}
            disabled={isBusy}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setDraftName(role.name); setEditing(false); }
            }}
            aria-label={`Rename role ${role.name}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
        ) : role.isSystem ? (
          <span className="truncate">{role.name}</span>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="truncate text-left hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
          >
            {role.name}
          </button>
        )}
        {role.isSystem && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">System</span>
        )}
      </div>
      {permissions.map((p) => (
        <div key={p.key} className="flex justify-center">
          <input
            type="checkbox"
            aria-label={`${role.name}: ${p.key}`}
            checked={held.has(p.key)}
            disabled={role.isSystem || isBusy}
            onChange={(e) => {
              const next = new Set(held);
              if (e.target.checked) next.add(p.key); else next.delete(p.key);
              onTogglePermission(role.id, p.key, next);
            }}
          />
        </div>
      ))}
      <div className="flex justify-end">
        {!role.isSystem && (
          <RowActionsMenu
            label={`Actions for ${role.name}`}
            actions={[
              { label: 'Rename', onClick: () => setEditing(true), managesFocusOnSelect: true },
              { label: 'Delete', destructive: true, onClick: () => onDelete(role.id, role.name) },
            ]}
          />
        )}
      </div>
    </div>
  );
});

function CreateRoleDialog({ open, onClose, orgId, permissions }: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  permissions: { key: string; description: string }[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const createMutation = useMutation({
    mutationFn: () => roleClient.createRole({ orgId, name: name.trim(), permissionKeys: [...selected] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', orgId] });
      setName('');
      setSelected(new Set());
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title="Create role">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="new-role-name" className="text-sm font-medium">Name</label>
          <input
            id="new-role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. QA Lead"
          />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium mb-1">Permissions</legend>
          <div className="max-h-64 overflow-y-auto rounded-md border p-2 grid grid-cols-2 gap-1">
            {permissions.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(p.key)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(p.key); else next.delete(p.key);
                    setSelected(next);
                  }}
                />
                <span title={p.description}>{p.key}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {createMutation.isError && (
          <p className="text-sm text-destructive">Failed to create role: {(createMutation.error as Error).message}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create role'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RolesManager() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: permissions, isLoading: permissionsLoading, error: permissionsError } = useQuery({
    queryKey: ['permissions', activeOrgId],
    queryFn: async () => (await roleClient.listPermissions({ orgId: activeOrgId })).permissions,
    enabled: !!activeOrgId,
  });

  const {
    data: rolesPages, isLoading: rolesLoading, error: rolesError, refetch: refetchRoles,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['roles', activeOrgId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      roleClient.listRoles({ orgId: activeOrgId, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!activeOrgId,
  });
  const roles = useMemo(() => rolesPages?.pages.flatMap((p) => p.roles) ?? [], [rolesPages]);

  const updateMutation = useMutation({
    mutationFn: (vars: { roleId: string; name?: string; permissionKeys?: string[] }) => roleClient.updateRole(vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles', activeOrgId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => roleClient.deleteRole({ roleId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles', activeOrgId] }),
  });

  const handleTogglePermission = (roleId: string, _key: string, next: PermissionKeySet) => {
    updateMutation.mutate({ roleId, permissionKeys: [...next] });
  };
  const handleRename = (roleId: string, name: string) => {
    updateMutation.mutate({ roleId, name });
  };
  const handleDelete = async (roleId: string, name: string) => {
    if (await confirm({
      title: `Delete the "${name}" role?`,
      consequence: 'Anyone or any team currently granted this role loses the access it carries.',
      undo: null,
      confirmLabel: 'Delete role',
    })) {
      deleteMutation.mutate(roleId);
    }
  };

  if (!activeOrgId) {
    return <p className="p-4 text-sm text-muted-foreground">Select an organization to manage its roles.</p>;
  }

  const isLoading = permissionsLoading || rolesLoading;
  const error = permissionsError || rolesError;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Roles</h1>
          <p className="text-sm text-muted-foreground">
            The four built-in roles apply to every organization. Custom roles are yours to define.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create role</Button>
      </div>

      {updateMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Failed to save: {(updateMutation.error as Error).message}
        </p>
      )}
      {deleteMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Failed to delete role: {(deleteMutation.error as Error).message}
        </p>
      )}

      <ListState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && roles.length === 0}
        loadingMessage="Loading roles…"
        emptyMessage="No roles yet."
        onRetry={() => refetchRoles()}
      >
        {permissions && (
          <div className="rounded-md border overflow-x-auto">
            <div
              className="grid items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sticky top-0"
              style={{ gridTemplateColumns: `220px repeat(${permissions.length}, 84px) 40px` }}
            >
              <div>Role</div>
              {permissions.map((p) => (
                <div key={p.key} title={p.description} className="truncate text-center" style={{ writingMode: 'vertical-rl' }}>
                  {p.key}
                </div>
              ))}
              <div />
            </div>
            <VirtualList
              items={roles}
              rowHeight={ROLE_ROW_HEIGHT}
              className="max-h-[60vh] overflow-y-auto"
              renderRow={(role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  permissions={permissions}
                  isBusy={updateMutation.isPending || deleteMutation.isPending}
                  onTogglePermission={handleTogglePermission}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              )}
            />
            {hasNextPage && (
              <div className="p-2 text-center border-t">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more roles'}
                </button>
              </div>
            )}
          </div>
        )}
      </ListState>

      {permissions && (
        <CreateRoleDialog open={createOpen} onClose={() => setCreateOpen(false)} orgId={activeOrgId} permissions={permissions} />
      )}
      {confirmDialog}
    </div>
  );
}
