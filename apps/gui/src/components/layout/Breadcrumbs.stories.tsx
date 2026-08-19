import type { Meta, StoryObj } from '@storybook/react-vite';
import { Breadcrumbs } from './Breadcrumbs';

const meta = {
  title: 'Layout/Breadcrumbs',
  component: Breadcrumbs,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Seed Project', to: '/projects' },
      { label: 'Tasks', to: '/tasks' },
      { label: 'SEED-148' },
    ],
  },
};

export const SingleCrumb: Story = {
  args: {
    items: [{ label: 'Dashboard' }],
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};
