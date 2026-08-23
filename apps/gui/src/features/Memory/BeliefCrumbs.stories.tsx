import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BeliefCrumbs } from './BeliefCrumbs';
import { useLayoutStore } from '../../store/layout';

/**
 * Unlike the screen stories in this folder, these need no network: the one
 * name the trail resolves (`useScopeLabels`' `getProject`) is seeded straight
 * into the query cache, and `staleTime: Infinity` stops React Query from
 * revalidating it against a backend Storybook cannot reach. So each story
 * below is the trail exactly as a reader sees it, not a loading state.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
queryClient.setQueryData(['project', 'proj-storybook'], { id: 'proj-storybook', name: 'Apollo' });

const meta = {
  title: 'Features/Memory/BeliefCrumbs',
  component: BeliefCrumbs,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook', activeProjectId: 'proj-storybook' });
      return (
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta<typeof BeliefCrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Project memory: the project is the belief's parent, so it opens the trail. */
export const ProjectScope: Story = {
  args: { scopeType: 'project', statement: 'Tests must pass' },
};

/**
 * Organization memory: no project crumb, because an organization belief does
 * not belong to the project the switcher happens to have selected.
 */
export const OrganizationScope: Story = {
  args: { scopeType: 'organization', statement: 'Tests must pass' },
};

/** A statement is a sentence and a trail is one line, so it is excerpted. */
export const LongStatement: Story = {
  args: {
    scopeType: 'project',
    statement: 'Every migration is replayed against MySQL before it is merged',
  },
};

/**
 * A single unbroken token has no word boundary to stop at, so it is cut at
 * the limit rather than allowed to run the full width of the trail.
 */
export const UnbrokenStatement: Story = {
  args: { scopeType: 'project', statement: 'Supercalifragilisticexpialidocious' },
};
