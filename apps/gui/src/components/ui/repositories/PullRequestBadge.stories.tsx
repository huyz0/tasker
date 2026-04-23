import type { Meta, StoryObj } from '@storybook/react';
import { PullRequestBadge } from './PullRequestBadge';

const meta = {
  title: 'UI/Repositories/PullRequestBadge',
  component: PullRequestBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof PullRequestBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    pr: {
      remotePrId: '412',
      title: 'Update dependencies to fix vulnerabilities',
      status: 'open',
      url: 'https://github.com/huyz0/tasker/pull/412'
    }
  },
};

export const Merged: Story = {
  args: {
    pr: {
      remotePrId: '410',
      title: 'Implement repository sync',
      status: 'merged',
      url: 'https://github.com/huyz0/tasker/pull/410'
    }
  },
};

export const Closed: Story = {
  args: {
    pr: {
      remotePrId: '409',
      title: 'Draft proposal for CLI',
      status: 'closed',
      url: 'https://github.com/huyz0/tasker/pull/409'
    }
  },
};
