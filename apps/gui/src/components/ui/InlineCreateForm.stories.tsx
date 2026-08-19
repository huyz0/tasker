import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineCreateForm } from './InlineCreateForm';

const meta = {
  title: 'UI/InlineCreateForm',
  component: InlineCreateForm,
  parameters: {
    layout: 'padded',
  },
  args: {
    placeholder: 'New folder name',
    onSubmit: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof InlineCreateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: {
    isSubmitting: true,
  },
};
