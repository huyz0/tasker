import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichMarkdownEditor } from './RichMarkdownEditor';

// Lexical (MDXEditor's engine) depends on browser Selection/Range APIs jsdom
// implements incompletely, and this repo has no polyfills for them
// (setupTests.ts only covers ResizeObserver and forced layout dimensions).
// Per ADR-0018, unit tests mock the library boundary itself — the same
// convention already used for @connectrpc/connect's createClient — and
// verify only this wrapper's own logic (value/onChange/placeholder/
// className wiring, plugin assembly). Real typing/selection/toolbar
// behavior is proven once, for real, by the Playwright e2e test (M23-T04).
vi.mock('@mdxeditor/editor', () => ({
  MDXEditor: ({ markdown, onChange, placeholder, contentEditableClassName }: {
    markdown: string;
    onChange?: (value: string, initialMarkdownNormalize: boolean) => void;
    placeholder?: string;
    contentEditableClassName?: string;
  }) => (
    <textarea
      aria-label="rich markdown editor"
      className={contentEditableClassName}
      defaultValue={markdown}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value, false)}
    />
  ),
  headingsPlugin: vi.fn(() => 'headingsPlugin'),
  listsPlugin: vi.fn(() => 'listsPlugin'),
  quotePlugin: vi.fn(() => 'quotePlugin'),
  thematicBreakPlugin: vi.fn(() => 'thematicBreakPlugin'),
  linkPlugin: vi.fn(() => 'linkPlugin'),
  linkDialogPlugin: vi.fn(() => 'linkDialogPlugin'),
  tablePlugin: vi.fn(() => 'tablePlugin'),
  markdownShortcutPlugin: vi.fn(() => 'markdownShortcutPlugin'),
  // The real toolbarPlugin stashes `toolbarContents` for the editor to call
  // when it renders the toolbar. Invoking it here (rather than leaving it
  // unexercised) covers RichMarkdownEditor's own inline toolbar-contents
  // function — its element tree is never mounted, just constructed, which
  // is enough to prove the hand-picked toolbar list is wired correctly.
  toolbarPlugin: vi.fn((opts: { toolbarContents: () => unknown }) => {
    opts.toolbarContents();
    return 'toolbarPlugin';
  }),
  BoldItalicUnderlineToggles: () => null,
  ListsToggle: () => null,
  CreateLink: () => null,
  UndoRedo: () => null,
  BlockTypeSelect: () => null,
  Separator: () => null,
}));

describe('RichMarkdownEditor', () => {
  it('passes the current value through to the underlying editor', () => {
    render(<RichMarkdownEditor value="**bold**" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('**bold**');
  });

  it('calls onChange with the new markdown when the editor content changes', () => {
    // RichMarkdownEditor passes its own onChange straight through as
    // MDXEditor's onChange, which is called with a second
    // (initialMarkdownNormalize) argument the wrapper's own callers don't
    // need to care about — asserted here so the passthrough is pinned,
    // not just "was called".
    const onChange = vi.fn();
    render(<RichMarkdownEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Heading' } });
    expect(onChange).toHaveBeenCalledWith('# Heading', false);
  });

  it('passes the placeholder through to the underlying editor', () => {
    render(<RichMarkdownEditor value="" onChange={vi.fn()} placeholder="Description (Markdown supported)" />);
    expect(screen.getByPlaceholderText('Description (Markdown supported)')).toBeInTheDocument();
  });

  it('applies a caller-supplied className to the wrapper, alongside its own', () => {
    const { container } = render(<RichMarkdownEditor value="" onChange={vi.fn()} className="my-extra-class" />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('rich-markdown-editor');
    expect(wrapper).toHaveClass('my-extra-class');
  });

  it('renders without a caller-supplied className', () => {
    const { container } = render(<RichMarkdownEditor value="" onChange={vi.fn()} />);
    expect(container.firstElementChild).toHaveClass('rich-markdown-editor');
  });
});
