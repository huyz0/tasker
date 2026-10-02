import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';
import { Button } from './button';

const meta = {
  title: 'UI/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = { args: { title: 'Bin' } };

export const WithDescription: Story = {
  args: { title: 'Labels', description: 'Tags you can put on any task in this organization.' },
};

export const WithActions: Story = {
  args: {
    title: 'Roles',
    description: 'The four built-in roles apply to every organization. Custom roles are yours to define.',
    actions: <Button>Create role</Button>,
  },
};
