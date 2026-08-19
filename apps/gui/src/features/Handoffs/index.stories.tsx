import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HandoffsScreen } from './index';
import { useLayoutStore } from '../../store/layout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/**
 * Only two stories, not the four `frontend-standard.md` §Storybook asks for
 * (Empty/Loading/Error/Populated) - the same gap, for the same reason,
 * documented on `Memory/index.stories.tsx`: no MSW (or other fetch
 * interception) is wired into `.storybook/preview.tsx`, so a screen that owns
 * a real `createClient(...)` call cannot be driven into a populated or error
 * state deterministically without new, unverified protocol-mocking
 * infrastructure this one story file shouldn't build alone. Both stories
 * below are genuine, zero-mocking states: no project selected (`Default`),
 * and a project selected with the real backend unreachable in Storybook
 * (`WithProjectSelected` - shows the loading state that never resolves,
 * itself a real and useful thing to look at).
 */
const meta: Meta<typeof HandoffsScreen> = {
  title: 'Features/HandoffsScreen',
  component: HandoffsScreen,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/handoffs']}>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof HandoffsScreen>;

export const Default: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
      return <Story />;
    },
  ],
};

export const WithProjectSelected: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook', activeProjectId: 'proj-storybook' });
      return <Story />;
    },
  ],
};
