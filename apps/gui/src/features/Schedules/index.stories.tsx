import type { Meta, StoryObj } from '@storybook/react-vite';
import { AutomationPreview } from '../../../.storybook/AutomationPreview';

const meta = { title: 'Features/Schedules/Screen', parameters: { router: false, layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { render: () => <AutomationPreview kind="schedules" state="empty" /> };
export const Loading: Story = { render: () => <AutomationPreview kind="schedules" state="loading" /> };
export const PermissionDenied: Story = { render: () => <AutomationPreview kind="schedules" state="error" /> };
export const Populated: Story = { render: () => <AutomationPreview kind="schedules" state="populated" /> };
export const Create: Story = { render: () => <AutomationPreview kind="schedules" state="new" /> };
