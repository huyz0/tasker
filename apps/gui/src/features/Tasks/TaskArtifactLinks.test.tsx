import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskArtifactLinks } from './TaskArtifactLinks';

const mockList = vi.fn();
const mockLink = vi.fn();
const mockUnlink = vi.fn();
const mockSearch = vi.fn();

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  ArtifactService: 'ArtifactService',
  SearchService: 'SearchService',
}));
vi.mock('use-debounce', () => ({ useDebounce: (v: string) => [v] }));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: (service: unknown) =>
    service === 'SearchService'
      ? { universalSearch: (...a: unknown[]) => mockSearch(...a) }
      : {
          listTaskArtifactLinks: (...a: unknown[]) => mockList(...a),
          linkTaskArtifact: (...a: unknown[]) => mockLink(...a),
          unlinkTaskArtifact: (...a: unknown[]) => mockUnlink(...a),
        },
}));

const renderAt = (props: { taskId?: string; artifactId?: string }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TaskArtifactLinks {...props} orgId="org-1" />
    </QueryClientProvider>,
  );
};

const link = {
  id: 'tal-1',
  taskId: 'task-1',
  artifactId: 'art-1',
  artifactName: 'guide.md',
  taskTitle: 'Write the guide',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ links: [] });
  mockSearch.mockResolvedValue({
    results: [
      { id: 'art-2', type: 'artifact', title: 'notes.md', snippet: '' },
      { id: 'task-2', type: 'task', title: 'Ship it', snippet: '' },
    ],
  });
});

describe('TaskArtifactLinks', () => {
  it('asks for the task end when anchored on a task', async () => {
    renderAt({ taskId: 'task-1' });
    await waitFor(() => expect(mockList).toHaveBeenCalledWith({ taskId: 'task-1' }));
    expect(await screen.findByText('No linked artifacts')).toBeInTheDocument();
  });

  it('asks for the artifact end when anchored on an artifact', async () => {
    renderAt({ artifactId: 'art-1' });
    await waitFor(() => expect(mockList).toHaveBeenCalledWith({ artifactId: 'art-1' }));
    expect(await screen.findByText('Not linked to any task')).toBeInTheDocument();
  });

  it('shows the artifact name on a task, and the task title on an artifact', async () => {
    mockList.mockResolvedValue({ links: [link] });
    const { unmount } = renderAt({ taskId: 'task-1' });
    expect(await screen.findByText('guide.md')).toBeInTheDocument();
    unmount();

    renderAt({ artifactId: 'art-1' });
    // The same row, read from the other end — which is the whole reason both
    // names are resolved server-side.
    expect(await screen.findByText('Write the guide')).toBeInTheDocument();
  });

  it('asks for a query rather than opening onto everything', async () => {
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    expect(await screen.findByText('Type to search.')).toBeInTheDocument();
    // Opening a picker onto an unbounded list is the M05-T04 defect.
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('offers only artifacts when anchored on a task', async () => {
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByLabelText('Search artifacts'), { target: { value: 'n' } });
    expect(await screen.findByRole('button', { name: 'notes.md' })).toBeInTheDocument();
    // universalSearch returns both types; offering a task here would produce a
    // link between two tasks, which the relation cannot hold.
    expect(screen.queryByRole('button', { name: 'Ship it' })).toBeNull();
  });

  it('offers only tasks when anchored on an artifact', async () => {
    renderAt({ artifactId: 'art-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link a task…' }));
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 's' } });
    expect(await screen.findByRole('button', { name: 'Ship it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'notes.md' })).toBeNull();
  });

  it('links from the task end with the ids the right way round', async () => {
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByLabelText('Search artifacts'), { target: { value: 'n' } });
    fireEvent.click(await screen.findByRole('button', { name: 'notes.md' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith({ taskId: 'task-1', artifactId: 'art-2' }));
  });

  it('links from the artifact end with the ids the right way round', async () => {
    renderAt({ artifactId: 'art-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link a task…' }));
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 's' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Ship it' }));
    // Swapping these silently links the wrong pair, and both ids look alike.
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith({ taskId: 'task-2', artifactId: 'art-1' }));
  });

  it('does not offer something already linked', async () => {
    mockList.mockResolvedValue({ links: [{ ...link, artifactId: 'art-2', artifactName: 'notes.md' }] });
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByLabelText('Search artifacts'), { target: { value: 'n' } });
    // The server now treats a duplicate as success, so re-offering it would be
    // a click that appears to do nothing.
    expect(await screen.findByText('Every matching artifact is already linked.')).toBeInTheDocument();
  });

  it('tells "nothing matched" apart from "all matches are linked"', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByLabelText('Search artifacts'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No artifact matches that.')).toBeInTheDocument();
  });

  it('unlinks the pair, naming which', async () => {
    mockList.mockResolvedValue({ links: [link] });
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByLabelText('Unlink guide.md'));
    await waitFor(() => expect(mockUnlink).toHaveBeenCalledWith({ taskId: 'task-1', artifactId: 'art-1' }));
  });

  it('closes without linking when cancelled', async () => {
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Search artifacts')).toBeNull());
    expect(mockLink).not.toHaveBeenCalled();
  });

  it('reports a failed link', async () => {
    mockLink.mockRejectedValue(new Error('permission denied'));
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
    fireEvent.change(screen.getByLabelText('Search artifacts'), { target: { value: 'n' } });
    fireEvent.click(await screen.findByRole('button', { name: 'notes.md' }));
    expect(await screen.findByText(/Failed to link/)).toBeInTheDocument();
  });

  it('reports a failed unlink and keeps the row', async () => {
    mockList.mockResolvedValue({ links: [link] });
    mockUnlink.mockRejectedValue(new Error('nope'));
    renderAt({ taskId: 'task-1' });
    fireEvent.click(await screen.findByLabelText('Unlink guide.md'));
    expect(await screen.findByText(/Failed to unlink/)).toBeInTheDocument();
    // The link still exists, so the row still belongs there.
    expect(screen.getByText('guide.md')).toBeInTheDocument();
  });
});
