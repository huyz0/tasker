import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskApprovals } from './Approvals';
import { WorkPreview } from '../../../.storybook/WorkPreview';

const meta = {
  title: 'Features/Tasks/Approvals',
  component: TaskApprovals,
  args: { taskId: 'task-storybook' },
  parameters: { layout: 'fullscreen', router: false, docs: { description: { component: 'Existing move decisions retain stale-closure notices and reconcile current source truth on settlement; no new approval state is introduced.' } } },
} satisfies Meta<typeof TaskApprovals>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnATask: Story = { render: () => <WorkPreview kind="approvals" state="populated" /> };
export const Empty: Story = { render: () => <WorkPreview kind="approvals" state="empty" organization /> };
export const Loading: Story = { render: () => <WorkPreview kind="approvals" state="loading" /> };
export const Unavailable: Story = { render: () => <WorkPreview kind="approvals" state="error" /> };
export const Denied: Story = { render: () => <WorkPreview kind="approvals" state="denied" /> };
export const NextPageError: Story = { render: () => <WorkPreview kind="approvals" state="next-error" /> };
export const RefreshError: Story = { render: () => <WorkPreview kind="approvals" state="refresh-error" /> };
export const OrganizationQueue: Story = { render: () => <WorkPreview kind="approvals" state="populated" organization /> };
export const DeniedCached: Story = { render: () => <WorkPreview kind="approvals" state="denied-cached" /> };
