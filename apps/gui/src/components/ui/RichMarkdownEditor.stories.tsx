import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RichMarkdownEditor } from './RichMarkdownEditor';

const meta = {
  title: 'UI/RichMarkdownEditor',
  component: RichMarkdownEditor,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RichMarkdownEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

// Storybook renders the real MDXEditor (unlike the unit tests, which mock
// it per ADR-0018) — this is the one place a reviewer can see and interact
// with the actual Lexical-backed editor without a full e2e run. `args.value`
// only seeds the initial content (MDXEditor's own "markdown" prop is
// read-only on mount); typing in the story updates local state via `render`,
// not `args.value` itself, which Storybook's controls addon never mutates.
function Controlled({ value, placeholder }: { value: string; placeholder?: string }) {
  const [current, setCurrent] = useState(value);
  return <RichMarkdownEditor value={current} onChange={setCurrent} placeholder={placeholder} />;
}

export const Empty: Story = {
  args: {
    value: '',
    onChange: () => {},
    placeholder: 'Description (Markdown supported)',
  },
  render: (args) => <Controlled value={args.value} placeholder={args.placeholder} />,
};

export const WithContent: Story = {
  args: {
    value: `# Investigation notes

Tried **reproducing** the race under load; couldn't trigger it below 200 rps.

- Checked the claim-row lock path
- Checked the retry policy on the client

> Next: try with the idempotency key disabled to isolate the two.`,
    onChange: () => {},
  },
  render: (args) => <Controlled value={args.value} placeholder={args.placeholder} />,
};
