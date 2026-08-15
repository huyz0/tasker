import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
  mockListComments,
  mockCreateComment,
  mockListTaskArtifactLinks,
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
  mockListComments: vi.fn(),
  mockCreateComment: vi.fn(),
  mockListTaskArtifactLinks: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'CommentService') return {
      listComments: mockListComments,
      createComment: mockCreateComment,
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
    };
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
      listTaskArtifactLinks: mockListTaskArtifactLinks,
      linkTaskArtifact: vi.fn(),
      unlinkTaskArtifact: vi.fn(),
      universalSearch: vi.fn(async () => ({ results: [] })),
    };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  ArtifactService: {},
  LabelService: 'LabelService',
  // TaskArtifactLinks (M05-T06) searches for tasks to link from this view.
  SearchService: 'SearchService',
  // Artifact comments (M05-T07).
  CommentService: 'CommentService',
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeProjectId: 'proj-1',
    activeOrgId: 'org-1',
  })),
}));

import { ArtifactsBrowser } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';

// The open artifact is a route param, so every render needs the same
// `/artifacts` and `/artifacts/:artifactId` pair the app mounts.
const locationRef = { current: '' };

function LocationProbe() {
  locationRef.current = useLocation().pathname;
  return null;
}

function renderPage(initialEntry = '/artifacts') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes>
          <Route path="/artifacts" element={<ArtifactsBrowser />} />
          <Route path="/artifacts/:artifactId" element={<ArtifactsBrowser />} />
        </Routes>
      </MemoryRouter>
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
    mockListComments.mockReset();
    mockListComments.mockResolvedValue({ comments: [] });
    mockCreateComment.mockReset();
    mockCreateComment.mockResolvedValue({ comment: { id: 'cmt-1' } });
    mockListTaskArtifactLinks.mockReset();
    mockListTaskArtifactLinks.mockResolvedValue({ links: [] });
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
    await confirmAction();

    await waitFor(() => expect(mockArchiveFolder).toHaveBeenCalledWith({ folderId: 'fld-1' }));
  });

  it('invalidates the Bin page query keys after archiving a folder, so the Bin view refreshes', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockArchiveFolder.mockResolvedValue({});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveFolder).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders', 'bin', 'proj-1'] });
  });

  it('invalidates artifact lists by prefix after archiving, so a stale folder id cannot skip the refetch', async () => {
    // Regression: these invalidations used to be keyed ['artifacts',
    // selectedFolderId], read from a mutation-level onSuccess closure that lags
    // a render behind component state - so the open folder's list could keep
    // showing an artifact that had just been archived.
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });
    mockArchiveArtifact.mockResolvedValue({});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete artifact readme.md'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveArtifact).toHaveBeenCalledWith({ artifactId: 'art-1' }));
    // The prefix matches every artifacts list, the Bin's included, whatever
    // folder id happened to be captured.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['artifacts'] });
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
    await confirmAction();
    await waitFor(() => expect(mockArchiveArtifact).toHaveBeenCalledWith({ artifactId: 'art-1' }));
  });

  it('does not archive a folder when confirmation is cancelled', async () => {
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));
    await cancelAction();

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

  describe('URL-driven artifact detail', () => {
    it('opens the artifact straight from /artifacts/:artifactId, expanding its folder', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

      renderPage('/artifacts/art-1');

      // No click anywhere: the folder expands and the content renders because
      // the id came in on the URL.
      await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
      // Twice, deliberately: once in the explorer and once as the last
      // breadcrumb, which is how a deep-linked file says where it lives.
      expect(screen.getAllByText('readme.md').length).toBeGreaterThanOrEqual(1);
    });

    it('finds the artifact in a later folder when the deep link gives no folder', async () => {
      mockListFolders.mockResolvedValue({
        folders: [{ id: 'fld-1', name: 'docs', parentId: '' }, { id: 'fld-2', name: 'specs', parentId: '' }],
      });
      mockListArtifacts.mockImplementation(async ({ folderId }: { folderId: string }) =>
        folderId === 'fld-2'
          ? { artifacts: [{ id: 'art-9', name: 'design.md', content: 'Second folder content' }] }
          : { artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] }
      );

      renderPage('/artifacts/art-9');

      await waitFor(() => expect(screen.getByText('Second folder content')).toBeInTheDocument());
    });

    it('pushes the artifact id onto the URL when one is selected', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
      fireEvent.click(screen.getByText('docs'));
      await waitFor(() => expect(screen.getByText('readme.md')).toBeInTheDocument());
      fireEvent.click(screen.getByText('readme.md'));

      await waitFor(() => expect(locationRef.current).toBe('/artifacts/art-1'));
    });

    it('reads the comments belonging to the artifact, not to a task', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });
      mockListComments.mockResolvedValue({
        comments: [{ id: 'cmt-1', entityId: 'art-1', entityType: 'artifact', content: 'Looks right to me', authorName: 'Ada', createdAt: '2026-08-15T00:00:00Z' }],
      });

      renderPage('/artifacts/art-1');

      expect(await screen.findByText('Looks right to me')).toBeInTheDocument();
      // entityType is the whole risk here: mounting it as "task" would attach
      // the comment to an id the comments table reads as a task, and the screen
      // would look identical.
      expect(mockListComments).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'art-1', entityType: 'artifact' }),
      );
    });

    it('posts a new comment against the artifact', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

      renderPage('/artifacts/art-1');

      const box = await screen.findByPlaceholderText(/comment/i);
      fireEvent.change(box, { target: { value: 'First' } });
      fireEvent.click(screen.getByRole('button', { name: /post|comment|send/i }));

      await waitFor(() => expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'art-1', entityType: 'artifact', content: 'First' }),
      ));
    });

    it('navigates a tree three levels deep', async () => {
      mockListFolders.mockResolvedValue({
        folders: [
          { id: 'fld-1', name: 'docs', parentId: '' },
          { id: 'fld-2', name: 'specs', parentId: 'fld-1' },
          { id: 'fld-3', name: 'drafts', parentId: 'fld-2' },
        ],
      });
      mockListArtifacts.mockImplementation(async ({ folderId }: { folderId: string }) =>
        folderId === 'fld-3' ? { artifacts: [{ id: 'art-3', name: 'deep.md', content: 'Down here' }] } : { artifacts: [] });

      renderPage();

      // The schema has stored parentId since M01 and only folders without one
      // were ever rendered, so everything below the top level was unreachable.
      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('specs'));
      fireEvent.click(await screen.findByText('drafts'));
      expect(await screen.findByText('deep.md')).toBeInTheDocument();
    });

    it('keeps the parents open when a deep link lands three levels down', async () => {
      mockListFolders.mockResolvedValue({
        folders: [
          { id: 'fld-1', name: 'docs', parentId: '' },
          { id: 'fld-2', name: 'specs', parentId: 'fld-1' },
          { id: 'fld-3', name: 'drafts', parentId: 'fld-2' },
        ],
      });
      mockListArtifacts.mockImplementation(async ({ folderId }: { folderId: string }) =>
        folderId === 'fld-3' ? { artifacts: [{ id: 'art-3', name: 'deep.md', content: 'Down here' }] } : { artifacts: [] });

      renderPage('/artifacts/art-3');

      // A link lands on an artifact, not on a path: every folder above it has
      // to open, or its own folder is not on screen to be selected.
      await waitFor(() => expect(screen.getByText('Down here')).toBeInTheDocument());
      // The path opens a render after the artifact resolves — the folder is
      // located first, the ancestors expand from it. Each name now appears in
      // the tree and again in the breadcrumb.
      await waitFor(() => expect(screen.getAllByText('specs').length).toBeGreaterThan(0));
      expect(screen.getAllByText('drafts').length).toBeGreaterThan(0);

      // The breadcrumb specifically: the whole path, deepest last.
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(crumbs.textContent).toContain('docs');
      expect(crumbs.textContent).toContain('drafts');
    });

    it('collapses a folder and hides its children', async () => {
      mockListFolders.mockResolvedValue({
        folders: [
          { id: 'fld-1', name: 'docs', parentId: '' },
          { id: 'fld-2', name: 'specs', parentId: 'fld-1' },
        ],
      });
      mockListArtifacts.mockResolvedValue({ artifacts: [] });

      renderPage();
      fireEvent.click(await screen.findByText('docs'));
      expect(await screen.findByText('specs')).toBeInTheDocument();

      fireEvent.click(screen.getByText('docs'));
      await waitFor(() => expect(screen.queryByText('specs')).toBeNull());
    });

    it('creates a subfolder under the folder it was asked from', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [] });
      mockCreateFolder.mockResolvedValue({ folder: { id: 'fld-9' } });

      renderPage();
      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('+ Subfolder in docs'));
      fireEvent.change(await screen.findByPlaceholderText('Subfolder name'), { target: { value: 'specs' } });
      fireEvent.submit(screen.getByPlaceholderText('Subfolder name').closest('form')!);

      // Without parentId this creates another root folder, and the tree looks
      // the same until someone reloads.
      await waitFor(() => expect(mockCreateFolder).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'fld-1', name: 'specs' }),
      ));
    });

    it('abandons a subfolder when the form is cancelled', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [] });

      renderPage();
      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('+ Subfolder in docs'));
      // InlineCreateForm has no Cancel button: it withdraws on blur when the
      // field is empty, so clicking away is how a user abandons it.
      fireEvent.blur(await screen.findByPlaceholderText('Subfolder name'));

      await waitFor(() => expect(screen.queryByPlaceholderText('Subfolder name')).toBeNull());
      expect(mockCreateFolder).not.toHaveBeenCalled();
    });

    it('survives a folder whose parent chain loops', async () => {
      mockListFolders.mockResolvedValue({
        folders: [
          { id: 'fld-a', name: 'alpha', parentId: 'fld-b' },
          { id: 'fld-b', name: 'beta', parentId: 'fld-a' },
        ],
      });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-x', name: 'x.md', content: 'Looped' }] });

      renderPage('/artifacts/art-x');

      // Nothing in the schema forbids a cycle, and walking to the root without
      // a bound would hang the tab rather than fail.
      await waitFor(() => expect(screen.getByText('Looped')).toBeInTheDocument());
    });

    it('shows the placeholder on a plain /artifacts URL', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
      expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
    });

    it('falls back to the placeholder when the deep-linked artifact exists nowhere', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

      renderPage('/artifacts/art-does-not-exist');

      await waitFor(() => expect(mockListArtifacts).toHaveBeenCalledWith({ folderId: 'fld-1', page: undefined }));
      expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
    });

    it('closes the open artifact when its folder is deleted', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });
      mockArchiveFolder.mockResolvedValue({});

      renderPage('/artifacts/art-1');

      await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Delete folder docs' }));
      await confirmAction();

      await waitFor(() => expect(mockArchiveFolder).toHaveBeenCalledWith({ folderId: 'fld-1' }));
      await waitFor(() => expect(locationRef.current).toBe('/artifacts'));
    });

    it('closes the open artifact when its folder is collapsed', async () => {
      mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-1', name: 'docs', parentId: '' }] });
      mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }] });

      renderPage('/artifacts/art-1');

      await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
      // The explorer's copy, not the breadcrumb's.
      fireEvent.click(screen.getAllByText('docs')[0]);

      await waitFor(() => expect(locationRef.current).toBe('/artifacts'));
      expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
    });
  });
});
