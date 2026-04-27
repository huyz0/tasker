import type { Meta, StoryObj } from '@storybook/react';
import { BuildBadge } from './BuildBadge';

const meta = {
  title: 'Components/BuildBadge',
  component: BuildBadge,
  tags: ['autodocs'],
} satisfies Meta<typeof BuildBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    status: 'SUCCESS',
    commitSha: 'a1b2c3d4e5f6g7h8',
  },
};

export const Failure: Story = {
  args: {
    status: 'FAILURE',
    commitSha: 'a1b2c3d4e5f6g7h8',
  },
};

export const Pending: Story = {
  args: {
    status: 'PENDING',
    commitSha: 'a1b2c3d4e5f6g7h8',
  },
};
