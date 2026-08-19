import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  CreateLink,
  UndoRedo,
  BlockTypeSelect,
  Separator,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./RichMarkdownEditor.css";

export interface RichMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * A WYSIWYG markdown editor: formats while you type, no raw-markdown /
 * preview mode switch. Wraps `@mdxeditor/editor` (ADR-0018) with the same
 * controlled `value`/`onChange` shape a `<textarea>` has, so it drops into
 * an existing form's state without the surrounding component needing to
 * know anything about MDXEditor.
 *
 * `markdown` is read only once, on mount (MDXEditor's own documented
 * behavior — it is not a true controlled value). That's fine for every
 * current call site: each one fully unmounts the editor when the value it
 * holds needs to change out from under it (e.g. leaving edit mode), rather
 * than swapping `value` on a mounted instance. If a future call site needs
 * that, use `MDXEditorMethods.setMarkdown` via a ref instead of relying on
 * the `markdown` prop to update live.
 */
export function RichMarkdownEditor({ value, onChange, placeholder, className }: RichMarkdownEditorProps) {
  return (
    <div className={`rich-markdown-editor ${className ?? ""}`}>
      <MDXEditor
        markdown={value}
        onChange={onChange}
        placeholder={placeholder}
        contentEditableClassName="rich-markdown-editor-content"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarClassName: "rich-markdown-editor-toolbar",
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}
