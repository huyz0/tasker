import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ResourceNavigationPreview } from '../../../.storybook/ResourceNavigationPreview';
import { WorkbenchPreview } from '../../../.storybook/WorkbenchPreview';
import { TasksWorkbench } from './index';

const meta = {
  title: 'Features/TasksWorkbench', component: TasksWorkbench,
  parameters: { router: false, layout: 'padded', docs: { description: { component: 'Deterministic board states use the real workbench. Optional context and Claim reports previews cover Summary, Evidence, ownership history and source scope; actual task routes and keyboard disclosure have separate browser coverage. Existing task-write settlement also reconciles current Attention sources.' } } },
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

export const FilteredTableUrl: Story = {
  render: () => <WorkbenchPreview initialEntry="/tasks?org=org-story&project=project-story&view=table&q=release&priority=0&ready=1&sort=title:asc"><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Review release notes')).resolves.toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('searchbox', { name: 'Filter tasks' })).toHaveValue('release');
    await expect(canvas.getByRole('combobox', { name: 'Filter by priority' })).toHaveValue('0');
  },
};
export const MalformedViewUrl: Story = {
  render: () => <WorkbenchPreview initialEntry="/tasks?org=org-story&project=project-story&view=unsupported&ready=unknown"><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Reset view' })).resolves.toBeVisible(); },
};
export const RecoveredViewUrl: Story = { ...MalformedViewUrl, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);await userEvent.click(await canvas.findByRole('button', { name: 'Reset view' }));
  await expect(canvas.queryByText("Some view settings couldn't be applied.")).not.toBeInTheDocument();
  await expect(canvas.findByText('Review release notes')).resolves.toBeVisible();
} };
export const NoFilterMatches: Story = {
  render: () => <WorkbenchPreview initialEntry="/tasks?org=org-story&project=project-story&view=table&q=no-matching-title"><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No tasks match these view settings.')).resolves.toBeVisible(); },
};

export const EmptyTable: Story = {
  render: () => <WorkbenchPreview state="empty" initialEntry="/tasks?org=org-story&project=project-story&view=table"><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No tasks yet.')).resolves.toBeVisible(); },
};
export const LoadingTable: Story = {
  render: () => <WorkbenchPreview state="loading" initialEntry="/tasks?org=org-story&project=project-story&view=table"><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading tasks…')).resolves.toBeVisible(); },
};
export const DeniedTable: Story = {
  render: () => <WorkbenchPreview state="error" initialEntry="/tasks?org=org-story&project=project-story&view=table"><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), retry = await canvas.findByRole('button', { name: 'Try again' });
    canvas.getByRole('columnheader', { name: 'Status' }).querySelector('button')!.focus();
    await expect(retry).toBeVisible();
    const bounds = retry.getBoundingClientRect();
    await expect(bounds.left).toBeGreaterThanOrEqual(0);
    await expect(bounds.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
  },
};


export const NamedViewEntry: Story = { render: () => <WorkbenchPreview><TasksWorkbench /></WorkbenchPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Saved views' })).resolves.toBeEnabled(); } };
