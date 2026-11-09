import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';
import { Button } from './button';

const meta = {
  title: 'UI/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded', docs: { description: { component: 'Shared page-title type role with primary actions and an independent wrapping toolbar.' } } },
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

export const WithToolbar: Story = {
  args: {
    title: 'Tasks',
    description: 'Every task in this project, by status.',
    toolbar: <><Button>Board</Button><Button>Table</Button><input aria-label="Filter tasks" placeholder="Filter tasks…" className="min-w-0 rounded-md border px-3 py-2" /><Button>Any priority</Button><Button>Ready only</Button><Button>Waiting on people</Button></>,
  },
};
