import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ReconciliationPreview } from '../../../.storybook/ReconciliationPreview';
import { reconciliationFixture } from '../../../.storybook/reconciliationFixture';
const meta = {
  title: 'Features/Attention/ExistingSourceActions', component: ReconciliationPreview,
  args: { kind: 'question' }, argTypes: { kind: { control: false } }, parameters: { layout: 'padded', router: false },
  beforeEach: context => reconciliationFixture(context.args.kind, context.parameters.outcome),
} satisfies Meta<typeof ReconciliationPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
const answer: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement), actions = within(await canvas.findByRole('region', { name: 'Existing task controls' }));
  await userEvent.type(await actions.findByLabelText('Your answer'), 'Ship to staging');
  await userEvent.click(actions.getByRole('button', { name: 'Answer' }));
  await expect(canvas.findByText('0 loaded of 0')).resolves.toBeVisible();
};
export const Answer: Story = { play: answer };
export const AnswerConflict: Story = { parameters: { outcome: 'stale' }, play: async context => {
  await answer!(context); await expect(within(context.canvasElement).findByText(/Another person already answered/)).resolves.toBeVisible();
} };
export const WriteDeniedReadRetained: Story = { parameters: { outcome: 'write_denied' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement), actions = within(await canvas.findByRole('region', { name: 'Existing task controls' }));
  await userEvent.type(await actions.findByLabelText('Your answer'), 'Ship to staging'); await userEvent.click(actions.getByRole('button', { name: 'Answer' }));
  await expect(actions.findByText(/Write access was removed/)).resolves.toBeVisible(); await expect(canvas.findByText('1 loaded of 1')).resolves.toBeVisible();
} };
const decide: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Approve move' }));
  await expect(canvas.findByText('0 loaded of 0')).resolves.toBeVisible();
};
export const ApproveMove: Story = { args: { kind: 'approval' }, play: decide };
export const StaleMove: Story = { args: { kind: 'approval' }, parameters: { outcome: 'stale' }, play: async context => {
  await decide!(context); await expect(within(context.canvasElement).findByText(/this request closed as stale/)).resolves.toBeVisible();
} };
export const RemoveReviewResponsibility: Story = { args: { kind: 'review' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Remove Alex Morgan as a reviewer' }));
  await expect(canvas.findByText('0 loaded of 0')).resolves.toBeVisible(); await expect(canvas.findByText('No reviewers')).resolves.toBeVisible();
} };
export const RemoveCombinedAssignment: Story = { args: { kind: 'stalled_claim' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Remove Release worker from this task' }));
  await expect(canvas.findByText('0 loaded of 0')).resolves.toBeVisible(); await expect(canvas.findByRole('button', { name: 'Unassigned — assign this task' })).resolves.toBeVisible();
} };
