import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterPage from './Register';

// The page wrapper around RegisterForm (which has its own dedicated story) -
// this documents the full screen: card chrome and the sign-in link, not just
// the form. No global QueryClientProvider decorator exists in
// .storybook/preview.tsx, and RegisterForm's useMutation needs one to render
// at all - the same reason RegisterForm.stories.tsx scopes its own.
const meta = {
  title: 'Pages/Register',
  component: RegisterPage,
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
} satisfies Meta<typeof RegisterPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
