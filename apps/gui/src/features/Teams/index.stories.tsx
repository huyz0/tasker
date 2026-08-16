// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { TeamsManager } from './index';

const meta: Meta<typeof TeamsManager> = {
  title: 'Features/TeamsManager',
  component: TeamsManager,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof TeamsManager>;

export const Default: Story = {};
