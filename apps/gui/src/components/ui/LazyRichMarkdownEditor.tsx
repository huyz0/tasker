import { Suspense, lazy } from 'react';

/**
 * `RichMarkdownEditor` with its code-split boundary already attached.
 *
 * `@mdxeditor/editor` pulls in Lexical — real weight that should not load for
 * a user who never opens an editor (ADR-0018). M23 wired that split by hand at
 * its single pilot call site in `Tasks/index.tsx`. Now that the pilot has
 * proven out and the editor is reaching comments and artifact content, the
 * `lazy(...)` + `<Suspense>` pair lives here once instead of being copied to
 * every new caller — four hand-rolled copies would be four chances for the
 * fallback, the import path, or the chunk boundary to drift apart.
 *
 * Same props as `RichMarkdownEditor` itself, so it substitutes directly.
 */
const RichMarkdownEditor = lazy(() =>
  import('./RichMarkdownEditor').then((m) => ({ default: m.RichMarkdownEditor })),
);

export function LazyRichMarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}) {
  return (
    <Suspense
      fallback={
        // role="status" so a screen reader is told the editor is coming rather
        // than finding an empty region where the field was.
        <div role="status" className="text-sm text-muted-foreground rounded-md border bg-background px-2 py-1">
          Loading editor…
        </div>
      }
    >
      <RichMarkdownEditor value={value} onChange={onChange} placeholder={placeholder} className={className} readOnly={readOnly} />
    </Suspense>
  );
}
