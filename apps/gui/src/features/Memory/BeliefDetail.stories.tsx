import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BeliefDetail } from './index';
import { useLayoutStore } from '../../store/layout';

/**
 * The panel behind `/memory/:beliefId`, which had no story of its own until
 * now — including the foreign-scope banner M28-T06 added, the one piece of
 * this screen whose whole purpose is to be *seen* and which nothing was
 * showing.
 *
 * Both of its queries (relations, promotions) are seeded into the cache with
 * `staleTime: Infinity`, so these render the settled panel rather than the
 * failed-request state a Storybook with no backend would otherwise produce.
 */
const BELIEF_ID = 'blf-42';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
queryClient.setQueryData(['memoryBeliefRelations', BELIEF_ID], []);
queryClient.setQueryData(['memoryBeliefPromotions', BELIEF_ID], []);

const belief = {
  id: BELIEF_ID,
  orgId: 'org-storybook',
  scopeType: 'project',
  scopeId: 'proj-storybook',
  statement: 'Migrations are replayed against MySQL before a branch is merged.',
  confidence: 'high',
  status: 'active',
  sourceKind: 'agent',
  sourceAgentId: 'agt-7',
  createdAt: '2026-08-01T09:00:00Z',
};

const meta = {
  title: 'Features/Memory/BeliefDetail',
  component: BeliefDetail,
  parameters: { layout: 'padded' },
  args: { belief, onSelect: () => {} },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof BeliefDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A belief belonging to the organization and project currently being read. */
export const Default: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook', activeProjectId: 'proj-storybook' });
      return <Story />;
    },
  ],
};

/**
 * The same panel for a belief reached from elsewhere — a link out of a task,
 * or a pasted `/memory/:beliefId`. `getBelief` answers by id alone, so this
 * is reachable whenever the belief lives in another project. It is still
 * worth reading; what it must never do is pass for one of this project's,
 * hence the banner.
 */
export const ForeignScope: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook', activeProjectId: 'proj-elsewhere' });
      return <Story />;
    },
  ],
};
