import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurrentUser } from './CurrentUser';

// CurrentUser owns a real createClient(...) call (AuthService.getIdentity).
// No global QueryClientProvider decorator exists in .storybook/preview.tsx,
// and no MSW is wired in - so, per the same documented gap as
// Memory/Handoffs' own stories, only the real zero-mocking state is
// reachable here: renders nothing while getIdentity is loading/unreachable
// (CurrentUser.tsx's own doc comment: a stand-in avatar in that state would
// be exactly the fabrication M05 removed).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Layout/CurrentUser',
  component: CurrentUser,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof CurrentUser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
