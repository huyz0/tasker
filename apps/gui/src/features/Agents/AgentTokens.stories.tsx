import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { AgentTokens } from './AgentTokens';
import { agentTokenFixture } from '../../../.storybook/agentTokenFixture';
function TokenPreview({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><div className="max-w-2xl">{children}</div></QueryClientProvider>;
}
const meta = {
  title: 'Features/Agents/AgentTokens', component: AgentTokens, parameters: { layout: 'padded' },
  args: { agentId: 'agent-storybook', agentName: 'Release worker', orgId: 'org-storybook', accountId: 'user-storybook', projectId: 'project-storybook' },
  beforeEach: context => agentTokenFixture(context.parameters.tokenState),
  decorators: [Story => <TokenPreview><Story /></TokenPreview>],
} satisfies Meta<typeof AgentTokens>;
export default meta;
type Story = StoryObj<typeof meta>;
const draft: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'New token' }));
  await userEvent.type(canvas.getByLabelText('Name'), 'Release worker'); await userEvent.click(canvas.getByRole('checkbox', { name: 'tasks:read' }));
};
const submit: Story['play'] = async context => { await draft!(context); await userEvent.click(within(context.canvasElement).getByRole('button', { name: 'Create' })); };
const ready: Story['play'] = async context => { await submit!(context); await expect(within(context.canvasElement).findByRole('heading', { name: 'Save this token' })).resolves.toBeVisible(); };
const verify: Story['play'] = async context => { await ready!(context); await userEvent.click(within(context.canvasElement).getByRole('button', { name: 'Verify token' })); };
export const Default: Story = { play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No tokens for this agent.')).resolves.toBeVisible(); } };
export const Loading: Story = { parameters: { tokenState: 'loading' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading tokens…')).resolves.toBeVisible(); } };
export const Denied: Story = { parameters: { tokenState: 'denied' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText(/Token administration is unavailable/)).resolves.toBeVisible(); } };
export const Error: Story = { ...Denied, parameters: { tokenState: 'error' } };
export const ExplicitScopes: Story = { play: draft };
export const Issuing: Story = { parameters: { tokenState: 'issuing' }, play: async context => { await submit!(context); await expect(within(context.canvasElement).findByRole('button', { name: 'Creating…' })).resolves.toBeDisabled(); } };
export const IssueFailed: Story = { parameters: { tokenState: 'issue-failed' }, play: async context => { await submit!(context); await expect(within(context.canvasElement).findByText(/Failed to create token/)).resolves.toBeVisible(); } };
export const TokenReady: Story = { play: ready };
export const CopyFailed: Story = { parameters: { tokenState: 'copy-failed' }, play: async context => { await ready!(context); const canvas = within(context.canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Copy token' })); await expect(canvas.findByText(/Could not copy automatically/)).resolves.toBeVisible(); } };
export const McpConfiguration: Story = { play: async context => { await ready!(context); const canvas = within(context.canvasElement); await userEvent.selectOptions(canvas.getByLabelText('Configuration format'), 'mcp'); await expect(canvas.getByLabelText('Worker configuration')).toHaveTextContent('mcpServers'); } };
export const Verifying: Story = { parameters: { tokenState: 'verifying' }, play: async context => { await verify!(context); await expect(within(context.canvasElement).findByRole('button', { name: 'Verifying…' })).resolves.toBeDisabled(); } };
export const Verified: Story = { parameters: { tokenState: 'verified' }, play: async context => { await verify!(context); await expect(within(context.canvasElement).findByText(/Token verified at/)).resolves.toBeVisible(); } };
export const Refused: Story = { parameters: { tokenState: 'refused' }, play: async context => { await verify!(context); await expect(within(context.canvasElement).findByText(/Token refused/)).resolves.toBeVisible(); } };
export const Offline: Story = { parameters: { tokenState: 'offline' }, play: async context => { await verify!(context); await expect(within(context.canvasElement).findByText(/Could not reach the API/)).resolves.toBeVisible(); } };
export const UnexpectedIdentity: Story = { parameters: { tokenState: 'unexpected' }, play: async context => { await verify!(context); await expect(within(context.canvasElement).findByText(/different identity/)).resolves.toBeVisible(); } };
export const Dismissed: Story = { play: async context => { await ready!(context); const canvas = within(context.canvasElement); await userEvent.click(canvas.getByRole('button', { name: "I've saved it" })); await expect(canvas.findByText(/Lost this token/)).resolves.toBeVisible(); } };
export const Revoked: Story = { parameters: { tokenState: 'revoked' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('revoked')).resolves.toBeVisible(); } };
export const Expired: Story = { parameters: { tokenState: 'expired' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('expired')).resolves.toBeVisible(); } };
export const LongMetadata: Story = { parameters: { tokenState: 'long' }, play: ready };
