import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommentSection } from './CommentSection';

const meta = {
  title: 'UI/CommentSection',
  component: CommentSection,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    onAddComment: { action: 'added comment' },
  },
} satisfies Meta<typeof CommentSection>;

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
  args: {
    comments: [],
    isLoading: false,
    onAddComment: async () => {},
  },
};

export const Populated: Story = {
  args: {
    comments: mockComments,
    isLoading: false,
    onAddComment: async () => {},
  },
};

export const LoadingState: Story = {
  args: {
    comments: mockComments,
    isLoading: true,
    onAddComment: async () => {},
  },
};
