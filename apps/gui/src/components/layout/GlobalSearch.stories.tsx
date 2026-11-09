import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SearchPreview } from '../../../.storybook/SearchPreview';
import { GlobalSearch } from './GlobalSearch';

const meta = {
  title: 'Layout/GlobalSearch', component: GlobalSearch,
  parameters: { router: false, layout: 'fullscreen' },
} satisfies Meta<typeof GlobalSearch>;
export default meta;
type Story = StoryObj<typeof meta>;

const typeQuery: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement.ownerDocument.body);
  const input = await canvas.findByRole('combobox', { name: 'Search workspace' });
  await userEvent.type(input, 'release');
};

export const Default: Story = { render: () => <SearchPreview state="empty" /> };
export const Populated: Story = {
  render: () => <SearchPreview state="populated" />,
  play: async context => {
    await typeQuery(context);
    await expect(within(context.canvasElement.ownerDocument.body).findByRole('option', { name: /Reusable release convention/ })).resolves.toBeVisible();
  },
};
export const Loading: Story = { render: () => <SearchPreview state="loading" />, play: typeQuery };
export const Unavailable: Story = {
  render: () => <SearchPreview state="error" />,
  play: async context => {
    await typeQuery(context);
    await expect(within(context.canvasElement.ownerDocument.body).findByRole('alert')).resolves.toHaveTextContent('Search is temporarily unavailable');
  },
};
export const NoMatches: Story = {
  render: () => <SearchPreview state="no-match" />,
  play: async context => {
    await typeQuery(context);
    await expect(within(context.canvasElement.ownerDocument.body).findByText('No results found.')).resolves.toBeVisible();
  },
};
export const NoOrganization: Story = { render: () => <SearchPreview state="no-org" /> };
