import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ArtifactService, LabelService, SearchService, CommentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';

let mockActiveProjectId = 'proj-1';
let mockActiveOrgId = 'org-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeProjectId() { return mockActiveProjectId; },
    get activeOrgId() { return mockActiveOrgId; },
  })),
}));

// The rich editor is lazy-loaded behind Suspense, so rendering the real one
// here would mean awaiting a chunk to assert on a text field. Its own
// RichMarkdownEditor.test.tsx already covers the value/onChange wiring
// against a mocked @mdxeditor/editor (ADR-0018); these tests only need
// something that holds text, so the Lazy wrapper stands in as a plain
// controlled textarea — the same substitution Tasks/index.test.tsx makes.
vi.mock('../../components/ui/LazyRichMarkdownEditor', () => ({
  LazyRichMarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
  ),
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

function page(initialEntry = '/artifacts') {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/artifacts" element={<ArtifactsBrowser />} />
        <Route path="/artifacts/:artifactId" element={<ArtifactsBrowser />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage(initialEntry = '/artifacts') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      {page(initialEntry)}
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

/**
 * Registers ListFolders, ListArtifacts, GetArtifact and GetArtifactContent
 * together from one fixture, mirroring how a test only has to declare each
 * artifact once. `artifacts` answers every ListArtifacts call regardless of
 * folderId (this file's own long-standing convention: most fixtures describe
 * one open folder at a time) — pass a function instead for folder-specific
 * behaviour.
 *
 * Content is deliberately withheld from the ListFolders/ListArtifacts/
 * GetArtifact responses and served only through GetArtifactContent, matching
 * the real backend (M07-T02): a listing's row is metadata-only so it stays
 * proportional to the number of files, not their size. A component that read
 * `.content` straight off a list row instead of fetching it would show
 * nothing here, the same as it would against the real server.
 */
function withProject(
  folders: any[] | ((body: any) => object),
  artifacts: any[] | ((body: { folderId?: string }) => object) = [],
) {
  const folderRequests: any[] = [];
  const artifactRequests: any[] = [];
  const stripContent = (a: any) => { const { content: _content, ...rest } = a; return rest; };
  const flatArtifacts = Array.isArray(artifacts) ? artifacts : [];

  mockRpc(ArtifactService, 'ListFolders', (body) => {
    folderRequests.push(body);
    return typeof folders === 'function' ? folders(body) : { folders };
  });
  mockRpc(ArtifactService, 'ListArtifacts', (body) => {
    artifactRequests.push(body);
    if (typeof artifacts === 'function') return artifacts(body);
    return { artifacts: artifacts.map(stripContent) };
  });
  mockRpc(ArtifactService, 'GetArtifact', (body: { artifactId: string }) => {
    const match = flatArtifacts.find((a) => a.id === body.artifactId);
    return { artifact: match ? stripContent(match) : undefined };
  });
  mockRpc(ArtifactService, 'GetArtifactContent', (body: { artifactId: string }) => {
    const match = flatArtifacts.find((a) => a.id === body.artifactId);
    return { content: match?.content ?? '', contentType: match?.contentType ?? 'text/markdown' };
  });

  return { folderRequests, artifactRequests };
}

describe('ArtifactsBrowser', () => {
  beforeEach(() => {
    mockActiveProjectId = 'proj-1';
    mockActiveOrgId = 'org-1';
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    mockRpc(LabelService, 'ListLabels', { labels: [] });
    mockRpc(CommentService, 'ListComments', { comments: [] });
    mockRpc(CommentService, 'CreateComment', { comment: { id: 'cmt-1' } });
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', { links: [] });
    mockRpc(SearchService, 'UniversalSearch', { results: [] });
  });

  it('expands a folder and selects an artifact to view its content', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(screen.getByText('Hello world')).toBeDefined());
  });

  it('auto-loads later folder pages, and pages artifacts on demand rather than fetching every page', async () => {
    const { folderRequests, artifactRequests } = withProject(
      (body: { page?: { cursor?: string } }) =>
        body.page?.cursor
          ? { folders: [{ id: 'fld-2', name: 'Page Two Folder', parentId: '' }], page: {} }
          : { folders: [{ id: 'fld-1', name: 'Page One Folder', parentId: '' }], page: { nextCursor: 'cursor-2' } },
      (body: { folderId?: string; page?: { cursor?: string } }) =>
        body.page?.cursor
          ? { artifacts: [{ id: 'art-2', name: 'Page Two Artifact' }], page: {} }
          : { artifacts: [{ id: 'art-1', name: 'Page One Artifact' }], page: { nextCursor: 'cursor-2' } },
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Folder')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Folder')).toBeDefined());
    expect(folderRequests).toContainEqual({ projectId: 'proj-1', page: { cursor: 'cursor-2' } });

    fireEvent.click(screen.getByText('Page One Folder'));

    // A folder is unbounded — the scale fixture puts 100,000 artifacts in one —
    // so later pages are fetched when asked for, not automatically (M07-T12).
    await waitFor(() => expect(screen.getByText('Page One Artifact')).toBeDefined());
    expect(screen.queryByText('Page Two Artifact')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Load more artifacts' }));

    await waitFor(() => expect(screen.getByText('Page Two Artifact')).toBeDefined());
    expect(artifactRequests).toContainEqual({ folderId: 'fld-1', page: { cursor: 'cursor-2' } });
  });

  it('archives a folder after confirmation', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'ArchiveFolder', (body) => {
      requests.push(body);
      return {};
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ folderId: 'fld-1' }));
  });

  it('invalidates the Bin page query keys after archiving a folder, so the Bin view refreshes', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
    mockRpc(ArtifactService, 'ArchiveFolder', {});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));
    await confirmAction();

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders', 'bin', 'proj-1'] }));
  });

  it('invalidates artifact lists by prefix after archiving, so a stale folder id cannot skip the refetch', async () => {
    // Regression: these invalidations used to be keyed ['artifacts',
    // selectedFolderId], read from a mutation-level onSuccess closure that lags
    // a render behind component state - so the open folder's list could keep
    // showing an artifact that had just been archived.
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
    );
    mockRpc(ArtifactService, 'ArchiveArtifact', {});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete artifact readme.md'));
    await confirmAction();

    // The prefix matches every artifacts list, the Bin's included, whatever
    // folder id happened to be captured.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['artifacts'] }));
  });

  it('renames a folder through the GUI', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'UpdateFolder', (body) => {
      requests.push(body);
      return { folder: { id: 'fld-1', name: 'documents', parentId: '' } };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Rename folder docs'));

    const nameInput = screen.getByDisplayValue('docs');
    fireEvent.change(nameInput, { target: { value: 'documents' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ folderId: 'fld-1', name: 'documents' }));
  });

  it('cancels renaming a folder without saving', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'UpdateFolder', (body) => {
      requests.push(body);
      return {};
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Rename folder docs'));
    expect(screen.getByDisplayValue('docs')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('edits an artifact\'s content through the GUI', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }],
    );
    const requests: any[] = [];
    mockRpc(ArtifactService, 'UpdateArtifactContent', (body) => {
      requests.push(body);
      return { artifact: { id: 'art-1', name: 'readme.md', content: 'Updated content', contentType: 'text/markdown' } };
    });

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

    await waitFor(() => expect(requests).toContainEqual({ artifactId: 'art-1', content: 'Updated content' }));
  });

  it('cancels editing artifact content without saving', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }],
    );
    const requests: any[] = [];
    mockRpc(ArtifactService, 'UpdateArtifactContent', (body) => {
      requests.push(body);
      return {};
    });

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
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when updating artifact content fails', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }],
    );
    mockRpcError(ArtifactService, 'UpdateArtifactContent', 'unknown', 'artifact not found');

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
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'photo.png', content: 'base64data', contentType: 'image/png' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('photo.png')).toBeDefined());
    fireEvent.click(screen.getByText('photo.png'));

    await waitFor(() => expect(screen.getByText('photo.png', { selector: 'div' })).toBeInTheDocument());
    expect(screen.getAllByText('Edit')).toHaveLength(1);
  });

  it('shows an empty-folder message when a selected folder has no artifacts', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => expect(screen.getByText('Empty folder')).toBeDefined());
  });

  it('creates a new folder via a real API call, using real data instead of a static placeholder', async () => {
    withProject([]);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'CreateFolder', (body) => {
      requests.push(body);
      return { folder: { id: 'fld-new', projectId: 'proj-1', name: 'New Folder' } };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));

    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'New Folder' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(requests).toContainEqual({ projectId: 'proj-1', name: 'New Folder' }));
  });

  it('creates a new artifact within a selected folder via a real API call', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'CreateArtifact', (body) => {
      requests.push(body);
      return { artifact: { id: 'art-new', folderId: 'fld-1', name: 'notes.md' } };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => expect(screen.getByText('+ New artifact')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));

    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.change(input, { target: { value: 'notes.md' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(requests).toContainEqual({ folderId: 'fld-1', name: 'notes.md' }));
  });

  it('archives an artifact after confirmation and closes it if it was selected', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello' }],
    );
    const requests: any[] = [];
    mockRpc(ArtifactService, 'ArchiveArtifact', (body) => {
      requests.push(body);
      return {};
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));
    await waitFor(() => expect(screen.getByText('Hello')).toBeDefined());

    fireEvent.click(screen.getByLabelText('Delete artifact readme.md'));
    await confirmAction();
    await waitFor(() => expect(requests).toContainEqual({ artifactId: 'art-1' }));
  });

  it('does not archive a folder when confirmation is cancelled', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'ArchiveFolder', (body) => {
      requests.push(body);
      return {};
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Delete folder docs'));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('renders an image artifact using a data URI', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'pic.png', content: 'abc123', contentType: 'image/png' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('pic.png')).toBeDefined());
    fireEvent.click(screen.getByText('pic.png'));

    const img = await screen.findByAltText('pic.png');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  it('shows a placeholder message when the selected artifact has no content', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'empty.md', content: '' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('empty.md')).toBeDefined());
    fireEvent.click(screen.getByText('empty.md'));

    await waitFor(() => expect(screen.getByText('This artifact has no content.')).toBeDefined());
  });

  it('closes the new-folder form on blur when the name is empty', async () => {
    withProject([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.blur(input);

    await waitFor(() => expect(screen.queryByPlaceholderText('Folder name')).toBeNull());
  });

  it('closes the new-artifact form on blur when the name is empty', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
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
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.keyDown(screen.getByText('docs'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Empty folder')).toBeDefined());

    fireEvent.keyDown(screen.getByText('docs'), { key: ' ' });
    await waitFor(() => expect(screen.queryByText('Empty folder')).toBeNull());
  });

  it('keeps the new-folder form open on blur when there is unsaved text', async () => {
    withProject([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.blur(input);

    expect(screen.getByPlaceholderText('Folder name')).toBeInTheDocument();
  });

  it('does not create a folder when the form is submitted blank', async () => {
    withProject([]);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'CreateFolder', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ Folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ Folder'));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.submit(input.closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('keeps the new-artifact form open on blur when there is unsaved text', async () => {
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
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
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
    const requests: any[] = [];
    mockRpc(ArtifactService, 'CreateArtifact', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('+ New artifact')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));
    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.submit(input.closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('ignores non-activation keys on the folder and artifact rows', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: '' }],
    );
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
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('Empty folder')).toBeDefined());
    fireEvent.click(screen.getByText('+ New artifact'));

    expect(screen.queryByText('Empty folder')).toBeNull();
  });

  it('selects an artifact via keyboard Enter', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello there' }],
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.keyDown(screen.getByText('readme.md'), { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Hello there')).toBeDefined());
  });

  describe('URL-driven artifact detail', () => {
    it('opens the artifact straight from /artifacts/:artifactId, expanding its folder', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        // folderId matters here specifically: it's what GetArtifact's locate
        // query (M07-T12) hands back to select the folder — without it the
        // content still loads (a separate, folder-independent query) but the
        // folder itself never visibly expands, which is exactly the gap this
        // test is meant to catch.
        [{ id: 'art-1', name: 'readme.md', folderId: 'fld-1', content: 'Hello world' }],
      );

      renderPage('/artifacts/art-1');

      // No click anywhere: the folder expands and the content renders because
      // the id came in on the URL.
      await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
      // Twice, deliberately: once in the explorer and once as the last
      // breadcrumb, which is how a deep-linked file says where it lives.
      expect(screen.getAllByText('readme.md').length).toBeGreaterThanOrEqual(1);
      // And the folder itself is genuinely the selected one, not just the
      // artifact resolved independently of it.
      expect(screen.getByText('+ New artifact')).toBeInTheDocument();
    });

    it('finds the artifact in a later folder when the deep link gives no folder', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }, { id: 'fld-2', name: 'specs', parentId: '' }],
        (body: { folderId?: string }) =>
          body.folderId === 'fld-2'
            ? { artifacts: [{ id: 'art-9', name: 'design.md' }] }
            : { artifacts: [{ id: 'art-1', name: 'readme.md' }] },
      );
      mockRpc(ArtifactService, 'GetArtifact', { artifact: { id: 'art-9', name: 'design.md', folderId: 'fld-2' } });
      mockRpc(ArtifactService, 'GetArtifactContent', { content: 'Second folder content', contentType: 'text/markdown' });

      renderPage('/artifacts/art-9');

      await waitFor(() => expect(screen.getByText('Second folder content')).toBeInTheDocument());
    });

    it('pushes the artifact id onto the URL when one is selected', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
      );

      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
      fireEvent.click(screen.getByText('docs'));
      await waitFor(() => expect(screen.getByText('readme.md')).toBeInTheDocument());
      fireEvent.click(screen.getByText('readme.md'));

      await waitFor(() => expect(locationRef.current).toBe('/artifacts/art-1'));
    });

    it('reads the comments belonging to the artifact, not to a task', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
      );
      const requests: any[] = [];
      mockRpc(CommentService, 'ListComments', (body) => {
        requests.push(body);
        return { comments: [{ id: 'cmt-1', entityId: 'art-1', entityType: 'artifact', content: 'Looks right to me', authorName: 'Ada', createdAt: '2026-08-15T00:00:00Z' }] };
      });

      renderPage('/artifacts/art-1');

      expect(await screen.findByText('Looks right to me')).toBeInTheDocument();
      // entityType is the whole risk here: mounting it as "task" would attach
      // the comment to an id the comments table reads as a task, and the screen
      // would look identical.
      expect(requests).toContainEqual(
        expect.objectContaining({ entityId: 'art-1', entityType: 'artifact' }),
      );
    });

    it('posts a new comment against the artifact', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
      );
      const requests: any[] = [];
      mockRpc(CommentService, 'CreateComment', (body) => {
        requests.push(body);
        return { comment: { id: 'cmt-1' } };
      });

      renderPage('/artifacts/art-1');

      const box = await screen.findByPlaceholderText(/comment/i);
      fireEvent.change(box, { target: { value: 'First' } });
      fireEvent.click(screen.getByRole('button', { name: /post|comment|send/i }));

      await waitFor(() => expect(requests).toContainEqual(
        expect.objectContaining({ entityId: 'art-1', entityType: 'artifact', content: 'First' }),
      ));
    });

    it('navigates a tree three levels deep', async () => {
      withProject(
        [
          { id: 'fld-1', name: 'docs', parentId: '' },
          { id: 'fld-2', name: 'specs', parentId: 'fld-1' },
          { id: 'fld-3', name: 'drafts', parentId: 'fld-2' },
        ],
        (body: { folderId?: string }) =>
          body.folderId === 'fld-3' ? { artifacts: [{ id: 'art-3', name: 'deep.md' }] } : { artifacts: [] },
      );

      renderPage();

      // The schema has stored parentId since M01 and only folders without one
      // were ever rendered, so everything below the top level was unreachable.
      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('specs'));
      fireEvent.click(await screen.findByText('drafts'));
      expect(await screen.findByText('deep.md')).toBeInTheDocument();
    });

    it('keeps the parents open when a deep link lands three levels down', async () => {
      withProject(
        [
          { id: 'fld-1', name: 'docs', parentId: '' },
          { id: 'fld-2', name: 'specs', parentId: 'fld-1' },
          { id: 'fld-3', name: 'drafts', parentId: 'fld-2' },
        ],
        (body: { folderId?: string }) =>
          body.folderId === 'fld-3' ? { artifacts: [{ id: 'art-3', name: 'deep.md' }] } : { artifacts: [] },
      );
      mockRpc(ArtifactService, 'GetArtifact', { artifact: { id: 'art-3', name: 'deep.md', folderId: 'fld-3' } });
      mockRpc(ArtifactService, 'GetArtifactContent', { content: 'Down here', contentType: 'text/markdown' });

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
      withProject(
        [
          { id: 'fld-1', name: 'docs', parentId: '' },
          { id: 'fld-2', name: 'specs', parentId: 'fld-1' },
        ],
        [],
      );

      renderPage();
      fireEvent.click(await screen.findByText('docs'));
      expect(await screen.findByText('specs')).toBeInTheDocument();

      fireEvent.click(screen.getByText('docs'));
      await waitFor(() => expect(screen.queryByText('specs')).toBeNull());
    });

    it('creates a subfolder under the folder it was asked from', async () => {
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
      const requests: any[] = [];
      mockRpc(ArtifactService, 'CreateFolder', (body) => {
        requests.push(body);
        return { folder: { id: 'fld-9' } };
      });

      renderPage();
      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('+ Subfolder in docs'));
      fireEvent.change(await screen.findByPlaceholderText('Subfolder name'), { target: { value: 'specs' } });
      fireEvent.submit(screen.getByPlaceholderText('Subfolder name').closest('form')!);

      // Without parentId this creates another root folder, and the tree looks
      // the same until someone reloads.
      await waitFor(() => expect(requests).toContainEqual(
        expect.objectContaining({ parentId: 'fld-1', name: 'specs' }),
      ));
    });

    it('abandons a subfolder when the form is cancelled', async () => {
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
      const requests: any[] = [];
      mockRpc(ArtifactService, 'CreateFolder', (body) => {
        requests.push(body);
        return {};
      });

      renderPage();
      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('+ Subfolder in docs'));
      // InlineCreateForm has no Cancel button: it withdraws on blur when the
      // field is empty, so clicking away is how a user abandons it.
      fireEvent.blur(await screen.findByPlaceholderText('Subfolder name'));

      await waitFor(() => expect(screen.queryByPlaceholderText('Subfolder name')).toBeNull());
      expect(requests).toHaveLength(0);
    });

    it('survives a folder whose parent chain loops', async () => {
      withProject(
        [
          { id: 'fld-a', name: 'alpha', parentId: 'fld-b' },
          { id: 'fld-b', name: 'beta', parentId: 'fld-a' },
        ],
        [{ id: 'art-x', name: 'x.md', content: 'Looped' }],
      );

      renderPage('/artifacts/art-x');

      // Nothing in the schema forbids a cycle, and walking to the root without
      // a bound would hang the tab rather than fail.
      await waitFor(() => expect(screen.getByText('Looped')).toBeInTheDocument());
    });

    it('shows the placeholder on a plain /artifacts URL', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
      );

      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
      expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
    });

    it('falls back to the placeholder when the deep-linked artifact exists nowhere', async () => {
      // GetArtifact answers the deep link in one call and returns the
      // folderId directly (M07-T12) — nothing here ever selects a folder to
      // list, so an unresolvable id never issues a ListArtifacts call at all.
      const getArtifactRequests: any[] = [];
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
      mockRpc(ArtifactService, 'GetArtifact', (body) => {
        getArtifactRequests.push(body);
        return { artifact: undefined };
      });

      renderPage('/artifacts/art-does-not-exist');

      await waitFor(() => expect(getArtifactRequests).toContainEqual({ artifactId: 'art-does-not-exist' }));
      expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
    });

    it('closes the open artifact when its folder is deleted', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', folderId: 'fld-1', content: 'Hello world' }],
      );
      const requests: any[] = [];
      mockRpc(ArtifactService, 'ArchiveFolder', (body) => {
        requests.push(body);
        return {};
      });

      renderPage('/artifacts/art-1');

      await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
      // Deleting the folder only closes the artifact when the folder is
      // recognized as the open one (`selectedFolderId === folderId`), which
      // is set asynchronously off the deep-link's own GetArtifact lookup.
      // "readme.md" alone isn't enough to wait on — the breadcrumb renders it
      // from `locatedArtifact` regardless of `selectedFolderId` — so wait
      // instead on something gated by `selectedFolderId === folder.id`
      // itself, like the folder's own artifact-creation control.
      await screen.findByText('+ New artifact');
      fireEvent.click(screen.getByRole('button', { name: 'Delete folder docs' }));
      await confirmAction();

      await waitFor(() => expect(requests).toContainEqual({ folderId: 'fld-1' }));
      await waitFor(() => expect(locationRef.current).toBe('/artifacts'));
    });

    it('closes the open artifact when its folder is collapsed', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', folderId: 'fld-1', content: 'Hello world' }],
      );

      renderPage('/artifacts/art-1');

      await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
      // Wait on something gated by `selectedFolderId === folder.id`, not
      // "readme.md" alone — the breadcrumb renders that from
      // `locatedArtifact` regardless of whether the folder is selected yet.
      await screen.findByText('+ New artifact');
      // The explorer's copy, not the breadcrumb's.
      fireEvent.click(screen.getAllByText('docs')[0]);

      await waitFor(() => expect(locationRef.current).toBe('/artifacts'));
      expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
    });
  });

  // M18-T06: description is a real field on Artifact with no GUI display -
  // set at upload time, it existed but was invisible everywhere in the
  // browser.
  it('shows an artifact\'s description when it has one', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world', description: 'The project overview' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    expect(await screen.findByText('The project overview')).toBeInTheDocument();
  });

  it('shows no description line for an artifact that has none', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));

    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
    expect(screen.queryByText('undefined')).toBeNull();
  });

  // M18-T06: neither the folder-rename input nor the content-edit textarea
  // had an accessible name - a screen reader announced only "text box" with
  // no indication of what either edits.
  it('gives the folder-rename input and the content-edit textarea an accessible name', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world', contentType: 'text/markdown' }],
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Rename folder docs'));
    expect(screen.getByLabelText('Folder name for docs')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));

    fireEvent.click(screen.getByText('docs'));
    await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
    fireEvent.click(screen.getByText('readme.md'));
    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Edit').at(-1)!);

    expect(screen.getByLabelText('Content of readme.md')).toBeInTheDocument();
  });

  // M18-T05: six of the seven mutations in this view never rendered their
  // error - a failed create/rename/delete left the form or button simply
  // un-pending, with nothing telling the user it didn't work.
  describe('mutation errors', () => {
    it('reports a failed folder creation', async () => {
      withProject([]);
      mockRpcError(ArtifactService, 'CreateFolder', 'permission_denied', 'permission denied');
      renderPage();

      fireEvent.click(await screen.findByText('+ Folder'));
      fireEvent.change(await screen.findByPlaceholderText('Folder name'), { target: { value: 'New Folder' } });
      fireEvent.click(screen.getByText('Add'));

      expect(await screen.findByText(/Failed to create folder:.*permission denied/)).toBeInTheDocument();
    });

    it('reports a failed subfolder creation', async () => {
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
      mockRpcError(ArtifactService, 'CreateFolder', 'unknown', 'name taken');
      renderPage();

      fireEvent.click(await screen.findByText('docs'));
      fireEvent.click(await screen.findByText('+ Subfolder in docs'));
      fireEvent.change(await screen.findByPlaceholderText('Subfolder name'), { target: { value: 'specs' } });
      fireEvent.submit(screen.getByPlaceholderText('Subfolder name').closest('form')!);

      expect(await screen.findByText(/Failed to create subfolder:.*name taken/)).toBeInTheDocument();
    });

    it('reports a failed folder deletion', async () => {
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
      mockRpcError(ArtifactService, 'ArchiveFolder', 'unknown', 'in use');
      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
      fireEvent.click(screen.getByLabelText('Delete folder docs'));
      await confirmAction();

      expect(await screen.findByText(/Failed to delete folder:.*in use/)).toBeInTheDocument();
    });

    it('reports a failed folder rename', async () => {
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }]);
      mockRpcError(ArtifactService, 'UpdateFolder', 'unknown', 'folder not found');
      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
      fireEvent.click(screen.getByLabelText('Rename folder docs'));
      fireEvent.change(screen.getByDisplayValue('docs'), { target: { value: 'documents' } });
      fireEvent.click(screen.getByText('Save'));

      expect(await screen.findByText(/Failed to rename folder:.*folder not found/)).toBeInTheDocument();
    });

    it('reports a failed artifact creation', async () => {
      withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
      mockRpcError(ArtifactService, 'CreateArtifact', 'unknown', 'name taken');
      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
      fireEvent.click(screen.getByText('docs'));
      fireEvent.click(await screen.findByText('+ New artifact'));
      fireEvent.change(await screen.findByPlaceholderText('Artifact name'), { target: { value: 'notes.md' } });
      fireEvent.click(screen.getByText('Add'));

      expect(await screen.findByText(/Failed to create artifact:.*name taken/)).toBeInTheDocument();
    });

    it('reports a failed artifact deletion', async () => {
      withProject(
        [{ id: 'fld-1', name: 'docs', parentId: '' }],
        [{ id: 'art-1', name: 'readme.md', content: 'Hello' }],
      );
      mockRpcError(ArtifactService, 'ArchiveArtifact', 'unknown', 'artifact locked');
      renderPage();

      await waitFor(() => expect(screen.getByText('docs')).toBeDefined());
      fireEvent.click(screen.getByText('docs'));
      await waitFor(() => expect(screen.getByText('readme.md')).toBeDefined());
      fireEvent.click(screen.getByLabelText('Delete artifact readme.md'));
      await confirmAction();

      expect(await screen.findByText(/Failed to delete artifact:.*artifact locked/)).toBeInTheDocument();
    });
  });

  it('disables the subfolder Add button only while its own request is in flight', async () => {
    // Regression: this read createFolderMutation's pending state, a
    // different mutation than the one this form submits to, so the button
    // never disabled while the subfolder request was actually running and a
    // double-click could fire it twice.
    withProject([{ id: 'fld-1', name: 'docs', parentId: '' }], []);
    const pending = mockRpcPending(ArtifactService, 'CreateFolder');
    renderPage();

    fireEvent.click(await screen.findByText('docs'));
    fireEvent.click(await screen.findByText('+ Subfolder in docs'));
    fireEvent.change(await screen.findByPlaceholderText('Subfolder name'), { target: { value: 'specs' } });
    fireEvent.submit(screen.getByPlaceholderText('Subfolder name').closest('form')!);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled());
    pending.resolve({ folder: { id: 'fld-9' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add' })).toBeNull());
  });

  // M18-T05: switching the active project changed what foldersData resolved
  // to, but nothing reset the locally-held selection - the sidebar tree
  // repainted for the new project while the main pane kept rendering
  // whatever folder/artifact was selected under the old one.
  it('closes the open artifact and collapses the tree when the active project changes', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>{page('/artifacts/art-1')}</QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());

    mockActiveProjectId = 'proj-2';
    rerender(<QueryClientProvider client={queryClient}>{page('/artifacts/art-1')}</QueryClientProvider>);

    await waitFor(() => expect(locationRef.current).toBe('/artifacts'));
    expect(screen.getByText('Select an artifact from the explorer to view its contents')).toBeInTheDocument();
  });

  it('does not reset the selection on an ordinary render - only when the project/org actually changes', async () => {
    withProject(
      [{ id: 'fld-1', name: 'docs', parentId: '' }],
      [{ id: 'art-1', name: 'readme.md', content: 'Hello world' }],
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>{page('/artifacts/art-1')}</QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());

    // Same project/org, just a re-render (e.g. an unrelated store update).
    rerender(<QueryClientProvider client={queryClient}>{page('/artifacts/art-1')}</QueryClientProvider>);

    expect(locationRef.current).toBe('/artifacts/art-1');
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });
});
