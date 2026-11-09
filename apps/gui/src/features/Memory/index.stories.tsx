import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResourceNavigationPreview } from '../../../.storybook/ResourceNavigationPreview';
import { MemoryExplorer } from './index';

const meta = {
  title: 'Features/MemoryExplorer', component: MemoryExplorer,
  parameters: { router: false, layout: 'fullscreen' },
} satisfies Meta<typeof MemoryExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <ResourceNavigationPreview kind="memory" state="empty" /> };
export const WithProjectSelected: Story = { render: () => <ResourceNavigationPreview kind="memory" state="populated" /> };
export const OrganizationMemory: Story = { render: () => <ResourceNavigationPreview kind="memory" state="populated" tier="organization" /> };
export const TeamDetail: Story = { render: () => <ResourceNavigationPreview kind="memory" state="populated" tier="team" /> };
export const Opening: Story = { render: () => <ResourceNavigationPreview kind="memory" state="loading" /> };
export const Unavailable: Story = { render: () => <ResourceNavigationPreview kind="memory" state="error" /> };
