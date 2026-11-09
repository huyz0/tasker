import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ArtifactService, CommentService, LabelService, MemoryService, ProjectService, SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ArtifactsBrowser } from '../features/Artifacts';
import { MemoryExplorer } from '../features/Memory';
import { mockRpc, mockRpcError } from '../test/mockRpc';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScopeSync } from './useScope';

function ArtifactHarness() { useScopeSync(); return <ArtifactsBrowser />; }
function MemoryHarness() { useScopeSync(); return <MemoryExplorer />; }
const artifact = { id: 'artifact-b', folderId: 'folder-b', name: 'Artifact B', description: 'Metadata', contentType: 'text/markdown' };
const belief = (scopeType: string, scopeId: string) => ({ id: 'belief-b', orgId: 'o1', scopeType, scopeId,
  statement: 'Owned knowledge', confidence: 'high', status: 'active', sourceKind: 'user', createdAt: '2026-11-09T09:00:00Z', updatedAt: '2026-11-09T09:00:00Z' });

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
  mockRpc(ProjectService, 'GetProject', (body: { id: string }) => ({ project: { id: body.id, orgId: 'o1', name: body.id === 'p2' ? 'Project B' : 'Project A' } }));
  mockRpc(ArtifactService, 'ListFolders', (body: { projectId: string }) => ({ folders: body.projectId === 'p2'
    ? [{ id: 'folder-b', projectId: 'p2', name: 'Folder B' }] : [{ id: 'folder-a', projectId: 'p1', name: 'Folder A' }], page: {} }));
  mockRpc(ArtifactService, 'ListArtifacts', (body: { folderId: string }) => ({ artifacts: body.folderId === 'folder-b' ? [artifact] : [], page: {} }));
  mockRpc(ArtifactService, 'GetArtifact', { artifact, orgId: 'o1', projectId: 'p2' });
  mockRpc(ArtifactService, 'GetArtifactContent', { content: 'Artifact B body', contentType: 'text/markdown' });
  mockRpc(ArtifactService, 'ListTaskArtifactLinks', { links: [] });
  mockRpc(CommentService, 'ListComments', { comments: [] });
  mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
  mockRpc(LabelService, 'ListLabels', { labels: [] });
  mockRpc(SearchService, 'UniversalSearch', { results: [] });
  mockRpc(MemoryService, 'ListBeliefRelations', { relations: [] });
  mockRpc(MemoryService, 'ListBeliefPromotions', { promotions: [] });
  mockRpc(MemoryService, 'SearchBeliefs', { beliefs: [] });
  mockRpc(MemoryService, 'ListBeliefs', { beliefs: [], page: {} });
});

describe('authorized knowledge ownership drives navigation', () => {
  it('clears project ownership when explicitly choosing organization Memory', async () => {
    const view = renderScoped(<MemoryHarness />, { paths: ['/memory'], initialEntry: '/memory?org=o1&project=p1&scope=project' });
    fireEvent.click(await screen.findByRole('button', { name: 'organization' }));
    await waitFor(() => expect(new URLSearchParams(view.location.search).get('project')).toBeNull());
    expect(useLayoutStore.getState().activeProjectId).toBe('');
  });

  it('opens an artifact outside A folders under its B project without closing detail', async () => {
    const view = renderScoped(<ArtifactHarness />, {
      paths: ['/artifacts', '/artifacts/:artifactId'], initialEntry: '/artifacts/artifact-b?org=o1&project=p1',
    });
    await screen.findByText('Artifact B body');
    await waitFor(() => expect(new URLSearchParams(view.location.search).get('project')).toBe('p2'));
    expect(view.location.pathname).toBe('/artifacts/artifact-b');
    expect(useLayoutStore.getState().activeProjectId).toBe('p2');
    await screen.findAllByText('Folder B');
  });

  it('resolves an artifact direct link with no scope', async () => {
    const view = renderScoped(<ArtifactHarness />, { paths: ['/artifacts', '/artifacts/:artifactId'], initialEntry: '/artifacts/artifact-b' });
    await screen.findByText('Artifact B body');
    expect(view.location.search).toContain('project=p2');
    expect(view.location.search).toContain('org=o1');
  });

  it('does not rewrite an inaccessible artifact or reveal its name', async () => {
    mockRpcError(ArtifactService, 'GetArtifact', 'permission_denied', 'No artifact access');
    const view = renderScoped(<ArtifactHarness />, {
      paths: ['/artifacts', '/artifacts/:artifactId'], initialEntry: '/artifacts/artifact-b?org=o1&project=p1',
    });
    await screen.findByText(/No artifact access/);
    expect(screen.queryByText('Artifact B')).not.toBeInTheDocument();
    expect(view.location.url).toBe('/artifacts/artifact-b?org=o1&project=p1');
  });

  for (const [tier, owner] of [['project', 'p2'], ['organization', 'o1'], ['team', 'team-b']] as const) {
    it(`resolves ${tier} Memory before list-only scope guards`, async () => {
      mockRpc(MemoryService, 'GetBelief', { belief: belief(tier, owner) });
      const view = renderScoped(<MemoryHarness />, { paths: ['/memory', '/memory/:beliefId'], initialEntry: '/memory/belief-b' });
      await screen.findAllByText('Owned knowledge');
      await waitFor(() => expect(new URLSearchParams(view.location.search).get('scope')).toBe(tier));
      expect(view.location.pathname).toBe('/memory/belief-b');
      expect(new URLSearchParams(view.location.search).get('org')).toBe('o1');
      expect(new URLSearchParams(view.location.search).get('project')).toBe(tier === 'project' ? 'p2' : null);
      if (tier !== 'project') expect(useLayoutStore.getState().activeProjectId).toBe('');
      if (tier === 'team') expect(screen.queryByRole('button', { name: 'Record belief' })).not.toBeInTheDocument();
    });
  }
});
