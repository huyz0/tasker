import { expect, within } from 'storybook/test';
import { commentFixture } from '../../../../.storybook/commentFixture';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Comment } from './index';

const meta = {
  title: 'UI/Comment',
  component: Comment.Provider,
  beforeEach: context => commentFixture(context.parameters.commentState),
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Comment.Provider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnTask: Story = {
  args: {
    entityId: 'task-1',
    entityType: 'task',
    children: (
      <>
        <Comment.List />
        <Comment.Composer />
      </>
    ),
  },
};

export const Empty: Story = { ...OnTask, parameters: { commentState: 'empty' } };
export const Loading: Story = { ...OnTask, parameters: { commentState: 'loading' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByText('Loading comments…')).resolves.toBeVisible(); } };
export const Error: Story = { ...OnTask, parameters: { commentState: 'error' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('alert')).resolves.toHaveTextContent('temporarily offline'); } };
