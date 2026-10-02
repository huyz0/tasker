import { useState } from 'react';

/**
 * A small inline "add new item" form: a text input that submits a trimmed,
 * non-empty value on Enter/submit, and cancels itself (via onCancel) if
 * blurred while empty. Used for the folder-create and artifact-create forms
 * in ArtifactsBrowser, which were previously near-identical copies.
 */
export function InlineCreateForm({
  placeholder,
  onSubmit,
  onCancel,
  isSubmitting = false,
  className = 'flex gap-1 px-1 pb-1',
  inputClassName = 'border p-1 rounded text-xs flex-1 bg-background',
  buttonClassName = 'text-xs px-2 rounded bg-primary text-primary-foreground disabled:bg-primary-subtle disabled:text-primary-subtle-foreground',
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
}) {
  const [value, setValue] = useState('');

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      {/* autoFocus is deliberate: this form only mounts after the person
          clicked "add" (every caller gates it on an isAdding-style flag), so
          the caret belongs in the field they asked for. Never render it on
          page load - autofocus there would steal focus and scroll. */}
      <input
        autoFocus
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (!value.trim()) onCancel(); }}
        className={inputClassName}
      />
      <button type="submit" disabled={isSubmitting || !value.trim()} className={buttonClassName}>
        Add
      </button>
    </form>
  );
}
