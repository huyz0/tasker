import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ReportsPreview } from '../../../.storybook/ReportsPreview';
import { ReportsScreen } from './index';

const meta = {
  title: 'Features/Reports screen', component: ReportsScreen,
  parameters: { router: false, layout: 'padded', docs: { description: { component: 'The real Reports screen uses validated URL-owned windows. Synthetic current-project data preserves independent exception, trend and spend states.' } } },
} satisfies Meta<typeof ReportsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentProject: Story = { render: () => <ReportsPreview><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Review release notes')).resolves.toBeVisible(); } };
export const WindowFromUrl: Story = { render: () => <ReportsPreview initialEntry="/reports?org=org-story&project=project-story&days=90"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: '90 days' })).resolves.toHaveAttribute('aria-pressed', 'true'); } };
export const MalformedWindow: Story = { render: () => <ReportsPreview initialEntry="/reports?org=org-story&project=project-story&days=999"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Reset view' })).resolves.toBeVisible(); } };
export const RecoveredWindow: Story = { ...MalformedWindow, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);await userEvent.click(await canvas.findByRole('button', { name: 'Reset view' }));
  await waitFor(() => expect(canvas.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true'));
  await waitFor(() => expect(canvas.queryByText("Some view settings couldn't be applied.")).not.toBeInTheDocument());
} };
export const Empty: Story = { render: () => <ReportsPreview state="empty"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText(/Nothing to report in this window/)).resolves.toBeVisible(); } };
export const Loading: Story = { render: () => <ReportsPreview state="loading"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading project reports…')).resolves.toBeVisible(); } };
export const Error: Story = { render: () => <ReportsPreview state="error"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await waitFor(() => expect(within(canvasElement).queryAllByRole('button', { name: 'Try again' })).toHaveLength(3)); } };
export const Denied: Story = { render: () => <ReportsPreview state="denied"><ReportsScreen /></ReportsPreview>, play: Error.play };

export const ChooseOrganization: Story = { render: () => <ReportsPreview scope="none" initialEntry="/reports"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Select an organization to see project reports.')).resolves.toBeVisible(); } };
export const ChooseProject: Story = { render: () => <ReportsPreview scope="organization" initialEntry="/reports?org=org-story"><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Select a project to see its reports.')).resolves.toBeVisible(); } };


export const NamedViewEntry: Story = { render: () => <ReportsPreview><ReportsScreen /></ReportsPreview>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Saved views' })).resolves.toBeEnabled(); } };
