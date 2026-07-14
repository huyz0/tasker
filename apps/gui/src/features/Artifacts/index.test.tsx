import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockListFolders,
  mockListArtifacts,
  mockArchiveFolder,
  mockArchiveArtifact,
  mockCreateFolder,
  mockCreateArtifact,
  mockListEntityLabels,
  mockListLabels,
} = vi.hoisted(() => ({
  mockListFolders: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockArchiveFolder: vi.fn(),
  mockArchiveArtifact: vi.fn(),
  mockCreateFolder: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockListEntityLabels: vi.fn(),
  mockListLabels: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'LabelService') return {
      listEntityLabels: mockListEntityLabels,
      listLabels: mockListLabels,
      attachLabel: vi.fn(),
      detachLabel: vi.fn(),
      createLabel: vi.fn(),
    };
    return {
      listFolders: mockListFolders,
      listArtifacts: mockListArtifacts,
      archiveFolder: mockArchiveFolder,
      archiveArtifact: mockArchiveArtifact,
      createFolder: mockCreateFolder,
      createArtifact: mockCreateArtifact,
    };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  ArtifactService: {},
  LabelService: 'LabelService',
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeProjectId: 'proj-1',
    activeOrgId: 'org-1',
  })),
}));

import { ArtifactsBrowser } from './index';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ArtifactsBrowser />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

describe('ArtifactsBrowser', () => {
  beforeEach(() => {
    mockListFolders.mockReset();
    mockListArtifacts.mockReset();
    mockArchiveFolder.mockReset();
    mockArchiveArtifact.mockReset();
    mockCreateFolder.mockReset();
    mockCreateArtifact.mockReset();
    mockListEntityLabels.mockReset();
    mockListEntityLabels.mockResolvedValue({ labels: [] });
    mockListLabels.mockReset();
    mockListLabels.mockResolvedValue({ labels: [] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('expands a folder and selects an artifact to view its content', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(screen.getByText('Hello world')).toBeDefined());
  });

  it('auto-loads later pages so folders and artifacts past the first page are not hidden', async () => {
    mockListFolders
      .mockResolvedValueOnce({ folders: [{ id: 'fld-1', name: 'Page One Folder', parentId: '' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ folders: [{ id: 'fld-2', name: 'Page Two Folder', parentId: '' }], page: {} });
    mockListArtifacts
      .mockResolvedValueOnce({ artifacts: [{ id: 'art-1', name: 'Page One Artifact', content: '' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ artifacts: [{ id: 'art-2', name: 'Page Two Artifact', content: '' }], page: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Folder')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Folder')).toBeDefined());
    expect(mockListFolders).toHaveBeenCalledWith({ projectId: 'proj-1', page: { cursor: 'cursor-2' } });

    fireEvent.click(screen.getByText('Page One Folder'));

    await waitFor(() => expect(screen.getByText('Page One Artifact')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Artifact')).toBeDefined());
    expect(mockListArtifacts).toHaveBeenCalledWith({ folderId: 'fld-1', page: { cursor: 'cursor-2' } });
  });

  it('archives a folder after confirmation', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockArchiveFolder.mockResolvedValue({});

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));

    await waitFor(() => expect(mockArchiveFolder).toHaveBeenCalledWith({ folderId: 'fld-1' }));
  });

  it('invalidates the Bin page query keys after archiving a folder, so the Bin view refreshes', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockArchiveFolder.mockResolvedValue({});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));

    await waitFor(() => expect(mockArchiveFolder).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders', 'bin', 'proj-1'] });
  });

  it('shows an empty-folder message when a selected folder has no artifacts', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => expect(screen.getByText('Empty folder')).toBeDefined());
  });

  it('creates a new folder via a real API call, using real data instead of a static placeholder', async () => {
    mockListFolders.mockResolvedValue({ folders: [] });
    mockCreateFolder.mockResolvedValue({ folder: { id: 'fld-new', projectId: 'proj-1', name: 'New Folder' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));

    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'New Folder' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(mockCreateFolder).toHaveBeenCalledWith({ projectId: 'proj-1', name: 'New Folder' }));
  });

  it('creates a new artifact within a selected folder via a real API call', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });
    mockCreateArtifact.mockResolvedValue({ artifact: { id: 'art-new', folderId: 'fld-1', name: 'notes.md' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => expect(screen.getByText('+ New artifact')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));

    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.change(input, { target: { value: 'notes.md' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(mockCreateArtifact).toHaveBeenCalledWith({ folderId: 'fld-1', name: 'notes.md' }));
  });
});
