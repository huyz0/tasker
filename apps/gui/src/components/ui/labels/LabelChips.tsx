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
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-foreground"
          style={label.color ? { borderColor: label.color } : undefined}
        >
          {/* The colour is a swatch, not the text colour. It is user data — any
              value is pickable, including ones that fail contrast against the
              card (a plain grey label measured 3.54:1) — so the name must stay
              readable no matter what was chosen (M06-T14). */}
          {label.color && (
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: label.color }}
            />
          )}
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
