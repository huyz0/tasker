// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { RolesManager } from './index';

const meta: Meta<typeof RolesManager> = {
  title: 'Features/RolesManager',
  component: RolesManager,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof RolesManager>;

export const Default: Story = {};
