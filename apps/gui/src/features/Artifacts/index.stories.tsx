import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResourceNavigationPreview } from '../../../.storybook/ResourceNavigationPreview';
import { ArtifactsBrowser } from './index';

const meta = {
  title: 'Features/ArtifactsBrowser', component: ArtifactsBrowser,
  parameters: { router: false, layout: 'fullscreen' },
} satisfies Meta<typeof ArtifactsBrowser>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <ResourceNavigationPreview kind="artifacts" state="populated" /> };
export const Empty: Story = { render: () => <ResourceNavigationPreview kind="artifacts" state="empty" /> };
export const Opening: Story = { render: () => <ResourceNavigationPreview kind="artifacts" state="loading" /> };
export const Unavailable: Story = { render: () => <ResourceNavigationPreview kind="artifacts" state="error" /> };
