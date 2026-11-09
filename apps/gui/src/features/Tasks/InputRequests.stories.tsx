import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskInputRequests } from './InputRequests';
import { WorkPreview } from '../../../.storybook/WorkPreview';

const meta = {
  title: 'Features/Tasks/InputRequests',
  component: TaskInputRequests,
  args: { taskId: 'task-storybook' },
  parameters: { layout: 'fullscreen', router: false },
} satisfies Meta<typeof TaskInputRequests>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnATask: Story = { render: () => <WorkPreview kind="questions" state="populated" /> };
export const Empty: Story = { render: () => <WorkPreview kind="questions" state="empty" organization /> };
export const Loading: Story = { render: () => <WorkPreview kind="questions" state="loading" /> };
export const Unavailable: Story = { render: () => <WorkPreview kind="questions" state="error" /> };
export const Denied: Story = { render: () => <WorkPreview kind="questions" state="denied" /> };
export const NextPageError: Story = { render: () => <WorkPreview kind="questions" state="next-error" /> };
export const RefreshError: Story = { render: () => <WorkPreview kind="questions" state="refresh-error" /> };
export const OrganizationQueue: Story = { render: () => <WorkPreview kind="questions" state="populated" organization /> };
export const DeniedCached: Story = { render: () => <WorkPreview kind="questions" state="denied-cached" /> };
