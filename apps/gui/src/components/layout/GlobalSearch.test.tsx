import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcPending } from '../../test/mockRpc';
import { expectNoA11yViolations } from '../../test/a11y';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// useDebounce is mocked to apply the debounced value immediately, so tests
// don't need to deal with the real 300ms delay.
vi.mock('use-debounce', () => ({
  useDebounce: (value: string) => [value, { flush: vi.fn(), cancel: vi.fn() }],
}));

import { GlobalSearch, GlobalSearchTrigger, resultRoute, HighlightedSnippet } from './GlobalSearch';
import { useLayoutStore } from '../../store/layout';

/**
 * The real store, not a stub. The palette and its trigger are separate
 * components sharing one `searchOpen` — the whole point of M06-T03's split, and
 * a stubbed store would test the two halves in isolation and miss exactly the
 * defect that motivated it (two triggers, two dialogs).
 *
 * `AppShell` renders the trigger twice and the palette once; this mirrors that.
 */
function renderSearch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GlobalSearchTrigger />
        <GlobalSearchTrigger />
        <GlobalSearch />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The trigger is rendered twice, as in the shell. */
const clickTrigger = () => fireEvent.click(screen.getAllByText('Search tasks, artifacts...')[0]);

describe('GlobalSearch', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockRpc(SearchService, 'UniversalSearch', { results: [] });
    useLayoutStore.setState({ activeOrgId: 'org-1', searchOpen: false });
  });

  it('renders the closed search button by default', () => {
    renderSearch();
    expect(screen.getAllByText('Search tasks, artifacts...')).toHaveLength(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens one dialog no matter how many triggers are on the page', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    // Each trigger used to render its own palette with its own open state and
    // its own ⌘K listener, so the shortcut opened two stacked modal dialogs —
    // invisible until M06-T03 gave them `aria-modal` (ADR-0009).
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText('Search tasks, artifacts, projects, agents…')).toHaveLength(1);
  });

  it('opens the search dialog when the button is clicked', () => {
    renderSearch();
    clickTrigger();
    expect(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…')).toBeInTheDocument();
  });

  it('opens the search dialog on Cmd+K and closes it on Escape', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…')).toBeInTheDocument();

    // Dispatched at the document, which is where a real key press arrives:
    // Escape now belongs to `Dialog`, whose listener is a document capture
    // listener. An event dispatched straight at `window` has only `window` in
    // its propagation path and would reach nothing.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search tasks, artifacts, projects, agents…')).not.toBeInTheDocument();
  });

  it('closes the dialog when the close button is clicked', () => {
    renderSearch();
    clickTrigger();
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByPlaceholderText('Search tasks, artifacts, projects, agents…')).not.toBeInTheDocument();
  });

  it('shows a real keyboard legend before any query is typed, instead of a blank box', () => {
    renderSearch();
    clickTrigger();
    // Every shortcut named here has to actually work — a legend for a
    // shortcut that does nothing is the same defect as the placeholder that
    // used to promise "commands" this palette has never had.
    expect(screen.getByText(/Search across tasks, artifacts, projects, agents and comments\./)).toBeInTheDocument();
    expect(screen.getByText('to navigate')).toBeInTheDocument();
    expect(screen.getByText('to open')).toBeInTheDocument();
    expect(screen.getByText('to close')).toBeInTheDocument();
  });

  it('shows a loading state while the search request is in flight', async () => {
    const pending = mockRpcPending(SearchService, 'UniversalSearch');
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'foo' } });

    await waitFor(() => expect(screen.getByText('Searching...')).toBeInTheDocument());
    pending.resolve({ results: [] });
  });

  it('shows "No results found" when the search returns nothing for a non-empty query', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [] });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'nothing-matches' } });

    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument());
  });

  it('renders task and artifact results with their snippet', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [
        { id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: 'login flow' },
        { id: 'art-1', type: 'artifact', title: 'Design doc', snippet: '' },
      ],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });

    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());
    expect(screen.getByText('login flow')).toBeInTheDocument();
    expect(screen.getByText('Design doc')).toBeInTheDocument();
  });

  it('groups results by type with a count per section and a total', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [
        { id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: '' },
        { id: 'tsk-2', type: 'task', title: 'Fix logout bug', snippet: '' },
        { id: 'art-1', type: 'artifact', title: 'Design doc', snippet: '' },
      ],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());

    // One number the whole list adds up to, above the sections — the flat
    // list this replaced gave no sense of how much was cut off at 300px.
    expect(screen.getByText('3 results')).toBeInTheDocument();
    expect(screen.getByText('Tasks · 2')).toBeInTheDocument();
    expect(screen.getByText('Artifacts · 1')).toBeInTheDocument();
  });

  it('says "1 result", not "1 results"', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [{ id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: '' }],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });

    await waitFor(() => expect(screen.getByText('1 result')).toBeInTheDocument());
  });

  it('moves the highlight with ArrowDown/ArrowUp and opens the highlighted result on Enter', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [
        { id: 'tsk-1', type: 'task', title: 'First result', snippet: '' },
        { id: 'tsk-2', type: 'task', title: 'Second result', snippet: '' },
      ],
    });
    renderSearch();

    clickTrigger();
    const input = screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…');
    fireEvent.change(input, { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('First result')).toBeInTheDocument());

    // The first result is highlighted as soon as results arrive — the legend
    // promises "↵ to open" from the moment there is something to open.
    expect(screen.getByRole('option', { name: /First result/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Second result/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /First result/ })).toHaveAttribute('aria-selected', 'false');

    // Wraps rather than stopping at the end — the legend does not say
    // "…until you run out", and a palette that dead-ends on Down is worse
    // than one that loops.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /First result/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: /Second result/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/tasks/tsk-2');
    expect(screen.queryByPlaceholderText('Search tasks, artifacts, projects, agents…')).not.toBeInTheDocument();
  });

  it('moves the highlight to whatever the mouse hovers, sharing one source of truth with the keyboard', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [
        { id: 'tsk-1', type: 'task', title: 'First result', snippet: '' },
        { id: 'tsk-2', type: 'task', title: 'Second result', snippet: '' },
      ],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Second result')).toBeInTheDocument());

    fireEvent.mouseEnter(screen.getByRole('option', { name: /Second result/ }));
    expect(screen.getByRole('option', { name: /Second result/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /First result/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('passes the a11y audit with grouped results open', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [
        { id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: 'login flow' },
        { id: 'art-1', type: 'artifact', title: 'Design doc', snippet: '' },
      ],
    });
    const { container } = renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());

    await expectNoA11yViolations(container);
  });

  it('navigates to a task result and closes the dialog on click', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [{ id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: 'login flow' }],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Fix login bug'));
    expect(mockNavigate).toHaveBeenCalledWith(resultRoute({ type: 'task', id: 'tsk-1' }));
    expect(mockNavigate).toHaveBeenCalledWith('/tasks/tsk-1');
    expect(screen.queryByPlaceholderText('Search tasks, artifacts, projects, agents…')).not.toBeInTheDocument();
  });

  it('hides a result whose type this build has no route for, instead of offering a dead click', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [
        { id: 'tsk-1', type: 'task', title: 'Fix login bug', snippet: '' },
        { id: 'xyz-1', type: 'workflow', title: 'Some future type', snippet: '' },
      ],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });

    await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument());
    expect(screen.queryByText('Some future type')).not.toBeInTheDocument();
  });

  it('maps every result type the backend emits to a route, and nothing else', () => {
    // universalSearch pushes exactly these five types (search.handler.ts).
    expect(resultRoute({ type: 'task', id: 'tsk-1' })).toBe('/tasks/tsk-1');
    expect(resultRoute({ type: 'artifact', id: 'art-1' })).toBe('/artifacts/art-1');
    // Neither has a detail screen, so both land on their list. Routing a
    // project to `/projects/prj-1` would match no route and drop the user on
    // Not Found — a dead link that looks like a working one.
    expect(resultRoute({ type: 'project', id: 'prj-1' })).toBe('/projects');
    expect(resultRoute({ type: 'agent', id: 'agt-1' })).toBe('/agents');
    expect(resultRoute({ type: 'workflow', id: 'xyz-1' })).toBeNull();
  });

  describe('HighlightedSnippet', () => {
    it('marks the ranges the server points at, and leaves the rest as text', () => {
      render(<HighlightedSnippet text="the quarantine threshold" matches={[{ start: 4, length: 10 }]} />);
      const mark = screen.getByText('quarantine');
      expect(mark.tagName).toBe('MARK');
      // The surrounding text must survive intact — a highlighter that drops
      // the unmatched half is worse than no highlighting.
      expect(document.body).toHaveTextContent('the quarantine threshold');
    });

    it('renders plain text when there is nothing to mark', () => {
      render(<HighlightedSnippet text="nothing matched here" matches={[]} />);
      expect(document.body).toHaveTextContent('nothing matched here');
      expect(document.querySelector('mark')).toBeNull();
    });

    it('marks a term at the very start, and ignores a range that overlaps one already drawn', () => {
      render(
        <HighlightedSnippet
          text="quarantine threshold quarantine"
          matches={[{ start: 0, length: 10 }, { start: 5, length: 4 }, { start: 21, length: 10 }]}
        />,
      );
      // Three ranges in, two marks out: the middle one starts inside the first
      // and would nest, which is not something a browser renders sensibly.
      expect(document.querySelectorAll('mark')).toHaveLength(2);
      expect(document.body).toHaveTextContent('quarantine threshold quarantine');
    });

    it('ignores a range that does not address the string it was given', () => {
      // The server computes offsets against the snippet it sends, but a client
      // that renders whatever it is handed slices past the end and silently
      // drops the remainder.
      render(<HighlightedSnippet text="short" matches={[{ start: 2, length: 99 }]} />);
      expect(document.body).toHaveTextContent('short');
      expect(document.querySelector('mark')).toBeNull();
    });
  });

  it('routes a comment to the entity it hangs off, not to its own id', () => {
    // A comment has no screen. Its own id leads nowhere, which is why the
    // backend sends the parent alongside it.
    expect(resultRoute({ type: 'comment', id: 'cmt-1', parentType: 'task', parentId: 'tsk-9' })).toBe('/tasks/tsk-9');
    expect(resultRoute({ type: 'comment', id: 'cmt-2', parentType: 'artifact', parentId: 'art-9' })).toBe('/artifacts/art-9');
    // A comment with no parent is unroutable rather than routed to itself, so
    // it is filtered out instead of offering a click that goes nowhere.
    expect(resultRoute({ type: 'comment', id: 'cmt-3' })).toBeNull();
    // Same for a parent type this build cannot render. Comments can hang off
    // anything the backend decides to support later, so this is a live
    // defensive path rather than a theoretical one.
    expect(resultRoute({ type: 'comment', id: 'cmt-4', parentType: 'workflow', parentId: 'wf-1' })).toBeNull();
  });

  it('navigates to an artifact result on click', async () => {
    mockRpc(SearchService, 'UniversalSearch', {
      results: [{ id: 'art-1', type: 'artifact', title: 'Design doc', snippet: '' }],
    });
    renderSearch();

    clickTrigger();
    fireEvent.change(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…'), { target: { value: 'query' } });
    await waitFor(() => expect(screen.getByText('Design doc')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Design doc'));
    expect(mockNavigate).toHaveBeenCalledWith('/artifacts/art-1');
  });

  it('closes the dialog when clicking the backdrop overlay', () => {
    renderSearch();
    clickTrigger();
    expect(screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…')).toBeInTheDocument();

    // A test hook rather than a class name: the backdrop moved inside `Dialog`
    // in M06-T03 and its classes are styling, not contract.
    fireEvent.click(screen.getByTestId('dialog-backdrop'));

    expect(screen.queryByPlaceholderText('Search tasks, artifacts, projects, agents…')).not.toBeInTheDocument();
  });

  it('does not call universalSearch while the query is empty', () => {
    const requests: unknown[] = [];
    mockRpc(SearchService, 'UniversalSearch', (body) => {
      requests.push(body);
      return { results: [] };
    });
    renderSearch();
    clickTrigger();
    expect(requests).toHaveLength(0);
  });

  it('ignores ArrowDown/ArrowUp/Enter before there is anything to navigate', async () => {
    mockRpc(SearchService, 'UniversalSearch', { results: [] });
    renderSearch();
    clickTrigger();
    const input = screen.getByPlaceholderText('Search tasks, artifacts, projects, agents…');

    // No query yet — `data` is undefined, not an empty array.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();

    // A query that matches nothing — `data` is `[]`, the other half of the
    // guard. Either state must be a no-op, not a crash on `data[highlighted]`
    // over an array with nothing at index 0.
    fireEvent.change(input, { target: { value: 'nothing-matches' } });
    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument());
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
