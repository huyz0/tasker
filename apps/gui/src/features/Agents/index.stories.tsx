// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { AgentsDashboard } from './index';

const meta: Meta<typeof AgentsDashboard> = {
  title: 'Features/AgentsDashboard',
  component: AgentsDashboard,
  parameters: { docs: { description: { component: 'Operational rows and section headings use the shared density and typography roles.' } } },
};
export default meta;
export const Default: StoryObj<typeof AgentsDashboard> = {};
