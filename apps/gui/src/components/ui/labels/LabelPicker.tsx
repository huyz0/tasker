import { useState } from 'react';
import { useLabels } from './LabelContext';

export function LabelPicker() {
  const { state, actions } = useLabels();
  const [newLabelName, setNewLabelName] = useState('');

  const attachedIds = new Set(state.attached.map((l) => l.id));
  const unattached = state.available.filter((l) => !attachedIds.has(l.id));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    await actions.createLabel(newLabelName.trim());
    setNewLabelName('');
  };

  return (
    <div className="flex flex-col gap-2">
      {state.isError && (
        <p className="text-xs text-destructive">Failed to update labels: {state.error?.message}</p>
      )}
      {unattached.length > 0 && (
        <select
          value=""
          disabled={state.isLoading}
          onChange={(e) => {
            // The failure is already surfaced via state.isError/state.error
            // (from the mutation itself) - this catch only prevents an
            // unhandled promise rejection, since nothing else awaits this call.
            if (e.target.value) actions.attachLabel(e.target.value).catch(() => {});
          }}
          className="text-xs bg-transparent border rounded-md px-2 py-1"
        >
          <option value="">Attach a label...</option>
          {unattached.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newLabelName}
          onChange={(e) => setNewLabelName(e.target.value)}
          placeholder="New label name"
          disabled={state.isLoading}
          className="flex-1 text-xs bg-transparent border rounded-md px-2 py-1"
        />
        <button
          type="submit"
          disabled={state.isLoading || !newLabelName.trim()}
          className="text-xs px-2 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md disabled:opacity-50"
        >
          Create & attach
        </button>
      </form>
    </div>
  );
}
