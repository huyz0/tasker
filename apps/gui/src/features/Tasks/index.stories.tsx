// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { TasksWorkbench } from './index';

const meta: Meta<typeof TasksWorkbench> = {
  title: 'Features/TasksWorkbench',
  component: TasksWorkbench,
};
export default meta;
export const Default: StoryObj<typeof TasksWorkbench> = {};

/** The assembled 375px task dialog is also covered by ui-layout.spec.ts. */
export const MobileWorkbench: StoryObj<typeof TasksWorkbench> = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
