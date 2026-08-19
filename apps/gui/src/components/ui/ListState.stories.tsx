import type { Meta, StoryObj } from '@storybook/react-vite';
import { ListState } from './ListState';
import { Button } from './button';

const meta = {
  title: 'UI/ListState',
  component: ListState,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ListState>;

export default meta;
type Story = StoryObj<typeof meta>;

// Pure, prop-driven component - no RPC/store, so all four states
// frontend-standard.md's §Storybook asks for are genuinely reachable here,
// unlike the manager screens that own a real createClient(...) call.
export const Loading: Story = {
  args: {
    isLoading: true,
    error: null,
    isEmpty: false,
    emptyMessage: 'No projects found.',
  },
};

export const ErrorState: Story = {
  args: {
    isLoading: false,
    error: new Error('the request failed'),
    isEmpty: false,
    emptyMessage: 'No projects found.',
    onRetry: () => {},
  },
};

export const Empty: Story = {
  args: {
    isLoading: false,
    error: null,
    isEmpty: true,
    emptyMessage: 'No projects found.',
    emptyAction: <Button size="sm">Create a project</Button>,
  },
};

export const Populated: Story = {
  args: {
    isLoading: false,
    error: null,
    isEmpty: false,
    emptyMessage: 'No projects found.',
    children: <ul className="p-4 text-sm"><li>Seed Project</li><li>Another Project</li></ul>,
  },
};
