import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useConfirm, type ConfirmOptions } from './ConfirmDialog';

// useConfirm returns a dialog element plus an await-able confirm() function -
// there is no bare <ConfirmDialog> component to point Storybook at. This
// wrapper opens it immediately on mount (via confirm()'s own promise, left
// unresolved) so the dialog is visible without a play() function or a click.
function ConfirmDialogDemo({ options }: { options: ConfirmOptions }) {
  const { confirm, confirmDialog } = useConfirm();
  useEffect(() => {
    confirm(options);
    // Only ever open once per story mount - re-running on every options
    // identity change would just reopen the same dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div>{confirmDialog}</div>;
}

const meta = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialogDemo,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ConfirmDialogDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

// Reversible: names the undo path explicitly.
export const Reversible: Story = {
  args: {
    options: {
      title: 'Move "Fix the login bug" to the bin?',
      consequence: 'The task stops appearing on the board and in lists.',
      undo: 'You can restore it from the Bin.',
      confirmLabel: 'Move to bin',
    },
  },
};

// Permanent: undo: null renders the destructive style and "This cannot be
// undone." - the exact distinction window.confirm's one line of text
// couldn't make (see ConfirmDialog.tsx's own doc comment).
export const Permanent: Story = {
  args: {
    options: {
      title: 'Revoke "CI token"?',
      consequence: 'Anything using this token stops working immediately.',
      undo: null,
      confirmLabel: 'Revoke token',
    },
  },
};
