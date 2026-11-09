import { useEffect, useState, type ReactNode } from 'react';
import { useSummaryDrafts } from './summaryDrafts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { PlanStepSchema, TaskSummarySchema, UsageTotalsSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { SummaryPreview } from '../../../.storybook/SummaryPreview';
import { TaskContext } from './TaskContext';
import { TaskArtifactLinks } from './TaskArtifactLinks';
import { evidenceFixture } from '../../../.storybook/evidenceFixture';
import { expect, within } from 'storybook/test';

function ContextOwner({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useSummaryDrafts.getState().setAccount('context-story-user'); setReady(true);
    return () => useSummaryDrafts.getState().endSession();
  }, []);
  return ready ? children : null;
}

function ContextCache({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const meta = {
  title: 'Features/Tasks/Optional context', component: TaskContext,
  args: { taskId: 'task-story' },
  decorators: [(Story) => <ContextOwner><ContextCache><div className="max-w-2xl p-panel"><Story /></div></ContextCache></ContextOwner>],
} satisfies Meta<typeof TaskContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Populated: Story = { args: {
  summary: create(TaskSummarySchema, { text: 'Verified the release and recorded the outcome.', authorName: 'Release agent', updatedAt: '2026-11-08T09:00:00Z' }),
  plan: [create(PlanStepSchema, { title: 'Verify the build', status: 'done' }), create(PlanStepSchema, { title: 'Publish the release notes', status: 'in_progress' })],
  usage: create(UsageTotalsSchema, { reports: 2n, inputTokens: 12000n, outputTokens: 2000n, costMicros: 30000n }),
} };

export const RestoredDraft: Story = { render: () => <SummaryPreview state="restored" /> };

export const EvidenceAfterSummary: Story = {
  beforeEach: () => evidenceFixture(),
  args: { ...Populated.args, taskId: 'task-storybook', children: <TaskArtifactLinks taskId="task-storybook" orgId="org-storybook" /> },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).findByRole('link', { name: 'release-verification.md' })).resolves.toBeVisible(); },
};
