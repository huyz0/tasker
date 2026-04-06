import type { Meta, StoryObj } from '@storybook/react';
import { TasksWorkbench } from './index';

const meta: Meta<typeof TasksWorkbench> = {
  title: 'Features/TasksWorkbench',
  component: TasksWorkbench,
};
export default meta;
export const Default: StoryObj<typeof TasksWorkbench> = {};
