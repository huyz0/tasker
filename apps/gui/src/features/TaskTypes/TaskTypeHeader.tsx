import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { TaskTypeService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { useScopedTo } from '../../hooks/useScope';
import { Breadcrumbs } from '../../components/layout/Breadcrumbs';

const typeClient = createClient(TaskTypeService, transport);

/**
 * What is open in the task type detail pane, and its way back out.
 *
 * A sibling file rather than more of `index.tsx`, which sits exactly on
 * `coding-standard.md`'s 400-line cap: the trail this task adds had nowhere
 * to go there. The heading and its rename form come along because they are
 * the same thing — the identity of the type being edited — and the rename
 * mutation belongs next to the name it changes.
 *
 * **No project crumb.** Task types are organization-scoped: `listTaskTypes`
 * takes an `orgId`, `createTaskType` sends `projectId: ''`, and the same type
 * is used by every project in the organization. A project crumb would name a
 * parent the type does not have, and following it would be a link to
 * somewhere the type is not. The organization *would* be the honest parent —
 * but no `getOrg`-by-id RPC exists to resolve its name (`useScopeLabels`
 * records why), so the trail starts at the list.
 *
 * Mounted with `key={typeId}` by the screen, so opening a different type
 * resets an in-progress rename rather than carrying the previous type's
 * draft across.
 */
export function TaskTypeHeader({ typeId, name }: { typeId: string; name: string }) {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const scopedTo = useScopedTo();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // M14-T09: rename lives here now, next to the statuses/transitions it
  // renames alongside — the Projects screen used to offer a second,
  // partial copy of this same edit with no visibility into either.
  const updateType = useMutation({
    mutationFn: async (next: string) => await typeClient.updateTaskType({ id: typeId, name: next }),
    onSuccess: () => {
      setIsRenaming(false);
      queryClient.invalidateQueries({ queryKey: ['taskTypes', activeOrgId] });
    },
  });

  return (
    <section>
      {/* A type reached by a deep link has no history behind it: the browser's
          Back button leaves the app. */}
      <Breadcrumbs
        className="mb-2"
        items={[
          { label: 'Task Types', to: scopedTo('/task-types') },
          { label: name || 'Task type' },
        ]}
      />
      {isRenaming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) updateType.mutate(renameValue.trim()); }}
        >
          <label className="sr-only" htmlFor="rename-task-type">Task type name</label>
          <input
            id="rename-task-type"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="text-lg font-semibold tracking-tight bg-transparent border-b outline-none focus:border-primary"
          />
          <button type="submit" disabled={!renameValue.trim() || updateType.isPending} className="text-sm text-primary disabled:opacity-50">
            {updateType.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setIsRenaming(false)} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
          <button
            onClick={() => { setIsRenaming(true); setRenameValue(name); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Rename
          </button>
        </div>
      )}
      {updateType.isError && (
        <p className="text-sm text-destructive mt-1">Failed to rename: {(updateType.error as Error).message}</p>
      )}
    </section>
  );
}
