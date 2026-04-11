// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { AgentsDashboard } from './index';

const meta: Meta<typeof AgentsDashboard> = {
  title: 'Features/AgentsDashboard',
  component: AgentsDashboard,
};
export default meta;
export const Default: StoryObj<typeof AgentsDashboard> = {};
