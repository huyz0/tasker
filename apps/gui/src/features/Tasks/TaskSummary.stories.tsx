import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskSummaryPanel } from './TaskSummary';
import { SummaryPreview } from '../../../.storybook/SummaryPreview';

const meta = { title: 'Features/Tasks/TaskSummary', component: TaskSummaryPanel,
  args: { taskId: 'summary-story-task' }, parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TaskSummaryPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Written: Story = { render: () => <SummaryPreview state="written" /> };
export const NoneYet: Story = { render: () => <SummaryPreview state="empty" /> };
export const UnsavedDraft: Story = { render: () => <SummaryPreview state="draft" /> };
export const RestoredContext: Story = { render: () => <SummaryPreview state="restored" /> };
export const Saving: Story = { render: () => <SummaryPreview state="saving" /> };
export const NewerWritingWhileSaving: Story = { render: () => <SummaryPreview state="newer-saving" /> };
export const FailedSave: Story = { render: () => <SummaryPreview state="error" /> };
export const OverLimit: Story = { render: () => <SummaryPreview state="over-limit" /> };
export const Clearing: Story = { render: () => <SummaryPreview state="clearing" /> };
export const NewerWritingWhileClearing: Story = { render: () => <SummaryPreview state="clear-newer" /> };
export const PreviousAccountWrite: Story = { render: () => <SummaryPreview state="foreign-wait" /> };
