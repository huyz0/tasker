// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { LabelsManager } from './index';

const meta: Meta<typeof LabelsManager> = {
  title: 'Features/LabelsManager',
  component: LabelsManager,
};
export default meta;
export const Default: StoryObj<typeof LabelsManager> = {};
