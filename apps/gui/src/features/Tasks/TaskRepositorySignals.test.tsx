import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { RemotePullRequestSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskRepositorySignals } from './TaskRepositorySignals';

const recorded = create(RemotePullRequestSchema, { id: 'pr-1', taskId: 'task-1', title: 'Fix navigation', status: 'merged', url: 'https://github.com/example/project/pull/1', updatedAt: '2026-11-09T12:00:00Z' });
describe('recorded repository signals', () => {
  it('shows only this task’s recorded pull requests without claiming completion or provider freshness', () => {
    render(<TaskRepositorySignals taskId="task-1" records={[recorded, { ...recorded, id: 'pr-2', taskId: 'task-2', title: 'Other task' }]} state="ready" onRetry={() => {}} />);
    expect(screen.getByRole('link', { name: 'Fix navigation' })).toHaveAttribute('href', recorded.url);
    expect(screen.getByText('merged')).toBeVisible();
    expect(screen.getByText(/Last recorded/)).toBeVisible();
    expect(screen.queryByText('Other task')).not.toBeInTheDocument();
    expect(screen.getByText(/may be incomplete or out of date/)).toBeVisible();
  });
  it.each(['loading', 'error', 'denied'] as const)('hides cached records during %s', state => {
    render(<TaskRepositorySignals taskId="task-1" records={[recorded]} state={state} onRetry={() => {}} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('No linked pull requests recorded')).not.toBeInTheDocument();
  });
  it('uses a recorded-empty label and does not turn a dangerous URL into a link', () => {
    const { rerender } = render(<TaskRepositorySignals taskId="task-1" records={[]} state="ready" onRetry={() => {}} />);
    expect(screen.getByText('No linked pull requests recorded')).toBeVisible();
    rerender(<TaskRepositorySignals taskId="task-1" records={[{ ...recorded, url: 'javascript:alert(1)' }]} state="ready" onRetry={() => {}} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Fix navigation')).toBeVisible();
  });
});
