import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ClaimReportOwner } from '../../../.storybook/ClaimReportOwner';
import { claimReceiptFixture } from '../../../.storybook/claimReceiptFixture';
import { TaskClaimHistory } from './TaskClaimHistory';
import { TaskReportScopeControl } from './TaskReportScope';

const meta = {
  title: 'Features/Tasks/Claim history', component: TaskClaimHistory,
  decorators: [(Story) => <ClaimReportOwner><TaskReportScopeControl /><Story /></ClaimReportOwner>],
  beforeEach: () => claimReceiptFixture(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history'));
    await expect(canvas.findByText('Prior release worker')).resolves.toBeVisible();
  },
} satisfies Meta<typeof TaskClaimHistory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RecordedOwnership: Story = {};
export const Empty: Story = { beforeEach: () => claimReceiptFixture('empty'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history')); await expect(canvas.findByText('No recorded claims.')).resolves.toBeVisible();
} };
export const Loading: Story = { beforeEach: () => claimReceiptFixture('loading'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history')); await expect(canvas.findByText('Loading claim history…')).resolves.toBeVisible();
} };
export const Error: Story = { beforeEach: () => claimReceiptFixture('error'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history')); await expect(canvas.findByRole('alert')).resolves.toBeVisible();
} };
export const Denied: Story = { beforeEach: () => claimReceiptFixture('denied'), play: Error.play };
export const OwnerPurged: Story = { beforeEach: () => claimReceiptFixture('purged') };
export const LongIdentifiers: Story = { beforeEach: () => claimReceiptFixture('long'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history')); await expect(canvas.findByText(/Long recorded owner name/)).resolves.toBeVisible();
} };
export const OlderPage: Story = { beforeEach: () => claimReceiptFixture('pages'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history')); await canvas.findByRole('list', { name: 'Recorded claims' });
  await userEvent.click(canvas.getByRole('button', { name: 'Older claims' }));
  await expect(canvas.findByText('Earlier review worker')).resolves.toBeVisible();
} };
export const OlderPageError: Story = { beforeEach: () => claimReceiptFixture('page-error'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history')); await canvas.findByRole('list', { name: 'Recorded claims' });
  await userEvent.click(canvas.getByRole('button', { name: 'Older claims' }));
  await expect(canvas.findByRole('button', { name: 'Retry older claims' })).resolves.toBeVisible();
} };
