// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { ProjectsWizard } from './index';

const meta: Meta<typeof ProjectsWizard> = {
  title: 'Features/ProjectsWizard',
  component: ProjectsWizard,
};
export default meta;
export const Default: StoryObj<typeof ProjectsWizard> = {};
