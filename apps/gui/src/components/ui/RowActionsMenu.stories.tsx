import type { Meta, StoryObj } from '@storybook/react-vite';
import { RowActionsMenu } from './RowActionsMenu';

const meta = {
  title: 'UI/RowActionsMenu',
  component: RowActionsMenu,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof RowActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// The menu itself is a Radix dropdown, closed until clicked and portalled
// when open - this repo has no established play()-function convention yet
// (M23's own review found none), so this documents the real closed-trigger
// state every row actually starts in, not a synthetic opened one.
export const Default: Story = {
  args: {
    label: 'Row actions',
    actions: [
      { label: 'Edit', onClick: () => {} },
      { label: 'Archive', onClick: () => {} },
      { label: 'Delete', onClick: () => {}, destructive: true },
    ],
  },
};

export const WithDisabledAction: Story = {
  args: {
    label: 'Row actions',
    actions: [
      { label: 'Edit', onClick: () => {} },
      { label: 'Restore', onClick: () => {}, disabled: true },
      { label: 'Delete', onClick: () => {}, destructive: true },
    ],
  },
};
