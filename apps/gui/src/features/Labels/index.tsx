import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { LabelService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const labelClient = createClient(LabelService, transport);

export function LabelsManager() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Labels'), [setActivePageTitle]);
  const queryClient = useQueryClient();

  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');

  const { data: labelsData, isLoading } = useQuery({
    queryKey: ['labels', activeOrgId],
    queryFn: async () => {
      const resp = await labelClient.listLabels({ orgId: activeOrgId });
      return resp.labels;
    },
    enabled: !!activeOrgId,
  });

  const createLabelMutation = useMutation({
    mutationFn: async () => {
      await labelClient.createLabel({ orgId: activeOrgId, name: newLabelName, color: newLabelColor });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', activeOrgId] });
      setNewLabelName('');
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Labels</h1>
        <p className="text-muted-foreground mt-1">Labels defined for this organization, used to tag tasks and artifacts.</p>
      </div>

      <div className="border rounded-lg bg-card p-6 shadow-sm max-w-xl">
        <h2 className="text-lg font-medium mb-4">Create a label</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); createLabelMutation.mutate(); }}
          className="flex items-center gap-3"
        >
          <input
            type="color"
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
            className="h-9 w-9 rounded-md border cursor-pointer bg-transparent"
            aria-label="Label color"
          />
          <input
            type="text"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            placeholder="Label name"
            className="flex-1 text-sm bg-transparent border rounded-md px-3 py-2"
          />
          <button
            type="submit"
            disabled={createLabelMutation.isPending || !newLabelName.trim() || !activeOrgId}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md font-medium disabled:opacity-50"
          >
            {createLabelMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </form>
        {createLabelMutation.isError && (
          <p className="text-sm text-destructive mt-3">Failed to create label: {(createLabelMutation.error as Error).message}</p>
        )}
      </div>

      <div className="border rounded-lg bg-card p-6 shadow-sm max-w-xl">
        <h2 className="text-lg font-medium mb-4">All labels</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading labels...</p>
        ) : labelsData && labelsData.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {labelsData.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full border"
                style={label.color ? { borderColor: label.color, color: label.color } : undefined}
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No labels created yet.</p>
        )}
      </div>
    </div>
  );
}
