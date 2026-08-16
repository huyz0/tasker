// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegisterForm } from './RegisterForm';

const meta: Meta<typeof RegisterForm> = {
  title: 'Features/Auth/RegisterForm',
  component: RegisterForm,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <div className="max-w-sm p-8">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};
export default meta;

export const Default: StoryObj<typeof RegisterForm> = {};
