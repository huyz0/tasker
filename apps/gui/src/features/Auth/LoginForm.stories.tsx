// eslint-disable-next-line storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from './LoginForm';

// No global QueryClientProvider decorator exists in .storybook/preview.tsx,
// and LoginForm's useMutation needs one to render at all - scoped here
// rather than added globally, since this file owns the only story that
// needs it right now.
const meta: Meta<typeof LoginForm> = {
  title: 'Features/Auth/LoginForm',
  component: LoginForm,
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

export const Default: StoryObj<typeof LoginForm> = {};
