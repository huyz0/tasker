import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { SavedViews } from './SavedViews';
import { savedViewFixture } from '../../../.storybook/savedViewFixture';
const meta = {
  title: 'Features/Saved views', component: SavedViews, args: { screen: 'tasks' },
  parameters: { router: false, layout: 'padded', docs: { description: { component: 'Real named-view controls and serialized synthetic responses cover bounded independent audiences, fresh explicit Open, private defaults and recoverable naming. These previews establish visual behavior, not live server authority.' } } },
  beforeEach: context => savedViewFixture(context.parameters.savedViewState, context.args.screen),
  decorators: [(Story, context) => <MemoryRouter initialEntries={[`/${context.args.screen}?org=org-storybook&project=project-storybook`]}><Story /></MemoryRouter>],
} satisfies Meta<typeof SavedViews>;
export default meta;
type Story = StoryObj<typeof meta>;
const opened: Story['play'] = async ({ canvasElement }) => { await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Saved views' }));await expect(within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Saved views' })).resolves.toBeVisible(); };
const populated: Story['play'] = async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByText('My release review')).resolves.toBeVisible(); };
const draft: Story['play'] = async context => { await opened!(context);const page = within(context.canvasElement.ownerDocument.body);await userEvent.click(await page.findByRole('button', { name: 'Save current view' }));await userEvent.type(page.getByLabelText('View name'), 'Weekly release'); };
const submitted: Story['play'] = async context => { await draft!(context);await userEvent.click(within(context.canvasElement.ownerDocument.body).getByRole('button', { name: 'Save view' })); };
export const Entry: Story = {};
export const PersonalAndOrganization: Story = { play: populated };
export const Empty: Story = { parameters: { savedViewState: 'empty' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByText('No personal views yet. Use Save current view to add one.')).resolves.toBeVisible(); } };
export const Loading: Story = { parameters: { savedViewState: 'loading' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByText('Loading Personal views…')).resolves.toBeVisible(); } };
export const Error: Story = { parameters: { savedViewState: 'error' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('button', { name: 'Retry Personal views' })).resolves.toBeVisible(); } };
export const Denied: Story = { parameters: { savedViewState: 'denied' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('button', { name: 'Refresh lists' })).resolves.toBeEnabled(); } };
export const ReadOnlyShared: Story = { parameters: { savedViewState: 'read-only' }, play: populated };
export const RestrictedProjectName: Story = { parameters: { savedViewState: 'restricted-project' }, play: populated };
export const ObsoleteProject: Story = { parameters: { savedViewState: 'obsolete' }, play: populated };
export const InvalidDefinition: Story = { parameters: { savedViewState: 'invalid' }, play: populated };
export const LongNames: Story = { parameters: { savedViewState: 'long' }, play: opened };
export const NamingDraft: Story = { play: draft };
export const HoveredSave: Story = { play: async context => { await draft!(context);await userEvent.hover(within(context.canvasElement.ownerDocument.body).getByRole('button', { name: 'Save view' })); } };
export const DuplicateName: Story = { parameters: { savedViewState: 'duplicate' }, play: async context => { await submitted!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('alert')).resolves.toBeVisible(); } };
export const SavePending: Story = { parameters: { savedViewState: 'pending' }, play: async context => { await submitted!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('button', { name: 'Saving…' })).resolves.toBeDisabled(); } };
export const SaveDenied: Story = { parameters: { savedViewState: 'save-denied' }, play: DuplicateName.play };
export const BeyondFirstHundred: Story = { parameters: { savedViewState: 'beyond-page' }, play: async context => {
  await opened!(context);const page=within(context.canvasElement.ownerDocument.body);await page.findByText('personal release 001');
  for(let i=1;i<=5;i++){await userEvent.click(page.getByRole('button',{name:'Next Personal views'}));await page.findByText(`personal release ${String(i*20+1).padStart(3,'0')}`);}
  await expect(page.getByText('personal release 101')).toBeVisible();
} };
export const OpenDenied: Story = { parameters: { savedViewState: 'open-denied' }, play: async context => { await populated!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.click(page.getByRole('button',{name:'Open My release review'}));await expect(page.findByRole('alert')).resolves.toBeVisible(); } };
export const RenameDraft: Story = { play: async context => { await populated!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.click(page.getByRole('button',{name:'Rename My release review'}));await expect(page.findByLabelText('View name')).resolves.toHaveValue('My release review'); } };
export const DeleteConfirmation: Story = { play: async context => { await populated!(context);await userEvent.click(within(context.canvasElement.ownerDocument.body).getByRole('button',{name:'Delete My release review'})); } };
export const LongDeleteConfirmation: Story = { parameters: { savedViewState: 'long' }, play: async context => { await opened!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.click(await page.findByRole('button',{name:/^Delete ReleaseW/})); } };
export const Reports: Story = { args: { screen: 'reports' }, play: populated };
export const SignedOut: Story = { parameters: { savedViewState: 'signed-out' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('alert')).resolves.toBeVisible(); } };
export const CheckingSession: Story = { parameters: { savedViewState: 'auth-loading' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByText('Checking your session…')).resolves.toBeVisible(); } };


export const EmptyPageRecovery: Story = { parameters: { savedViewState: 'empty-page' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('button', { name: 'Refresh Personal views' })).resolves.toBeEnabled(); } };
export const SessionError: Story = { parameters: { savedViewState: 'session-error' }, play: async context => { await opened!(context);await expect(within(context.canvasElement.ownerDocument.body).findByRole('button', { name: 'Retry session' })).resolves.toBeEnabled(); } };
export const OldServerPersonalDefault: Story = { parameters: { savedViewState: 'old-server' }, play: async context => { await draft!(context);await expect(within(context.canvasElement.ownerDocument.body).queryByRole('option', { name: 'Organization' })).not.toBeInTheDocument(); } };
export const RenameDuplicate: Story = { parameters: { savedViewState: 'rename-error' }, play: async context => { await RenameDraft.play!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.clear(page.getByLabelText('View name'));await userEvent.type(page.getByLabelText('View name'),'Another release');await userEvent.click(page.getByRole('button',{name:'Rename view'}));await expect(page.findByRole('alert')).resolves.toBeVisible();await expect(page.getByLabelText('View name')).toHaveValue('Another release'); } };
export const DeleteError: Story = { parameters: { savedViewState: 'delete-error' }, play: async context => { await DeleteConfirmation.play!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.click(page.getByRole('button',{name:'Delete view'}));await expect(page.findByRole('alert')).resolves.toBeVisible(); } };


export const SharedRenameRevoked: Story = { parameters: { savedViewState: 'edit-revoked' }, play: async context => { await populated!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.click(page.getByRole('button',{name:'Rename Organization release review'}));await userEvent.clear(page.getByLabelText('View name'));await userEvent.type(page.getByLabelText('View name'),'Retained shared name');await userEvent.click(page.getByRole('button',{name:'Rename view'}));await expect(page.findByRole('button',{name:'Check editing access'})).resolves.toBeVisible();await expect(page.getByRole('button',{name:'Rename view'})).toBeDisabled(); } };
export const SharedDeleteRevoked: Story = { parameters: { savedViewState: 'edit-revoked' }, play: async context => { await populated!(context);const page=within(context.canvasElement.ownerDocument.body);await userEvent.click(page.getByRole('button',{name:'Delete Organization release review'}));await userEvent.click(page.getByRole('button',{name:'Delete view'}));await expect(page.findByRole('button',{name:'Check editing access'})).resolves.toBeVisible();await expect(page.getByRole('button',{name:'Delete view'})).toBeDisabled(); } };
