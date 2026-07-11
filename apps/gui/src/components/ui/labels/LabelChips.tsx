import { useLabels } from './LabelContext';

export function LabelChips({ emptyMessage = 'No labels attached.' }: { emptyMessage?: string }) {
  const { state, actions } = useLabels();

  if (state.attached.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {state.attached.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
          style={label.color ? { borderColor: label.color, color: label.color } : undefined}
        >
          {label.name}
          <button
            onClick={() => actions.detachLabel(label.id)}
            className="hover:opacity-70"
            aria-label={`Remove label ${label.name}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
