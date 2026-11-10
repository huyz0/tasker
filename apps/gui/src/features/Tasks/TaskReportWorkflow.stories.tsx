import type { Meta, StoryObj } from '@storybook/react-vite';
import { create } from '@bufbuild/protobuf';
import { UsageTotalsSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { expect, userEvent, within } from 'storybook/test';
import { ClaimReportOwner } from '../../../.storybook/ClaimReportOwner';
import { claimReceiptFixture, claimStoryOwner } from '../../../.storybook/claimReceiptFixture';
import { TaskContext } from './TaskContext';
import { TaskArtifactLinks } from './TaskArtifactLinks';
import { TaskNotesPanel } from './TaskNotesPanel';

const meta = {
  title: 'Features/Tasks/Claim reports', component: TaskContext,
  args: { taskId: claimStoryOwner.taskId, usage: create(UsageTotalsSchema, { reports: 3n, inputTokens: 300n, outputTokens: 60n, costMicros: 3000n }) },
  decorators: [(Story) => <ClaimReportOwner><Story /></ClaimReportOwner>],
  beforeEach: () => claimReceiptFixture(),
  render: args => <>
    <TaskContext {...args}><TaskArtifactLinks taskId={claimStoryOwner.taskId} orgId={claimStoryOwner.orgId} /></TaskContext>
    <h3 className="mt-6 type-section-title">Agent Notes</h3><TaskNotesPanel taskId={claimStoryOwner.taskId} />
  </>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('A legacy note remains reachable without a receipt.')).resolves.toBeVisible(); },
} satisfies Meta<typeof TaskContext>;
export default meta;
type Story = StoryObj<typeof meta>;
async function selectPrior(canvasElement: HTMLElement) {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Claim history'));
  const claims = within(await canvas.findByRole('list', { name: 'Recorded claims' }));
  const owner = claims.getByText('Prior release worker');
  await userEvent.click(within(owner.closest('li')!).getByRole('button', { name: 'Show associated reports' }));
}
async function linkOutsideScope(canvasElement: HTMLElement, message: string) {
  await selectPrior(canvasElement);
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Link an artifact…' }));
  await userEvent.type(canvas.getByRole('textbox', { name: 'Search artifacts' }), 'follow');
  await userEvent.click(await canvas.findByRole('button', { name: 'follow-up.md' }));
  await expect(canvas.findByText(message)).resolves.toBeVisible();
}
export const AllReports: Story = {};
export const AssociatedReports: Story = { play: async ({ canvasElement }) => {
  await selectPrior(canvasElement);
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('Usage records'));
  await expect(canvas.findByRole('link', { name: 'prior-output.md' })).resolves.toBeVisible();
  await expect(canvas.findByRole('list', { name: 'Recorded usage reports' })).resolves.toBeVisible();
  await expect(canvas.queryByRole('link', { name: 'legacy-output.md' })).not.toBeInTheDocument();
} };
export const WithoutReceipt: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Report scope' }), 'uncorrelated');
  await userEvent.click(canvas.getByText('Usage records'));
  await expect(canvas.findByText('Legacy reporter')).resolves.toBeVisible();
  await expect(canvas.findByRole('link', { name: 'legacy-output.md' })).resolves.toBeVisible();
} };
export const LinkWithoutReceipt: Story = { play: async ({ canvasElement }) => { await linkOutsideScope(canvasElement, 'Artifact linked without a claim receipt.'); } };
export const ExistingOtherReceipt: Story = { beforeEach: () => claimReceiptFixture('linked-other'), play: async ({ canvasElement }) => {
  await linkOutsideScope(canvasElement, 'Artifact is linked with a different claim receipt.');
} };
