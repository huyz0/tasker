import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dialog } from './Dialog';

const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onClose: () => {},
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Move "Fix the login bug" to the bin?',
    className: 'w-full max-w-md',
    children: (
      <div className="p-4 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">The task stops appearing on the board and in lists.</p>
        <p className="text-sm text-muted-foreground">You can restore it from the Bin.</p>
      </div>
    ),
  },
};

// The task-detail overlay's own shape: a title plus header actions
// (Edit/Delete/Close), the pattern every real caller in this app uses.
export const WithHeaderActions: Story = {
  args: {
    title: 'Task Details',
    className: 'w-full max-w-2xl h-[80vh]',
    headerRight: (
      <div className="flex items-center gap-3">
        <button className="text-muted-foreground hover:text-foreground text-sm font-medium">Edit</button>
        <button className="text-destructive hover:text-destructive/80 text-sm font-medium">Delete</button>
        <button aria-label="Close task details" className="text-muted-foreground hover:text-foreground">✕</button>
      </div>
    ),
    children: <div className="p-6 text-sm text-muted-foreground">Dialog content goes here.</div>,
  },
};

// The search palette's own shape: content supplies its own heading, so the
// dialog's own title renders sr-only instead of visibly.
export const HiddenTitle: Story = {
  args: {
    title: 'Search',
    hideTitle: true,
    className: 'w-full max-w-lg',
    children: <div className="p-4 text-sm text-muted-foreground">Content supplies its own visible heading.</div>,
  },
};
