import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { OrgService, ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { OrgProjectSwitcher } from '../components/layout/OrgProjectSwitcher';
import { mockRpc } from '../test/mockRpc';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScopeSync, useSetScope, type Scope } from './useScope';

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
  mockRpc(OrgService, 'ListOrgs', { orgs: [{ id: 'o1', name: 'Organization one' }], page: { totalCount: 1 } });
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

function Switcher() { useScopeSync(); return <OrgProjectSwitcher />; }

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
      await screen.findByRole('option', { name: 'Project one', exact: true });
      await waitFor(() => expect(useLayoutStore.getState().activeOrgId).toBe('o1'));
      expect(new URLSearchParams(view.location.search).has('project')).toBe(false);
      expect(useLayoutStore.getState().activeProjectId).toBe('');
      expect(view.location.pathname).toBe('/memory/belief-1');
    });
  }
});
