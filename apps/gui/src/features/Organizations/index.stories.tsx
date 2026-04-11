// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { OrganizationsDashboard } from './index';

const meta: Meta<typeof OrganizationsDashboard> = {
  title: 'Features/OrganizationsDashboard',
  component: OrganizationsDashboard,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof OrganizationsDashboard>;

export const Default: Story = {};
