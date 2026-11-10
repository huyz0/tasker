import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { attentionFixture } from '../../../.storybook/attentionFixture';
import { AttentionScreen } from './AttentionScreen';

const meta = {
  title: 'Features/Attention/AttentionScreen', component: AttentionScreen,
  parameters: { layout: 'padded', router: false },
  decorators: [(Story, context) => <MemoryRouter initialEntries={[context.parameters.attentionEntry ?? '/attention?org=org-story']}><Story /></MemoryRouter>],
  beforeEach: context => attentionFixture(context.parameters.attentionState),
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('link', { name: 'Open task REL-1' })).resolves.toBeVisible(); },
} satisfies Meta<typeof AttentionScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Questions: Story = {};
export const Approvals: Story = { parameters: { attentionEntry: '/attention?org=org-story&kind=approval' } };
export const YourReviews: Story = { parameters: { attentionEntry: '/attention?org=org-story&kind=review' }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).findAllByText('Review assignment date not recorded')).resolves.toHaveLength(3);
} };
export const StalledClaims: Story = { parameters: { attentionEntry: '/attention?org=org-story&kind=stalled_claim' } };
export const SelectedProject: Story = { parameters: { attentionEntry: '/attention?org=org-story&project=project-release' } };
export const NoOrganization: Story = { parameters: { attentionEntry: '/attention' }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).findByText(/Choose an organization/)).resolves.toBeVisible();
} };
export const Loading: Story = { parameters: { attentionState: 'loading' }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).findByText('Loading questions…')).resolves.toBeVisible();
} };
export const Empty: Story = { parameters: { attentionState: 'empty' }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).findByText('No open questions in this scope.')).resolves.toBeVisible();
} };
export const IndependentError: Story = { parameters: { attentionState: 'error', attentionEntry: '/attention?org=org-story&kind=approval' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('temporarily offline');
  await expect(canvas.findByRole('link', { name: /Questions/ })).resolves.toHaveTextContent('3 current');
} };
export const Denied: Story = { parameters: { attentionState: 'denied' }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).findByRole('alert')).resolves.toHaveTextContent('access was removed');
} };
export const UnknownMetadata: Story = { parameters: { attentionState: 'unknown' } };
export const LongLiteralExcerpt: Story = { parameters: { attentionState: 'long' } };
export const OverFifty: Story = { parameters: { attentionState: 'pages' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  for (let i = 0; i < 6; i++) {
    await userEvent.click(await canvas.findByRole('button', { name: 'Load more questions' }));
    await expect(canvas.findByText(`${Math.min(40 + i * 20, 125)} loaded of 125`)).resolves.toBeVisible();
  }
} };
export const NextPageError: Story = { parameters: { attentionState: 'page-error' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Load more questions' }));
  await expect(canvas.findByRole('button', { name: 'Retry loading more questions' })).resolves.toBeVisible();
} };
export const Stale: Story = { parameters: { attentionState: 'stale' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByRole('link', { name: 'Open task REL-1' });
  await userEvent.click(canvas.getByRole('button', { name: 'Refresh questions' }));
  await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('out of date');
} };
