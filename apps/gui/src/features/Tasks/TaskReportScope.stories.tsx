import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ClaimReportOwner } from '../../../.storybook/ClaimReportOwner';
import { claimReceiptFixture } from '../../../.storybook/claimReceiptFixture';
import { TaskReportScopeControl } from './TaskReportScope';
import { TaskClaimHistory } from './TaskClaimHistory';

const meta = {
  title: 'Features/Tasks/Report scope', component: TaskReportScopeControl,
  decorators: [(Story) => <ClaimReportOwner><Story /><TaskClaimHistory /></ClaimReportOwner>],
  beforeEach: () => claimReceiptFixture(),
} satisfies Meta<typeof TaskReportScopeControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllReports: Story = {};
export const WithoutReceipt: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Report scope' }), 'uncorrelated');
  await expect(canvas.getByText('Showing recorded reports without a claim receipt.')).toBeVisible();
} };
export const SelectedReceipt: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history'));
  const owner = await canvas.findByText('Prior release worker');
  await userEvent.click(within(owner.closest('li')!).getByRole('button', { name: 'Show associated reports' }));
  await expect(canvas.getByRole('combobox', { name: 'Report scope' })).toHaveValue('receipt');
} };
export const LongSelectedOwner: Story = { beforeEach: () => claimReceiptFixture('long'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history'));
  const owner = await canvas.findByText(/Long recorded owner name/);
  await userEvent.click(within(owner.closest('li')!).getByRole('button', { name: 'Show associated reports' }));
  await expect(canvas.getByRole('combobox', { name: 'Report scope' })).toHaveValue('receipt');
} };
