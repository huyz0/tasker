import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { reconciliationFixture } from '../../../.storybook/reconciliationFixture';
import { ReviewerPicker } from './ReviewerPicker';
const meta = {
  title: 'Features/Tasks/ReviewerPicker', component: ReviewerPicker,
  args: { taskId: 'task-storybook', orgId: 'org-storybook' }, parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
  beforeEach: context => reconciliationFixture('review', 'success', context.parameters.listState),
} satisfies Meta<typeof ReviewerPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Alex Morgan')).resolves.toBeVisible(); } };
export const Empty: Story = { parameters: { listState: 'empty' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No reviewers')).resolves.toBeVisible(); } };
export const Loading: Story = { parameters: { listState: 'loading' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading reviewers…')).resolves.toBeVisible(); } };
export const Error: Story = { parameters: { listState: 'error' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('alert')).resolves.toHaveTextContent('temporarily offline'); } };
