import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HandoffsScreen } from './index';
import { useLayoutStore } from '../../store/layout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/** No selected project, or a selected project whose read is unavailable. */
const meta: Meta<typeof HandoffsScreen> = {
  title: 'Features/HandoffsScreen',
  component: HandoffsScreen,
  parameters: { router: false,
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
