import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ClaimReportOwner } from '../../../.storybook/ClaimReportOwner';
import { claimReceiptFixture, claimStoryOwner } from '../../../.storybook/claimReceiptFixture';
import { TaskNotesPanel } from './TaskNotesPanel';

const meta = {
  title: 'Features/Tasks/Agent notes', component: TaskNotesPanel, args: { taskId: claimStoryOwner.taskId },
  decorators: [(Story) => <ClaimReportOwner><Story /></ClaimReportOwner>], beforeEach: () => claimReceiptFixture(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('A legacy note remains reachable without a receipt.')).resolves.toBeVisible();
    await expect(canvas.getByText('Only the authoring agent can edit or delete these notes.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  },
} satisfies Meta<typeof TaskNotesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RecordedNotes: Story = {};
export const LongOwnerNames: Story = { beforeEach: () => claimReceiptFixture('long') };
export const Empty: Story = { beforeEach: () => claimReceiptFixture('empty'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No agent notes yet.')).resolves.toBeVisible(); } };
export const Loading: Story = { beforeEach: () => claimReceiptFixture('loading'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading notes…')).resolves.toBeVisible(); } };
export const Error: Story = { beforeEach: () => claimReceiptFixture('error'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Retry notes' })).resolves.toBeVisible(); } };
export const Denied: Story = { beforeEach: () => claimReceiptFixture('denied'), play: Error.play };
export const OlderNotes: Story = { beforeEach: () => claimReceiptFixture('pages'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByText('Page 1 · 20 shown · 25 recorded');
  await userEvent.click(canvas.getByRole('button', { name: 'Older notes' })); await expect(canvas.findByText('Recorded note report-24')).resolves.toBeVisible();
} };
export const OlderPageError: Story = { beforeEach: () => claimReceiptFixture('page-error'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByText('Page 1 · 20 shown · 25 recorded');
  await userEvent.click(canvas.getByRole('button', { name: 'Older notes' }));
  await expect(canvas.findByRole('button', { name: 'Retry older notes' })).resolves.toBeVisible();
} };
