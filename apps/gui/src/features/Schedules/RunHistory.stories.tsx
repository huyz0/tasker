import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';
import { ScheduleRunSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
import { RunHistory } from './RunHistory';

const accepted = '2026-11-09T10:00:00Z';
const meta = {
  title: 'Features/Schedules/RunHistory', component: RunHistory,
  parameters: { router: false },
  decorators: [(Story) => <MemoryRouter><div className="max-w-3xl p-panel"><Story /></div></MemoryRouter>],
  args: { orgId: 'org-story', projectId: 'project-story', runs: [] },
} satisfies Meta<typeof RunHistory>;
export default meta;
type Story = StoryObj<typeof meta>;
const receipt = (outcome: string, fields: Parameters<typeof create<typeof ScheduleRunSchema>>[1] = {}) => create(ScheduleRunSchema, {
  id: `run-${outcome}`, scheduleId: 'schedule-story', ranAt: accepted, trigger: 'schedule', outcome, ...fields,
});

export const RecoveryAndResults: Story = { args: { runs: [
  receipt('queued', { attempts: 0, dueAt: '2026-11-09T09:00:00Z' }),
  receipt('running', { attempts: 1, startedAt: accepted }),
  receipt('interrupted', { attempts: 2, nextAttemptAt: '2026-11-09T10:05:00Z', detail: 'Work creation was interrupted; recovery will retry this intent.' }),
  receipt('created', { attempts: 1, taskId: 'task-story', completedAt: '2026-11-09T10:00:04Z' }),
  receipt('skipped', { detail: "The previous run's task RELEASE-104 is still open." }),
  receipt('failed', { detail: 'The original run author or credential no longer has permission to create this work.' }),
  receipt('cancelled', { detail: 'The schedule was deleted before work creation committed.' }),
  receipt('unrecognized-result', { detail: 'A future server result retains readable neutral styling.' }),
] } };
export const Empty: Story = { render: args => <ListState isLoading={false} isEmpty error={null} emptyMessage="It has not run yet."><RunHistory {...args} /></ListState> };
export const Loading: Story = { render: args => <ListState isLoading isEmpty={false} error={null} loadingMessage="Loading runs…" emptyMessage="It has not run yet."><RunHistory {...args} /></ListState> };
export const PermissionDenied: Story = { render: args => <ListState isLoading={false} isEmpty={false} error={new Error('Permission denied. Ask your workspace administrator for access.')} errorLabel="Could not load runs" emptyMessage="It has not run yet." onRetry={() => undefined}><RunHistory {...args} /></ListState> };
