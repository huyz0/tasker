import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { evidenceFixture } from '../../../.storybook/evidenceFixture';
import { TaskArtifactLinks } from './TaskArtifactLinks';

const meta = {
  title: 'Features/Tasks/TaskArtifactLinks', component: TaskArtifactLinks,
  args: { orgId: 'org-storybook', taskId: 'task-storybook' },
  parameters: { layout: 'padded', docs: { description: { component: 'The Claim reports previews also exercise receipt-filtered reads and truthful human link feedback when the returned association is outside that filter. Human linking keeps its existing unassociated request.' } } },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
  beforeEach: () => evidenceFixture(),
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('link', { name: 'release-verification.md' })).resolves.toBeVisible(); },
} satisfies Meta<typeof TaskArtifactLinks>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FromTask: Story = {};
export const FromArtifact: Story = { args: { taskId: undefined, artifactId: 'artifact-storybook' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Verify the release')).resolves.toBeVisible(); } };
export const Empty: Story = { beforeEach: () => evidenceFixture('empty'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No evidence linked')).resolves.toBeVisible(); } };
export const Loading: Story = { beforeEach: () => evidenceFixture('loading'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading evidence…')).resolves.toBeVisible(); } };
export const Error: Story = { beforeEach: () => evidenceFixture('error'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('alert')).resolves.toBeVisible(); } };
export const Denied: Story = { beforeEach: () => evidenceFixture('denied'), play: Error.play };
export const ReadOnly: Story = { beforeEach: () => evidenceFixture('readonly') };
export const LegacyUnknown: Story = { beforeEach: () => evidenceFixture('legacy') };
export const Unavailable: Story = { beforeEach: () => evidenceFixture('unavailable'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Artifact unavailable')).resolves.toBeVisible(); } };
export const LongArchived: Story = { beforeEach: () => evidenceFixture('long'), play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Archived')).resolves.toBeVisible(); } };
export const MultiplePages: Story = { beforeEach: () => evidenceFixture('pages'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Load more evidence' }));
  await expect(canvas.findByRole('link', { name: 'deployment-notes.txt' })).resolves.toBeVisible();
} };
export const NextPageError: Story = { beforeEach: () => evidenceFixture('page-error'), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Load more evidence' }));
  await expect(canvas.findByRole('button', { name: 'Retry loading more evidence' })).resolves.toBeVisible();
} };
export const Picker: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Link an artifact…' }));
  await userEvent.type(canvas.getByRole('textbox', { name: 'Search artifacts' }), 'follow');
  await expect(canvas.findByRole('button', { name: 'follow-up.md' })).resolves.toBeVisible();
} };
