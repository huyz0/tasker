import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcPending } from '../test/mockRpc';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScopeLabels } from './useScopeLabels';

/**
 * The names a breadcrumb trail needs, resolved from the ids scope is made of
 * (M28-T07). `Tasks` used to run this query inline for its own crumb; four
 * trails need it now, so it lives in one place with one fallback.
 */

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
});

function LabelProbe() {
  const { projectName, hasProject } = useScopeLabels();
  return <p>{`project=${projectName} has=${String(hasProject)}`}</p>;
}

/** Registers GetProject and records every request it receives. */
function withGetProject(name = 'Seed Project') {
  const requests: unknown[] = [];
  mockRpc(ProjectService, 'GetProject', (body) => {
    requests.push(body);
    return { project: { id: 'proj-1', name } };
  });
  return requests;
}

describe('useScopeLabels', () => {
  it('resolves the active project’s name from its id', async () => {
    const requests = withGetProject();
    useLayoutStore.setState({ activeProjectId: 'proj-1' });
    renderScoped(<LabelProbe />, { paths: ['/tasks'], initialEntry: '/tasks?project=proj-1' });

    expect(await screen.findByText('project=Seed Project has=true')).toBeInTheDocument();
    // By id, not by listing every project to find one.
    expect(requests).toContainEqual({ id: 'proj-1' });
  });

  it('falls back to a generic label and asks for nothing when there is no project', () => {
    const requests = withGetProject();
    renderScoped(<LabelProbe />, { paths: ['/tasks'], initialEntry: '/tasks' });

    expect(screen.getByText('project=Project has=false')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('falls back to the generic label while the name is still loading', () => {
    // A crumb that renders nothing until the name arrives is a trail that
    // appears one item at a time; the fallback keeps the shape stable.
    mockRpcPending(ProjectService, 'GetProject');
    useLayoutStore.setState({ activeProjectId: 'proj-1' });
    renderScoped(<LabelProbe />, { paths: ['/tasks'], initialEntry: '/tasks?project=proj-1' });

    expect(screen.getByText('project=Project has=true')).toBeInTheDocument();
  });

  it('falls back to the generic label when the project answers with no name', async () => {
    withGetProject('');
    useLayoutStore.setState({ activeProjectId: 'proj-1' });
    renderScoped(<LabelProbe />, { paths: ['/tasks'], initialEntry: '/tasks?project=proj-1' });

    expect(await screen.findByText('project=Project has=true')).toBeInTheDocument();
  });
});
