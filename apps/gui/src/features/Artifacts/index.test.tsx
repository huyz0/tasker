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
  mockUpdateFolder,
  mockUpdateArtifactContent,
} = vi.hoisted(() => ({
  mockListFolders: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockArchiveFolder: vi.fn(),
  mockArchiveArtifact: vi.fn(),
  mockCreateFolder: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockListEntityLabels: vi.fn(),
  mockListLabels: vi.fn(),
  mockUpdateFolder: vi.fn(),
  mockUpdateArtifactContent: vi.fn(),
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
      updateFolder: mockUpdateFolder,
      updateArtifactContent: mockUpdateArtifactContent,
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
    mockUpdateFolder.mockReset();
    mockUpdateArtifactContent.mockReset();
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

  it('renames a folder through the GUI', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockUpdateFolder.mockResolvedValue({ folder: { id: 'fld-1', name: 'documents', parentId: '' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Rename folder docs'));

    const nameInput = screen.getByDisplayValue('docs');
    fireEvent.change(nameInput, { target: { value: 'documents' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateFolder).toHaveBeenCalledWith({ folderId: 'fld-1', name: 'documents' }));
  });

  it('cancels renaming a folder without saving', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Rename folder docs'));
    expect(screen.getByDisplayValue('docs')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(mockUpdateFolder).not.toHaveBeenCalled();
  });

  it('edits an artifact\'s content through the GUI', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }] });
    mockUpdateArtifactContent.mockResolvedValue({ artifact: { id: 'art-1', name: 'readme.md', content: 'Updated content', contentType: 'text/markdown' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(screen.getByText('Hello world')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit').at(-1)!);

    const textarea = screen.getByDisplayValue('Hello world');
    fireEvent.change(textarea, { target: { value: 'Updated content' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateArtifactContent).toHaveBeenCalledWith({ artifactId: 'art-1', content: 'Updated content' }));
  });

  it('cancels editing artifact content without saving', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(screen.getByText('Hello world')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit').at(-1)!);
    expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(mockUpdateArtifactContent).not.toHaveBeenCalled();
  });

  it('shows an error message when updating artifact content fails', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }] });
    mockUpdateArtifactContent.mockRejectedValue(new Error('artifact not found'));

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(screen.getByText('Hello world')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit').at(-1)!);
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to save/)).toBeInTheDocument());
  });

  it('does not show an Edit control for image artifacts', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'photo.png', content: 'base64data', contentType: 'image/png' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('photo.png')).toBeDefined());
    fireEvent.click(screen.getByText('photo.png'));

    await waitFor(() => expect(screen.getByText('photo.png', { selector: 'div' })).toBeInTheDocument());
    expect(screen.getAllByText('Edit')).toHaveLength(1);
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

  it('archives an artifact after confirmation and closes it if it was selected', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello' }] });
    mockArchiveArtifact.mockResolvedValue({});

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));
    await waitFor(() => expect(screen.getByText('Hello')).toBeDefined());

    fireEvent.click(screen.getByLabelText('Delete artifact readme.md'));
    await waitFor(() => expect(mockArchiveArtifact).toHaveBeenCalledWith({ artifactId: 'art-1' }));
  });

  it('does not archive a folder when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));

    expect(mockArchiveFolder).not.toHaveBeenCalled();
  });

  it('renders an image artifact using a data URI', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'pic.png', content: 'abc123', contentType: 'image/png' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('pic.png')).toBeDefined());
    fireEvent.click(screen.getByText('pic.png'));

    const img = await screen.findByAltText('pic.png');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  it('shows a placeholder message when the selected artifact has no content', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'empty.md', content: '' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('empty.md')).toBeDefined());
    fireEvent.click(screen.getByText('empty.md'));

    await waitFor(() => expect(screen.getByText('This artifact has no content.')).toBeDefined());
  });

  it('closes the new-folder form on blur when the name is empty', async () => {
    mockListFolders.mockResolvedValue({ folders: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.blur(input);

    await waitFor(() => expect(screen.queryByPlaceholderText('Folder name')).toBeNull());
  });

  it('closes the new-artifact form on blur when the name is empty', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('+ New artifact')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));
    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.blur(input);

    await waitFor(() => expect(screen.queryByPlaceholderText('Artifact name')).toBeNull());
  });

  it('selects a folder via keyboard Enter and toggles it off via Space', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.keyDown(screen.getByText('docs'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Empty folder')).toBeDefined());

    fireEvent.keyDown(screen.getByText('docs'), { key: ' ' });
    await waitFor(() => expect(screen.queryByText('Empty folder')).toBeNull());
  });

  it('keeps the new-folder form open on blur when there is unsaved text', async () => {
    mockListFolders.mockResolvedValue({ folders: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.blur(input);

    expect(screen.getByPlaceholderText('Folder name')).toBeInTheDocument();
  });

  it('does not create a folder when the form is submitted blank', async () => {
    mockListFolders.mockResolvedValue({ folders: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.submit(input.closest('form')!);

    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it('keeps the new-artifact form open on blur when there is unsaved text', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('+ New artifact')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));
    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.blur(input);

    expect(screen.getByPlaceholderText('Artifact name')).toBeInTheDocument();
  });

  it('does not create an artifact when the form is submitted blank', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('+ New artifact')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));
    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.submit(input.closest('form')!);

    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it('ignores non-activation keys on the folder and artifact rows', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: '' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.keyDown(screen.getByText('docs'), { key: 'Tab' });
    expect(screen.queryByText('readme.md')).toBeNull();

    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.keyDown(screen.getByText('readme.md'), { key: 'Tab' });
    expect(screen.queryByText('This artifact has no content.')).toBeNull();
  });

  it('hides the empty-folder message while the new-artifact form is open', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('Empty folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));

    expect(screen.queryByText('Empty folder')).toBeNull();
  });

  it('selects an artifact via keyboard Enter', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello there' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.keyDown(screen.getByText('readme.md'), { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Hello there')).toBeDefined());
  });
});
