import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ClaimReportOwner } from '../../../.storybook/ClaimReportOwner';
import { claimReceiptFixture } from '../../../.storybook/claimReceiptFixture';
import { TaskUsageRecords } from './TaskUsageRecords';
import { TaskClaimHistory } from './TaskClaimHistory';

const meta = {
  title: 'Features/Tasks/Usage records', component: TaskUsageRecords,
  decorators: [(Story) => <ClaimReportOwner><TaskClaimHistory /><Story /></ClaimReportOwner>], beforeEach: () => claimReceiptFixture(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records')); await expect(canvas.findByText('Legacy reporter')).resolves.toBeVisible();
  },
} satisfies Meta<typeof TaskUsageRecords>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RecordedUsage: Story = {};
export const Empty: Story = { beforeEach: () => claimReceiptFixture('empty'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records')); await expect(canvas.findByText('No matching recorded usage reports.')).resolves.toBeVisible();
} };
export const Loading: Story = { beforeEach: () => claimReceiptFixture('loading'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records')); await expect(canvas.findByText('Loading usage records…')).resolves.toBeVisible();
} };
export const Error: Story = { beforeEach: () => claimReceiptFixture('error'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records')); await expect(canvas.findByRole('button', { name: 'Retry usage records' })).resolves.toBeVisible();
} };
export const Denied: Story = { beforeEach: () => claimReceiptFixture('denied'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records'));
  await expect(canvas.findByText('Verify task access in Claim history to view usage records.')).resolves.toBeVisible();
  await userEvent.click(canvas.getByText('Claim history'));
  await expect(canvas.findByRole('button', { name: 'Retry claim history' })).resolves.toBeVisible();
} };
export const OlderUsage: Story = { beforeEach: () => claimReceiptFixture('pages'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records'));
  await canvas.findByText('Page 1 · 20 shown · 25 recorded'); await userEvent.click(canvas.getByRole('button', { name: 'Older usage records' }));
  await expect(canvas.findByText('Page 2 · 5 shown · 25 recorded')).resolves.toBeVisible();
} };
export const OlderPageError: Story = { beforeEach: () => claimReceiptFixture('page-error'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records'));
  await canvas.findByText('Page 1 · 20 shown · 25 recorded'); await userEvent.click(canvas.getByRole('button', { name: 'Older usage records' }));
  await expect(canvas.findByRole('button', { name: 'Retry older usage records' })).resolves.toBeVisible();
} };
