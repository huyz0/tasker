import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { ArtifactService, CommentService, LabelService, MemoryService, ProjectService, SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ArtifactsBrowser } from '../features/Artifacts';
import { MemoryExplorer } from '../features/Memory';
import { mockRpc, mockRpcError, mockRpcPending } from '../test/mockRpc';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScopeSync } from './useScope';

function ArtifactHarness() { useScopeSync(); return <ArtifactsBrowser />; }
let navigate: NavigateFunction;
function MemoryHarness() { useScopeSync(); navigate = useNavigate(); return <MemoryExplorer />; }
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
    await waitFor(() => expect(view.location.search).toContain('project=p2'));
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

describe('knowledge navigation read recovery', () => {
  for (const kind of ['artifact', 'belief'] as const) {
    for (const code of ['unavailable', 'permission_denied'] as const) {
      it(`surfaces an already-open ${kind} ${code} failure`, async () => {
        mockRpc(MemoryService, 'GetBelief', { belief: belief('project', 'p2') });
        const artifactRead = kind === 'artifact';
        const view = renderScoped(artifactRead ? <ArtifactHarness /> : <MemoryHarness />, {
          paths: artifactRead ? ['/artifacts', '/artifacts/:artifactId'] : ['/memory', '/memory/:beliefId'],
          initialEntry: artifactRead ? '/artifacts/artifact-b' : '/memory/belief-b',
        });
        if (artifactRead) await screen.findByText('Artifact B body');
        else await screen.findByRole('region', { name: 'Belief detail' });
        if (artifactRead) mockRpcError(ArtifactService, 'GetArtifact', code, 'Current knowledge read failed');
        else mockRpcError(MemoryService, 'GetBelief', code, 'Current knowledge read failed');
        await act(async () => { await view.queryClient.invalidateQueries({ queryKey: artifactRead ? ['artifactLocate', 'artifact-b'] : ['memoryBelief', 'belief-b'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('Current knowledge read failed');
        if (code === 'permission_denied') {
          expect(screen.queryByText('Artifact B body')).not.toBeInTheDocument();
          expect(screen.queryByRole('region', { name: 'Belief detail' })).not.toBeInTheDocument();
        }
        if (artifactRead) mockRpc(ArtifactService, 'GetArtifact', { artifact, orgId: 'o1', projectId: 'p2' });
        else mockRpc(MemoryService, 'GetBelief', { belief: belief('project', 'p2') });
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        if (artifactRead) await screen.findByText('Artifact B body');
        else await screen.findByRole('region', { name: 'Belief detail' });
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      });
    }
  }

  it('does not rewrite a denied belief or expose its statement', async () => {
    mockRpcError(MemoryService, 'GetBelief', 'permission_denied', 'No belief access');
    const view = renderScoped(<MemoryHarness />, { paths: ['/memory', '/memory/:beliefId'], initialEntry: '/memory/belief-b?org=o1&project=p1' });
    await screen.findByText(/No belief access/);
    expect(screen.queryByText('Owned knowledge')).not.toBeInTheDocument();
    expect(view.location.url).toBe('/memory/belief-b?org=o1&project=p1');
  });

  it('ignores late ownership after leaving a belief for another organization', async () => {
    const pending = mockRpcPending(MemoryService, 'GetBelief');
    const view = renderScoped(<MemoryHarness />, { paths: ['/memory', '/memory/:beliefId'], initialEntry: '/memory/belief-b?org=o1&project=p1' });
    await screen.findByText('Loading this belief…');
    act(() => navigate('/memory?org=o2&scope=organization'));
    pending.resolve({ belief: belief('project', 'p2') });
    await waitFor(() => expect(view.queryClient.getQueryData<{ id: string }>(['memoryBelief', 'belief-b'])?.id).toBe('belief-b'));
    expect(view.location.url).toBe('/memory?org=o2&scope=organization');
    expect(useLayoutStore.getState().activeOrgId).toBe('o2');
    expect(screen.queryByRole('region', { name: 'Belief detail' })).not.toBeInTheDocument();
  });

  it('uses only a known authorized folder for legacy artifact ownership', async () => {
    mockRpc(ArtifactService, 'GetArtifact', { artifact: { ...artifact, folderId: 'folder-a' } });
    const view = renderScoped(<ArtifactHarness />, { paths: ['/artifacts', '/artifacts/:artifactId'], initialEntry: '/artifacts/artifact-b?org=o1&project=p1' });
    await screen.findByText('Artifact B body');
    expect(view.location.search).toContain('project=p1');
  });

  it('honestly rejects unsupported legacy artifact ownership without scans or empty-ID retries', async () => {
    const projects: unknown[] = [], folders: unknown[] = [];
    mockRpc(ArtifactService, 'GetArtifact', { artifact });
    mockRpc(ProjectService, 'GetProject', body => { projects.push(body); return {}; });
    mockRpc(ArtifactService, 'ListFolders', body => { folders.push(body); return { folders: [], page: {} }; });
    const view = renderScoped(<ArtifactHarness />, { paths: ['/artifacts', '/artifacts/:artifactId'], initialEntry: '/artifacts/artifact-b' });
    await screen.findByText(/Could not resolve this artifact/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/Could not resolve this artifact/);
    expect(projects).toEqual([]); expect(folders).toEqual([]);
    expect(view.location.url).toBe('/artifacts/artifact-b');
  });
});

describe('projectless Memory list ownership', () => {
  it('normalizes a cold organization Memory URL with an irrelevant project', async () => {
    const view = renderScoped(<MemoryHarness />, { paths: ['/memory'], initialEntry: '/memory?org=o1&project=p1&scope=organization' });
    await waitFor(() => expect(new URLSearchParams(view.location.search).has('project')).toBe(false));
    expect(useLayoutStore.getState().activeProjectId).toBe('');
  });
});

describe('legacy artifact dependency recovery', () => {
  for (const dependency of ['project', 'folders'] as const) {
    it(`retries failed ${dependency} metadata after a legacy artifact has opened`, async () => {
      mockRpc(ArtifactService, 'GetArtifact', { artifact: { ...artifact, folderId: 'folder-a' } });
      const view = renderScoped(<ArtifactHarness />, { paths: ['/artifacts', '/artifacts/:artifactId'], initialEntry: '/artifacts/artifact-b?org=o1&project=p1' });
      await screen.findByText('Artifact B body');
      if (dependency === 'project') mockRpcError(ProjectService, 'GetProject', 'unavailable', 'Legacy dependency offline');
      else mockRpcError(ArtifactService, 'ListFolders', 'unavailable', 'Legacy dependency offline');
      await act(async () => { await view.queryClient.invalidateQueries({ queryKey: dependency === 'project' ? ['project', 'p1'] : ['folders', 'p1'] }); });
      expect(await screen.findByRole('alert')).toHaveTextContent('Legacy dependency offline');
      mockRpc(ProjectService, 'GetProject', { project: { id: 'p1', orgId: 'o1', name: 'Project A' } });
      mockRpc(ArtifactService, 'ListFolders', { folders: [{ id: 'folder-a', projectId: 'p1', name: 'Folder A' }], page: {} });
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.getByText('Artifact B body')).toBeInTheDocument();
      expect(view.location.search).toContain('project=p1');
    });
  }
});
