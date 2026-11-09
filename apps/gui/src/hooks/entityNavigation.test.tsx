import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { OrgService, ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { OrgProjectSwitcher } from '../components/layout/OrgProjectSwitcher';
import { mockRpc, mockRpcPending } from '../test/mockRpc';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScopeSync, useSetScope, type Scope } from './useScope';

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
  mockRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'o1', name: 'Organization one' }], page: { totalCount: 1 } });
  mockRpc(ProjectService, 'ListProjects', { projects: [{ id: 'p1', orgId: 'o1', name: 'Project one' }], page: { totalCount: 1 } });
});

const paths = ['/tasks', '/tasks/:taskId', '/artifacts', '/artifacts/:artifactId', '/memory', '/memory/:beliefId'];
function ScopeWriter({ next, automatic = false }: { next: Partial<Scope>; automatic?: boolean }) {
  useScopeSync();
  const select = useSetScope(), navigate = useNavigate();
  return <>
    <button onClick={() => select(next, { replace: automatic })}>Choose scope</button>
    <button onClick={() => navigate(-1)}>Back</button>
  </>;
}

function Switcher() {
  useScopeSync();
  const navigate = useNavigate();
  return <><OrgProjectSwitcher /><button onClick={() => navigate('/tasks/task-b?org=o2&project=p2')}>Open off-page owner</button><button onClick={() => navigate('/memory?org=o1&scope=organization')}>Organization memory</button><button onClick={() => navigate('/tasks?org=o1')}>Open tasks</button></>;
}

describe('entity navigation distinguishes explicit selection from owner normalization', () => {
  for (const entity of ['tasks', 'artifacts']) {
    it(`selecting a project closes ${entity} detail in one history entry, while Back restores it`, () => {
      const view = renderScoped(<ScopeWriter next={{ projectId: 'p2' }} />, {
        paths, initialEntry: `/${entity}/entity-1?org=o1&project=p1&view=table`,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Choose scope' }));
      expect(view.location.pathname).toBe(`/${entity}`);
      expect(new URLSearchParams(view.location.search).get('project')).toBe('p2');
      expect(new URLSearchParams(view.location.search).get('view')).toBe('table');
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(view.location.url).toBe(`/${entity}/entity-1?org=o1&project=p1&view=table`);
    });
  }

  it('resumes automatic selection after leaving Memory for a screen that requires a project', async () => {
    const view = renderScoped(<Switcher />, { paths, initialEntry: '/memory/belief-1?org=o1&scope=organization' });
    fireEvent.click(await screen.findByRole('button', { name: 'Active project' }));
    await screen.findByRole('option', { name: 'Project one' });
    expect(new URLSearchParams(view.location.search).has('project')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open tasks' }));
    await waitFor(() => expect(new URLSearchParams(view.location.search).get('project')).toBe('p1'));
    expect(view.location.pathname).toBe('/tasks');
  });

  it('automatic scope normalization retains the entity route', () => {
    const view = renderScoped(<ScopeWriter next={{ projectId: 'p2' }} automatic />, {
      paths, initialEntry: '/tasks/task-b?org=o1&project=p1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose scope' }));
    expect(view.location.pathname).toBe('/tasks/task-b');
    expect(new URLSearchParams(view.location.search).get('project')).toBe('p2');
  });

  for (const tier of ['organization', 'team']) {
    it(`a deliberate project choice leaves ${tier} detail for that project's Memory`, () => {
      const view = renderScoped(<ScopeWriter next={{ projectId: 'p2' }} />, {
        paths, initialEntry: `/memory/belief-1?org=o1&scope=${tier}`,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Choose scope' }));
      expect(view.location.pathname).toBe('/memory');
      expect(new URLSearchParams(view.location.search).get('scope')).toBe('project');
      expect(new URLSearchParams(view.location.search).get('project')).toBe('p2');
    });

    it(`settled project choices do not overwrite intentional projectless ${tier} Memory`, async () => {
      const view = renderScoped(<Switcher />, { paths, initialEntry: `/memory/belief-1?org=o1&scope=${tier}` });
      fireEvent.click(await screen.findByRole('button', { name: 'Active project' }));
      await screen.findByRole('option', { name: 'Project one' });
      await waitFor(() => expect(useLayoutStore.getState().activeOrgId).toBe('o1'));
      expect(new URLSearchParams(view.location.search).has('project')).toBe(false);
      expect(useLayoutStore.getState().activeProjectId).toBe('');
      expect(view.location.pathname).toBe('/memory/belief-1');
    });
  }
});

describe('switcher ownership labels and same-org intent', () => {
  it('retains the project and task when reselecting the current organization', async () => {
    const view = renderScoped(<Switcher />, { paths, initialEntry: '/tasks/task-b?org=o1&project=p1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('Project one'));
    fireEvent.click(screen.getByRole('button', { name: 'Active organization' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Organization one' }));
    expect(view.location.url).toBe('/tasks/task-b?org=o1&project=p1');
    expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('Project one');
  });

  it('does not interrupt an in-flight initial project choice when reselecting its org', async () => {
    const pending = mockRpcPending(ProjectService, 'ListProjects');
    const view = renderScoped(<Switcher />, { paths, initialEntry: '/tasks?org=o1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Active organization' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Organization one' }));
    pending.resolve({ projects: [{ id: 'p1', orgId: 'o1', name: 'Project one' }], page: {} });
    await waitFor(() => expect(view.location.search).toContain('project=p1'));
    expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('Project one');
  });

  it('shows a project selection prompt after entering projectless Memory', async () => {
    const view = renderScoped(<Switcher />, { paths, initialEntry: '/tasks?org=o1&project=p1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('Project one'));
    fireEvent.click(screen.getByRole('button', { name: 'Organization memory' }));
    await waitFor(() => expect(view.location.search).not.toContain('project='));
    expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('Select project');
  });
});

describe('switcher labels follow owner identity beyond the loaded page', () => {
  it('never retains A labels after an off-page B owner resolves', async () => {
    const view = renderScoped(<Switcher />, { paths, initialEntry: '/tasks?org=o1&project=p1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('Project one'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Active organization' })).toHaveTextContent('Organization one'));
    fireEvent.click(screen.getByRole('button', { name: 'Open off-page owner' }));
    await waitFor(() => expect(view.location.search).toBe('?org=o2&project=p2'));
    expect(screen.getByRole('button', { name: 'Active project' })).not.toHaveTextContent('Project one');
    expect(screen.getByRole('button', { name: 'Active organization' })).not.toHaveTextContent('Organization one');
    expect(screen.getByRole('button', { name: 'Active project' })).toHaveTextContent('p2');
    expect(screen.getByRole('button', { name: 'Active organization' })).toHaveTextContent('o2');
  });
});
