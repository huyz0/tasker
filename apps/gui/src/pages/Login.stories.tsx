import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './Login';

// The page wrapper around LoginForm (which has its own dedicated story) -
// this documents the full screen: card chrome, the "or" divider, and the
// Google continue button, not just the form. No global QueryClientProvider
// decorator exists in .storybook/preview.tsx, and LoginForm's useMutation
// needs one to render at all - the same reason LoginForm.stories.tsx scopes
// its own.
const meta = {
  title: 'Pages/Login',
  component: LoginPage,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
