import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LazyRichMarkdownEditor } from './LazyRichMarkdownEditor';

// The code-split wrapper, not the editor itself — RichMarkdownEditor has its
// own story for the editing surface. What is worth seeing here is the
// Suspense fallback and that the wrapper stays a drop-in controlled field.
const meta = {
  title: 'UI/LazyRichMarkdownEditor',
  component: LazyRichMarkdownEditor,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LazyRichMarkdownEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ readOnly = false }: { readOnly?: boolean }) {
  const [value, setValue] = useState('## Notes\n\nType here — **bold** works.');
  return <LazyRichMarkdownEditor value={value} onChange={setValue} placeholder="Write something…" readOnly={readOnly} />;
}

export const Default: Story = {
  args: { value: '', onChange: () => {} },
  render: () => <Controlled />,
};

// The state a form shows mid-submit: the comment composer passes this while
// its mutation is in flight so a user cannot keep typing into a value that
// has already been sent.
export const ReadOnly: Story = {
  args: { value: '', onChange: () => {} },
  render: () => <Controlled readOnly />,
};
