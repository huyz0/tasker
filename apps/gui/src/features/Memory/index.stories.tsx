import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MemoryExplorer } from './index';
import { useLayoutStore } from '../../store/layout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/**
 * Only two stories, not the four `frontend-standard.md` §Storybook asks for
 * (Empty/Loading/Error/Populated) - and both are the screen's *real*
 * behaviour under the real `useLayoutStore`/`QueryClientProvider`, not a
 * mocked network response. Every existing manager screen in this codebase
 * (`Teams`, `Roles`, `Organizations`, `GlobalSearch`) has exactly the same
 * gap: there is no MSW (or any other fetch-interception) wired into
 * `.storybook/preview.tsx`, and no story here uses a `play` function either,
 * so nothing can deterministically drive a *populated* or *error* state for
 * a component that owns a real `createClient(...)` call the way this one
 * does. Hand-crafting a raw fetch response to fake one (Connect's JSON wire
 * envelope, not just the message shape) would be new, unverified protocol
 * surface for this one story file to carry alone. Building that
 * infrastructure properly - real MSW handlers, shared across every manager
 * screen - is a cross-cutting investment that belongs to its own task, not
 * something to improvise here first. Both stories below are genuine states
 * a real user reaches with zero mocking: no organization selected (`Default`,
 * `activeOrgId` defaults to `''`), and a project selected with nothing typed
 * yet (`WithProjectSelected`, via `useLayoutStore.setState` - the same real
 * store the app itself uses, not a mock of it).
 */
const meta: Meta<typeof MemoryExplorer> = {
  title: 'Features/MemoryExplorer',
  component: MemoryExplorer,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/memory']}>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MemoryExplorer>;

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
