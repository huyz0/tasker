import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AgentsDashboard } from './index';
import { registrationFixture } from '../../../.storybook/registrationFixture';
const meta = {
  title: 'Features/AgentsDashboard', component: AgentsDashboard,
  beforeEach: context => registrationFixture(context.parameters.registrationState),
  parameters: { docs: { description: { component: 'Register an identity for an external worker, choose role instructions and open one connection section outside the paged list. Token configuration and exact-credential verification build on the existing token controls.' } } },
} satisfies Meta<typeof AgentsDashboard>;
export default meta;
type Story = StoryObj<typeof meta>;
const ready: Story['play'] = async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('button', { name: 'Tokens for Release worker' })).resolves.toBeVisible(); };
const draft: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Register agent' }));
  await userEvent.type(canvas.getByRole('textbox', { name: 'Agent name' }), 'New release worker');
  await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Role' }), await canvas.findByRole('option', { name: 'Release reviewer' }));
};
const submit: Story['play'] = async context => { await draft!(context); await userEvent.click(within(context.canvasElement).getByRole('button', { name: 'Register' })); };
export const Default: Story = { play: ready };
export const Empty: Story = { parameters: { registrationState: 'empty' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('No agents registered yet.')).resolves.toBeVisible(); } };
export const Loading: Story = { parameters: { registrationState: 'loading' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading agents…')).resolves.toBeVisible(); } };
export const Error: Story = { parameters: { registrationState: 'error' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText(/registered-agent list is temporarily offline/)).resolves.toBeVisible(); } };
export const NoRoles: Story = { parameters: { registrationState: 'no-roles' }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Register agent' })); await expect(canvas.findByRole('button', { name: 'Create a role' })).resolves.toBeVisible(); } };
export const RoleReadDenied: Story = { parameters: { registrationState: 'roles-error' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText(/role catalog is unavailable/)).resolves.toBeVisible(); } };
export const RegistrationDraft: Story = { play: draft };
export const RegistrationPending: Story = { parameters: { registrationState: 'pending' }, play: async context => { await submit!(context); await expect(within(context.canvasElement).findByRole('button', { name: 'Registering…' })).resolves.toBeDisabled(); } };
export const RegistrationDenied: Story = { parameters: { registrationState: 'denied' }, play: async context => { await submit!(context); await expect(within(context.canvasElement).findByText(/Could not register agent/)).resolves.toBeVisible(); } };
export const RegisteredBeyondLoadedPage: Story = { parameters: { registrationState: 'beyond-page' }, play: async context => {
  await submit!(context); const canvas = within(context.canvasElement), connection = within(await canvas.findByRole('region', { name: 'Connect New release worker' }));
  await expect(connection.findByText('No tokens for this agent.')).resolves.toBeVisible();
} };
export const ExistingConnection: Story = { play: async context => { await ready!(context); const canvas = within(context.canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Tokens for Release worker' })); await expect(within(await canvas.findByRole('region', { name: 'Connect Release worker' })).findByText('No tokens for this agent.')).resolves.toBeVisible(); } };
export const LongConnectionName: Story = { parameters: { registrationState: 'long' }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: /^Tokens for/ })); await expect(within(await canvas.findByRole('region', { name: /^Connect / })).findByText('No tokens for this agent.')).resolves.toBeVisible(); } };
export const NoOrganization: Story = { parameters: { registrationState: 'no-org' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText(/Choose an organization/)).resolves.toBeVisible(); } };
export const CheckingAccount: Story = { parameters: { registrationState: 'auth-loading' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Checking account…')).resolves.toBeVisible(); } };
export const SignedOut: Story = { parameters: { registrationState: 'signed-out' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Sign in to register agents.')).resolves.toBeVisible(); } };

const roleDraft: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'New role' }));
  await userEvent.type(canvas.getByRole('textbox', { name: 'Role name' }), 'Release analyst');
  await userEvent.type(canvas.getByRole('textbox', { name: 'System prompt' }), 'Inspect the current release evidence.');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Capabilities' }), '[["review"]');
};
export const RoleCreationDraft: Story = { play: roleDraft };
export const RoleCreationPending: Story = { parameters: { registrationState: 'role-pending' }, play: async context => {
  await roleDraft!(context); const canvas = within(context.canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Create role' }));
  await expect(canvas.findByRole('button', { name: 'Creating…' })).resolves.toBeDisabled(); await expect(canvas.getByRole('textbox', { name: 'Role name' })).toBeDisabled();
} };
export const RoleCreationDenied: Story = { parameters: { registrationState: 'role-denied' }, play: async context => {
  await roleDraft!(context); const canvas = within(context.canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Create role' }));
  await expect(canvas.findByText(/Failed to create role/)).resolves.toBeVisible(); await expect(canvas.getByRole('textbox', { name: 'Role name' })).toHaveValue('Release analyst');
} };
export const CreateFirstRole: Story = { parameters: { registrationState: 'no-roles' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole('button', { name: 'Register agent' }));
  await userEvent.type(canvas.getByRole('textbox', { name: 'Agent name' }), 'First worker'); await userEvent.click(await canvas.findByRole('button', { name: 'Create a role' }));
  await userEvent.type(canvas.getByRole('textbox', { name: 'Role name' }), 'Release analyst'); await userEvent.type(canvas.getByRole('textbox', { name: 'System prompt' }), 'Inspect current evidence.');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Capabilities' }), '[["review"]'); await userEvent.click(canvas.getByRole('button', { name: 'Create role' }));
  await expect(canvas.findByRole('option', { name: 'Release analyst' })).resolves.toBeVisible(); await expect(canvas.getByRole('combobox', { name: 'Role' })).toHaveFocus();
} };
