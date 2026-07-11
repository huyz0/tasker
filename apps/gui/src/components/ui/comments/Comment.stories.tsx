import type { Meta, StoryObj } from '@storybook/react-vite';
import { Comment } from './index';

const meta = {
  title: 'UI/Comment',
  component: Comment.Provider,
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
