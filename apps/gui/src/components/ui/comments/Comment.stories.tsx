import type { Meta, StoryObj } from '@storybook/react-vite';
import { Comment } from './index';

const meta = {
  title: 'UI/Comment',
  component: Comment.Provider,
  parameters: {
    layout: 'padded',
  },
  args: {
    onAddComment: async (content: string) => {
      console.log('Added comment:', content);
    }
  }
} satisfies Meta<typeof Comment.Provider>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockComments = [
  {
    id: 'cmt-1',
    author: 'Alice (Human)',
    content: 'Can someone please clarify the requirements for this issue? I think we should rewrite the **API**.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    isAgent: false,
  },
  {
    id: 'cmt-2',
    author: 'Architecture Agent',
    content: 'Based on the context, rewriting the API is strictly prohibited. We should instead extend the existing GraphQL resolving endpoints.\n\n```ts\n// Proposed solution\nexport const solver = () => {}\n```',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    isAgent: true,
  },
];

export const Empty: Story = {
  args: { children: <></> },
  render: (args) => (
    <Comment.Provider {...args} initialComments={[]}>
      <Comment.List />
      <Comment.Composer />
    </Comment.Provider>
  )
};

export const Populated: Story = {
  args: { children: <></> },
  render: (args) => (
    <Comment.Provider {...args} initialComments={mockComments}>
      <Comment.List />
      <Comment.Composer />
    </Comment.Provider>
  )
};
