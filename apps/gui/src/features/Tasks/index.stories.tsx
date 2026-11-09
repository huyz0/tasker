import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResourceNavigationPreview } from '../../../.storybook/ResourceNavigationPreview';
import { WorkbenchPreview } from '../../../.storybook/WorkbenchPreview';
import { TasksWorkbench } from './index';

const meta = {
  title: 'Features/TasksWorkbench', component: TasksWorkbench,
  parameters: { router: false, layout: 'padded', docs: { description: { component: 'Deterministic board states use the real workbench. Optional task context is previewed in Features/Tasks/Optional context; assembled task routes and keyboard disclosure are covered in ui-layout.spec.ts.' } } },
} satisfies Meta<typeof TasksWorkbench>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <WorkbenchPreview><TasksWorkbench /></WorkbenchPreview> };
export const Empty: Story = { render: () => <WorkbenchPreview state="empty"><TasksWorkbench /></WorkbenchPreview> };
export const Loading: Story = { render: () => <WorkbenchPreview state="loading"><TasksWorkbench /></WorkbenchPreview> };
export const PermissionDenied: Story = { render: () => <WorkbenchPreview state="error"><TasksWorkbench /></WorkbenchPreview> };
export const MobileWorkbench: Story = { ...Default, parameters: { viewport: { defaultViewport: 'mobile1' } } };

export const OpeningTask: Story = { render: () => <ResourceNavigationPreview kind="tasks" state="loading" /> };
export const UnavailableTask: Story = { render: () => <ResourceNavigationPreview kind="tasks" state="error" /> };
