import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import {
  TaskService, CommentService, LabelService, RepositoryService, TaskTypeService,
  TaskNoteService, OrgService, AgentService, ArtifactService, SearchService, ProjectService,
} from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TasksWorkbench } from '../features/Tasks';
import { mockRpc, mockRpcError, mockRpcPending } from '../test/mockRpc';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScopeSync } from './useScope';

let navigate: NavigateFunction;
function TaskHarness() {
  useScopeSync(); navigate = useNavigate();
  return <TasksWorkbench />;
}

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
  mockRpc(TaskService, 'ListTasks', { tasks: [], page: {} });
  mockRpc(TaskTypeService, 'ListTaskTypes', { taskTypes: [] });
  mockRpc(ProjectService, 'GetProject', (body: { id: string }) => ({ project: {
    id: body.id, orgId: 'o1', name: body.id === 'p2' ? 'Project B' : 'Project A',
  } }));
  mockRpc(CommentService, 'ListComments', { comments: [] });
  mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
  mockRpc(LabelService, 'ListLabels', { labels: [] });
  mockRpc(RepositoryService, 'ListPullRequests', { pullRequests: [] });
  mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [] });
  mockRpc(OrgService, 'ListOrgMembers', { members: [], page: {} });
  mockRpc(AgentService, 'ListAgents', { agents: [], page: {} });
  mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [] });
  mockRpc(TaskService, 'ListTaskLinks', { blockedBy: [], blocks: [], discovered: [], children: [] });
  mockRpc(ArtifactService, 'ListTaskArtifactLinks', { links: [] });
  mockRpc(SearchService, 'UniversalSearch', { results: [] });
  mockRpc(TaskService, 'ListInputRequests', { inputRequests: [], page: {} });
  mockRpc(TaskService, 'ListTransitionApprovals', { approvals: [], page: {} });
  mockRpc(TaskService, 'GetTask', { orgId: 'o1', task: {
    id: 'task-b', projectId: 'p2', title: 'Task in project B', status: 'todo', description: 'Owned by B',
  } });
});

describe('current authorized resource ownership drives task navigation', () => {
  for (const code of ['unavailable', 'permission_denied'] as const) {
    it(`surfaces an already-open task's ${code} read failure`, async () => {
      const view = renderScoped(<TaskHarness />, { paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b?org=o1&project=p1' });
      await screen.findByRole('heading', { name: 'Task in project B' });
      mockRpcError(TaskService, 'GetTask', code, 'Current task read failed');
      await act(async () => { await view.queryClient.invalidateQueries({ queryKey: ['task', 'task-b'] }); });
      expect(await screen.findByRole('alert')).toHaveTextContent('Current task read failed');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      if (code === 'permission_denied') expect(screen.queryByRole('heading', { name: 'Task in project B' })).not.toBeInTheDocument();
      else expect(screen.getByRole('heading', { name: 'Task in project B' })).toBeInTheDocument();
    });
  }

  it('cannot redirect a newer route when obsolete task ownership resolves late', async () => {
    const pending = mockRpcPending(TaskService, 'GetTask');
    const view = renderScoped(<TaskHarness />, { paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b?org=o1&project=p1' });
    await screen.findByText('Loading task…');
    act(() => navigate('/tasks?org=o2&project=p3'));
    pending.resolve({ orgId: 'o1', task: { id: 'task-b', projectId: 'p2', title: 'Obsolete B task', status: 'todo' } });
    await waitFor(() => expect(view.queryClient.getQueryData<{ id: string }>(['task', 'task-b'])?.id).toBe('task-b'));
    expect(view.location.url).toBe('/tasks?org=o2&project=p3');
    expect(useLayoutStore.getState().activeProjectId).toBe('p3');
    expect(screen.queryByRole('heading', { name: 'Obsolete B task' })).not.toBeInTheDocument();
  });

  it('normalizes a B task opened from A without closing it and Back returns to origin', async () => {
    const origin = '/tasks?org=o1&project=p1&view=table';
    const view = renderScoped(<TaskHarness />, { paths: ['/tasks', '/tasks/:taskId'], initialEntry: origin });
    await screen.findByRole('heading', { name: 'Tasks', level: 1 });
    act(() => navigate('/tasks/task-b?org=o1&project=p1&view=table#context'));
    await screen.findByRole('heading', { name: 'Task in project B' });
    await waitFor(() => expect(new URLSearchParams(view.location.search).get('project')).toBe('p2'));
    expect(view.location.pathname).toBe('/tasks/task-b');
    expect(useLayoutStore.getState().activeProjectId).toBe('p2');
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Project B'));
    act(() => navigate(-1));
    await waitFor(() => expect(view.location.url).toBe(origin));
    act(() => navigate(1));
    await screen.findByRole('heading', { name: 'Task in project B' });
    expect(view.location.search).toContain('view=table');
  });

  it('resolves a direct link with no incoming scope', async () => {
    const view = renderScoped(<TaskHarness />, { paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b' });
    await screen.findByRole('heading', { name: 'Task in project B' });
    await waitFor(() => expect(view.location.search).toContain('project=p2'));
    expect(new URLSearchParams(view.location.search).get('org')).toBe('o1');
    expect(view.location.pathname).toBe('/tasks/task-b');
  });

  it('does not normalize ownership or expose a title after a denied read', async () => {
    mockRpcError(TaskService, 'GetTask', 'permission_denied', 'No task access');
    const view = renderScoped(<TaskHarness />, {
      paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b?org=o1&project=p1',
    });
    await screen.findByText(/No task access/);
    expect(screen.queryByRole('heading', { name: 'Task in project B' })).not.toBeInTheDocument();
    expect(view.location.url).toBe('/tasks/task-b?org=o1&project=p1');
  });
  it('uses a bounded authorized project fallback for a legacy task response', async () => {
    mockRpc(TaskService, 'GetTask', { task: { id: 'task-b', projectId: 'p2', title: 'Legacy B task', status: 'todo' } });
    const view = renderScoped(<TaskHarness />, {
      paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b?org=o1&project=p1',
    });
    await screen.findByRole('heading', { name: 'Legacy B task' });
    expect(new URLSearchParams(view.location.search).get('project')).toBe('p2');
    expect(new URLSearchParams(view.location.search).get('org')).toBe('o1');
  });

  it('keeps legacy ownership unavailable when the project read is denied', async () => {
    mockRpc(TaskService, 'GetTask', { task: { id: 'task-b', projectId: 'p2', title: 'Legacy B task', status: 'todo' } });
    mockRpcError(ProjectService, 'GetProject', 'permission_denied', 'No project metadata');
    const view = renderScoped(<TaskHarness />, {
      paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b?org=o1&project=p1',
    });
    await screen.findByText(/No project metadata/);
    expect(screen.queryByRole('heading', { name: 'Legacy B task' })).not.toBeInTheDocument();
    expect(view.location.url).toBe('/tasks/task-b?org=o1&project=p1');
  });

  it('uses the authorized organization as well as project for a cross-organization task', async () => {
    mockRpc(TaskService, 'GetTask', { orgId: 'o2', task: { id: 'task-b', projectId: 'p2', title: 'Other organization task', status: 'todo' } });
    mockRpc(ProjectService, 'GetProject', { project: { id: 'p2', orgId: 'o2', name: 'Project B' } });
    const view = renderScoped(<TaskHarness />, {
      paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/task-b?org=o1&project=p1',
    });
    await screen.findByRole('heading', { name: 'Other organization task' });
    expect(new URLSearchParams(view.location.search).get('org')).toBe('o2');
    expect(useLayoutStore.getState().activeOrgId).toBe('o2');
    expect(useLayoutStore.getState().activeProjectId).toBe('p2');
  });

  it('does not expose a warm cached task when a new opening is denied', async () => {
    const origin = '/tasks?org=o1&project=p1';
    const view = renderScoped(<TaskHarness />, { paths: ['/tasks', '/tasks/:taskId'], initialEntry: origin });
    act(() => navigate('/tasks/task-b?org=o1&project=p1'));
    await screen.findByRole('heading', { name: 'Task in project B' });
    act(() => navigate(-1));
    await waitFor(() => expect(view.location.url).toBe(origin));
    mockRpcError(TaskService, 'GetTask', 'permission_denied', 'Access was removed');
    act(() => navigate('/tasks/task-b?org=o1&project=p2'));
    await screen.findByText(/Access was removed/);
    expect(screen.queryByRole('heading', { name: 'Task in project B' })).not.toBeInTheDocument();
    expect(view.location.url).toBe('/tasks/task-b?org=o1&project=p2');
  });

});
