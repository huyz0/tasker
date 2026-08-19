import type { Meta, StoryObj } from '@storybook/react-vite';
import { PaginationControls } from './PaginationControls';

const meta = {
  title: 'UI/PaginationControls',
  component: PaginationControls,
  parameters: {
    layout: 'padded',
  },
  args: {
    onNextPage: () => {},
  },
} satisfies Meta<typeof PaginationControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MorePages: Story = {
  args: {
    nextCursor: 'cursor-2',
  },
};

export const Loading: Story = {
  args: {
    nextCursor: 'cursor-2',
    isLoading: true,
  },
};

export const NoMorePages: Story = {
  args: {
    nextCursor: undefined,
  },
};
