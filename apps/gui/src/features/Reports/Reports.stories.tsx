import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StalledWorkCard } from './StalledWorkCard';
import { WentBackwardsCard } from './WentBackwardsCard';
import { ChurningTasksCard } from './ChurningTasksCard';
import { FleetScorecardCard } from './FleetScorecardCard';

/**
 * Card stories with fixture props, not screen stories: `ReportsScreen` owns a
 * real `createClient(...)` query and no MSW is wired into
 * `.storybook/preview.tsx` — the same documented gap as the Dashboard,
 * Memory and Handoffs stories. The cards themselves are presentational, so
 * every visual state is reachable here without protocol mocking. (The
 * QueryClientProvider exists for StalledWorkCard's unassign mutation hook.)
 */
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const meta = {
  title: 'Features/Reports',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reports']}>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The urgent card under load: both sections filled, both badge kinds. */
export const StalledHeavy: Story = {
  render: () => (
    <StalledWorkCard
      stalledClaims={[
        {
          taskId: 't-1', taskDisplayId: 'TSK-101', taskTitle: 'Migrate the billing job to the new queue',
          agentId: 'a-1', agentName: 'Builder One',
          claimedAt: hoursAgo(30), agentLastSeenAt: hoursAgo(2), neverStarted: true,
        },
        {
          taskId: 't-2', taskDisplayId: 'TSK-102', taskTitle: 'Speed up the search index rebuild',
          agentId: 'a-2', agentName: 'Fixer Two',
          claimedAt: hoursAgo(72), lastSignalAt: hoursAgo(30), agentLastSeenAt: hoursAgo(30), neverStarted: false,
        },
        {
          taskId: 't-3', taskDisplayId: 'TSK-103', taskTitle: 'Chase the flaky proxy timeout',
          agentId: 'a-3', agentName: 'Scout Three',
          lastSignalAt: hoursAgo(50), neverStarted: false,
        },
      ]}
      unclaimed={[
        { taskId: 't-4', taskDisplayId: 'TSK-104', taskTitle: 'Rotate the API keys', waitingSince: hoursAgo(96) },
        { taskId: 't-5', taskDisplayId: 'TSK-105', taskTitle: 'Write the retention runbook', waitingSince: hoursAgo(40) },
      ]}
    />
  ),
};

export const WentBackwards: Story = {
  render: () => (
    <WentBackwardsCard
      regressions={[
        {
          taskId: 't-6', taskDisplayId: 'TSK-106', taskTitle: 'Fix the login redirect',
          fromStatus: 'done', toStatus: 'in_progress', occurredAt: hoursAgo(5),
          actorName: 'Huy Nguyen', holderAgentName: 'Fixer Two',
        },
        {
          taskId: 't-7', taskDisplayId: 'TSK-107', taskTitle: 'Harden the webhook retries',
          fromStatus: 'done', toStatus: 'todo', occurredAt: hoursAgo(26),
        },
      ]}
    />
  ),
};

export const ChurningTasks: Story = {
  render: () => (
    <ChurningTasksCard
      churning={[
        {
          taskId: 't-8', taskDisplayId: 'TSK-108', taskTitle: 'Refactor the mailer templates',
          handoffCount: 4n, lastAgentName: 'Fixer Two', lastHandoffAt: hoursAgo(8), claimHeld: true,
        },
        {
          taskId: 't-9', taskDisplayId: 'TSK-109', taskTitle: 'Untangle the seed script',
          handoffCount: 2n, lastAgentName: 'Builder One', lastHandoffAt: hoursAgo(20), claimHeld: false,
        },
      ]}
    />
  ),
};

export const FleetScorecard: Story = {
  render: () => (
    <FleetScorecardCard
      agentRows={[
        {
          subjectId: 'a-2', subjectName: 'Fixer Two', claimed: 9n, completed: 6n, reopened: 3n,
          handedOff: 2n, takenAway: 1n, autonomousCompleted: 4n, openNow: 2n, lastActiveAt: hoursAgo(30),
        },
        {
          subjectId: 'a-1', subjectName: 'Builder One', claimed: 5n, completed: 4n, reopened: 1n,
          handedOff: 1n, takenAway: 0n, autonomousCompleted: 3n, openNow: 1n, lastActiveAt: hoursAgo(2),
        },
        {
          subjectId: 'a-gone', subjectName: '(deleted agent)', claimed: 2n, completed: 1n, reopened: 1n,
          handedOff: 0n, takenAway: 1n, autonomousCompleted: 0n, openNow: 0n,
        },
      ]}
      roleRows={[
        {
          subjectId: 'r-1', subjectName: 'Builder', claimed: 14n, completed: 10n, reopened: 4n,
          handedOff: 3n, takenAway: 2n, autonomousCompleted: 7n, openNow: 3n, lastActiveAt: hoursAgo(2),
        },
      ]}
    />
  ),
};

/** Every card at rest — each empty state says something specific. */
export const EmptyEverything: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <StalledWorkCard stalledClaims={[]} unclaimed={[]} />
      <WentBackwardsCard regressions={[]} />
      <ChurningTasksCard churning={[]} />
      <FleetScorecardCard agentRows={[]} roleRows={[]} />
    </div>
  ),
};
